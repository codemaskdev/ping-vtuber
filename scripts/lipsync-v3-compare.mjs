// v2 against v3 from the code (the mouths each would draw), on phrases whose audio exists (author's prompt #18):
// closure score, the changes table, and every word whose mouths changed. Writes out/lipsync-v3/compare-<name>.txt.
//
//   npm run lipsync:v3-compare -- P1 P2 P3 H1 H2 H3 H4 --name seen
import fs from "node:fs";
import path from "node:path";
import { decode } from "../lib/audio.mjs";
import { lipsyncText } from "../lib/lipsync-text.mjs";
import { lipsyncV3 } from "../lib/lipsync-v3.mjs";
import { frameCount } from "../lib/lipsync-volume.mjs";
import { changesTable, closureScore, wordsOf } from "../lib/measure.mjs";
import { ROOT } from "../lib/spec.mjs";

const FPS = 30, args = process.argv.slice(2), phrases = args.filter((a) => /^[PH]\d+$/.test(a));
const ni = args.indexOf("--name"), name = ni >= 0 ? args[ni + 1] : "seen";
const v2rules = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "lipsync-text.json"), "utf8"));
const v3rules = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "lipsync-v3.json"), "utf8"));
const L = [], say = (s) => { L.push(s); console.log(s); };
const total = { v2: [0, 0], v3: [0, 0] };
for (const p of phrases) {
  const d = decode(path.join(ROOT, "audio", "dev", `${p}.mp3`)), n = frameCount(d.samples.length, d.sampleRate, FPS);
  const al = JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "raw", `${p}.align.json`), "utf8")).alignment;
  const m = { v2: lipsyncText(al, FPS, v2rules, n).mouths, v3: lipsyncV3(al, FPS, v3rules, n) };
  const v3 = m.v3; m.v3 = v3.mouths;
  say(`${p}: "${al.characters.join("")}", ${n} frames`);
  for (const v of ["v2", "v3"]) {
    const frames = m[v].map((mouth, f) => ({ t: f / FPS, mouth }));
    const c = closureScore(al, frames, FPS), t = changesTable(m[v], FPS);
    total[v][0] += c.hits; total[v][1] += c.of;
    say(`  ${v}: closure ${c.hits} of ${c.of}${c.of ? ` (${c.letters.map((x) => `${x.letter}@${x.start}${x.hit ? "" : " NOT rest"}`).join(", ")})` : ""}; changes ${t.changes} = ${t.perSecond}/s; ${["rest", "small", "open", "round", "wide"].map((s) => `${s} ${t.perShape[s] || 0}`).join(", ")}; shortest ${t.shortest}, median ${t.median}, 1-frame runs ${t.oneFrame}`);
  }
  if (v3.rescued.length) say(`  v3 rescued: ${v3.rescued.map((r) => `${r.letter}@${al.character_start_times_seconds[r.index]} → frame ${r.frame}${r.already ? " (already closure)" : ` (was ${r.was})`}`).join(", ")}`);
  for (const w of wordsOf(al)) {
    const f0 = Math.floor(w.start * FPS), f1 = Math.min(n - 1, Math.ceil(w.end * FPS) - 1);
    const a = m.v2.slice(f0, f1 + 1).join(" "), b = m.v3.slice(f0, f1 + 1).join(" ");
    if (a !== b) say(`  changed: ${w.word} (frames ${f0}..${f1}): v2 ${a} → v3 ${b}`);
  }
}
say(`total closure: v2 ${total.v2[0]} of ${total.v2[1]}, v3 ${total.v3[0]} of ${total.v3[1]}`);
fs.mkdirSync(path.join(ROOT, "out", "lipsync-v3"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "out", "lipsync-v3", `compare-${name}.txt`), L.join("\n") + "\n");

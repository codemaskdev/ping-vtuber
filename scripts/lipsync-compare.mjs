// Lip sync v1 against v2 on the development phrases (author's prompt #15): closure score, the run table, words.txt,
// out/lipsync-v2/P2-timeline.png with both mouth rows, side-by-side clips (v1 left, v2 right, labelled, same audio),
// and how much longer the mp3 inside each mp4 is than the decoded audio.
//
//   npm run lipsync:compare        (after npm run lipsync:clips for v1 and for --method v2)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { decode } from "../lib/audio.mjs";
import { drawText } from "../lib/font.mjs";
import { create, fillRect } from "../lib/image.mjs";
import { lipsyncText } from "../lib/lipsync-text.mjs";
import { frameCount, frameRms, lipsyncVolume } from "../lib/lipsync-volume.mjs";
import { writePng } from "../lib/png.mjs";
import { ROOT, rel } from "../lib/spec.mjs";

const FPS = 30, SHAPES = ["rest", "small", "open", "round", "wide"];
const volCfg = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "lipsync-volume.json"), "utf8"));
const rules = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "lipsync-text.json"), "utf8"));
const OUT = path.join(ROOT, "out", "lipsync-v2");
fs.mkdirSync(OUT, { recursive: true });
const report = [];
const say = (s) => { report.push(s); console.log(s); };

function runs(m) {
  const r = [];
  for (let i = 0, s = 0; i <= m.length; i++) if (i === m.length || m[i] !== m[s]) { r.push({ shape: m[s], len: i - s, at: s }); s = i; }
  return r;
}
function table(m) {
  const r = runs(m), lens = r.map((x) => x.len).sort((a, b) => a - b);
  const median = lens.length % 2 ? lens[(lens.length - 1) / 2] : (lens[lens.length / 2 - 1] + lens[lens.length / 2]) / 2;
  const changes = m.slice(1).filter((x, i) => x !== m[i]).length;
  return { changes, perSecond: changes / (m.length / FPS), perShape: Object.fromEntries(SHAPES.map((s) => [s, m.filter((x) => x === s).length])), shortest: lens[0], median, oneFrame: r.filter((x) => x.len === 1).length };
}
// For every m, b, p in the text: is the mouth rest in at least one frame overlapping that letter's time span?
function closures(align, m) {
  const out = [];
  align.characters.forEach((c, k) => {
    if (!/^[mbp]$/i.test(c)) return;
    const s = align.character_start_times_seconds[k], e = align.character_end_times_seconds[k];
    const frames = [];
    for (let f = Math.floor(s * FPS); f < m.length && f / FPS < e; f++) if (s < (f + 1) / FPS && e > f / FPS) frames.push(f);
    out.push({ letter: c, index: k, start: s, end: e, frames, hit: frames.some((f) => m[f] === "rest") });
  });
  return out;
}

const all = {};
for (const p of ["P1", "P2", "P3"]) {
  const d = decode(path.join(ROOT, "audio", "dev", `${p}.mp3`));
  const align = JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "dev", `${p}.align.json`), "utf8")).alignment;
  const n = frameCount(d.samples.length, d.sampleRate, FPS);
  const v1 = lipsyncVolume(d.samples, d.sampleRate, FPS, volCfg).mouths, v2r = lipsyncText(align, FPS, rules, n), v2 = v2r.mouths;
  all[p] = { d, align, v1, v2, v2r, rms: frameRms(d.samples, d.sampleRate, FPS) };
  say(`${p}: ${n} frames (${n / FPS} s), text "${align.characters.join("")}"`);
  for (const [name, m] of [["v1", v1], ["v2", v2]]) {
    const t = table(m), c = closures(align, m);
    say(`  ${name}: closure score ${c.filter((x) => x.hit).length} of ${c.length} (${c.map((x) => `${x.letter}@${x.start}${x.hit ? " rest" : " NOT rest"}`).join(", ")})`);
    say(`  ${name}: changes ${t.changes} = ${t.perSecond} per second; frames per shape ${SHAPES.map((s) => `${s} ${t.perShape[s]}`).join(", ")}; shortest run ${t.shortest}, median ${t.median}; one-frame runs ${t.oneFrame}`);
  }
}

// words.txt: every word, its letters with times, the letter's class and mouth, and v2's mouths on the word's frames.
const words = [];
for (const [p, { align, v2r }] of Object.entries(all)) {
  words.push(`${p}: ${align.characters.join("")}`);
  const ch = align.characters;
  for (let i = 0; i < ch.length; ) {
    if (!/[a-z]/i.test(ch[i])) { i++; continue; }
    let j = i;
    while (j < ch.length && /[a-z]/i.test(ch[j])) j++;
    const s = align.character_start_times_seconds[i], e = align.character_end_times_seconds[j - 1];
    const f0 = Math.floor(s * FPS), f1 = Math.min(v2r.mouths.length - 1, Math.ceil(e * FPS) - 1);
    words.push(`  ${ch.slice(i, j).join("")}  ${s}..${e} s, frames ${f0}..${f1}: ${v2r.mouths.slice(f0, f1 + 1).join(" ")}`);
    for (let k = i; k < j; k++) {
      const l = v2r.letters[k];
      words.push(`    ${ch[k]}  ${align.character_start_times_seconds[k]}..${align.character_end_times_seconds[k]}  ${l.cls} → ${rules.classes[l.cls].mouth}  (${l.rule})`);
    }
    i = j;
  }
}
fs.writeFileSync(path.join(OUT, "words.txt"), words.join("\n") + "\n");
say("out/lipsync-v2/words.txt");

// P2 timeline with both rows.
{
  const { rms, v1, v2, align } = all.P2, n = v1.length, PX = 18, L = 150, Wd = L + n * PX + 30;
  const TOP = 70, CH = 300, MH = 50, Hd = TOP + CH + 30 + 2 * (MH + 40) + 120;
  const img = create(Wd, Hd, [16, 16, 20, 255]);
  const INK = [230, 230, 236, 255], GRID = [60, 60, 70, 255], RED = [255, 77, 109, 255];
  const COL = { rest: [90, 90, 100, 255], small: [47, 230, 255, 255], open: [255, 212, 0, 255], round: [180, 120, 255, 255], wide: [80, 220, 120, 255] };
  drawText(img, "LIP SYNC V1 (LOUDNESS) AGAINST V2 (CHARACTER TIMINGS) - P2 - CHART, NOT CHARACTER ART", 10, 20, 2, INK);
  const maxR = Math.max(...rms), yOf = (v) => TOP + CH - 1 - Math.round((v / maxR) * (CH - 1));
  for (let f = 0; f <= n; f += 5) fillRect(img, L + f * PX, TOP, 1, Hd - TOP - 70, GRID);
  for (let f = 0; f < n; f++) { const y = yOf(rms[f]); fillRect(img, L + f * PX + 2, y, PX - 4, TOP + CH - y, RED); }
  for (const [v, c, label] of [[volCfg.restBelow, COL.small, `REST ${volCfg.restBelow}`], [volCfg.openFrom, COL.open, `OPEN ${volCfg.openFrom}`]]) { fillRect(img, L, yOf(v), n * PX, 2, c); drawText(img, label, 10, yOf(v) - 7, 2, c); }
  drawText(img, "RMS", 10, TOP, 2, INK);
  [["V1", v1], ["V2", v2]].forEach(([name, m], r) => {
    const y = TOP + CH + 30 + r * (MH + 40);
    drawText(img, name, 10, y + 16, 3, INK);
    for (let f = 0; f < n; f++) fillRect(img, L + f * PX + 1, y, PX - 2, MH, COL[m[f]]);
  });
  const ly = TOP + CH + 30 + 2 * (MH + 40) - 30;
  let lx = L;
  for (const s of SHAPES) { drawText(img, s.toUpperCase(), lx, ly, 2, COL[s]); lx += 110; }
  const ty = ly + 30;
  drawText(img, "TEXT", 10, ty, 2, INK);
  align.characters.forEach((c, k) => { const x = L + Math.round(align.character_start_times_seconds[k] * FPS * PX); fillRect(img, x, ty - 6, 1, 4, INK); drawText(img, c === " " ? "_" : c, x, ty + (k % 2) * 20, 2, INK); });
  for (let f = 0; f <= n; f += 15) drawText(img, `${f / FPS}S`, L + f * PX - 8, Hd - 30, 2, INK);
  const w = writePng(path.join(OUT, "P2-timeline.png"), img);
  say(`out/lipsync-v2/P2-timeline.png  ${Wd}x${Hd}  sha256 ${w.sha256}`);
}

// Side-by-side clips: v1 left, v2 right, a label strip drawn by code on top, the phrase's audio (stream copy).
const ffmpeg = execFileSync("ffmpeg", ["-version"]).toString().split("\n")[0];
for (const p of ["P1", "P2", "P3"]) {
  const label = create(2508, 90, [0, 0, 0, 0]);
  drawText(label, `V1 LOUDNESS - ${p}`, 30, 25, 6, [255, 255, 255, 255]);
  drawText(label, `V2 CHARACTER TIMINGS - ${p}`, 1254 + 30, 25, 6, [255, 255, 255, 255]);
  const labelFile = path.join(OUT, `${p}-label.png`);
  writePng(labelFile, label);
  const dest = path.join(OUT, `${p}-side-by-side.mp4`);
  const args = ["-v", "error", "-y", "-i", rel(path.join(ROOT, "out", "lipsync-v1", `${p}.video.mp4`)), "-i", rel(path.join(OUT, `${p}.video.mp4`)), "-i", rel(labelFile), "-i", `audio/dev/${p}.mp3`,
    "-filter_complex", "[0:v][1:v]hstack=inputs=2[s];[s][2:v]overlay=0:0[v]", "-map", "[v]", "-map", "3:a:0", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", rel(dest)];
  execFileSync("ffmpeg", args, { cwd: ROOT });
  say(`${rel(dest)}: ffmpeg ${args.join(" ")}`);
}
say(`side-by-side tool: ${ffmpeg} (video re-encoded with libx264 crf 18 for the hstack; audio stream copied)`);

// How much longer is the mp3 inside each mp4 than the decoded audio?
for (const dir of ["lipsync-v1", "lipsync-v2"]) for (const p of ["P1", "P2", "P3"]) {
  const f = path.join(ROOT, "out", dir, `${p}.mp4`);
  const inMp4 = Number(execFileSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=duration", "-of", "csv=p=0", f]).toString().trim());
  const decoded = all[p].d.samples.length / all[p].d.sampleRate;
  say(`${dir}/${p}.mp4: mp3 stream ${inMp4} s, decoded ${decoded} s, longer by ${inMp4 - decoded} s`);
}
fs.writeFileSync(path.join(OUT, "compare.txt"), report.join("\n") + "\n");

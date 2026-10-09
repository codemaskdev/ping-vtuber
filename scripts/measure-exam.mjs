// An exam with the frozen measurement method (scripts/measure.mjs as of 5332a8c, unchanged): v1 and v2 through its
// measureClip and reportLines, v3 through the same measureClip; the pixel mouths of every clip against the mouths
// the clip was built from; the summary per version with lib/measure.mjs summary() for v1, v2 and v3 alike.
//
//   npm run measure:exam -- H5 H6 H7 H8 --out H5-H8      out/measure/<out>.txt and one JSON per clip
import fs from "node:fs";
import path from "node:path";
import { decode } from "../lib/audio.mjs";
import { lipsyncV3 } from "../lib/lipsync-v3.mjs";
import { frameCount } from "../lib/lipsync-volume.mjs";
import { summary } from "../lib/measure.mjs";
import { ROOT } from "../lib/spec.mjs";
import { M, builtMouths, measureClip, reportLines, templates, WINDOW } from "./measure.mjs";

const args = process.argv.slice(2), phrases = args.filter((a) => /^[PH]\d+$/.test(a));
const oi = args.indexOf("--out"), outName = oi >= 0 ? args[oi + 1] : "exam";
const VERSIONS = ["v1", "v2", "v3"];
const v3Rules = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "lipsync-v3.json"), "utf8"));
const builtV3 = (p) => {
  const d = decode(path.join(ROOT, "audio", "dev", `${p}.mp3`)), n = frameCount(d.samples.length, d.sampleRate, M.fps);
  return [...lipsyncV3(JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "raw", `${p}.align.json`), "utf8")).alignment, M.fps, v3Rules, n).mouths, ...new Array(15).fill("rest")];
};
const dir = path.join(ROOT, "out", "measure");
fs.mkdirSync(dir, { recursive: true });
const results = [];
for (const p of phrases) for (const v of VERSIONS) {
  const r = measureClip(p, v);
  const built = v === "v3" ? builtV3(p) : builtMouths(p, v);
  r.drawList = { frames: built.length, disagree: built.map((m, k) => (m !== r.mouths[k] ? { frame: k, drawList: m, pixels: r.mouths[k] } : null)).filter(Boolean), ...(built.length !== r.mouths.length ? { lengthMismatch: [built.length, r.mouths.length] } : {}) };
  fs.writeFileSync(path.join(dir, `${p}-${v}.json`), JSON.stringify(r, null, 2) + "\n");
  results.push(r);
}
const lines = [`method: scripts/measure.mjs, lib/measure.mjs, measurement.json as frozen in 5332a8c`, `templates: ${Object.entries(templates()).map(([k, t]) => `${k} ${t.w}x${t.h}`).join("; ")}; window ${JSON.stringify(WINDOW)}`,
  ...reportLines(results).filter((l) => !/^v[12] /.test(l))];
for (const v of VERSIONS) {
  const rs = results.filter((r) => r.version === v);
  for (const kind of ["onsets", "ends"]) {
    const s = summary(rs.flatMap((r) => r[kind].map((x) => x.ms)));
    lines.push(`${v} ${kind}: count ${s.count}, median ${s.median} ms, largest |x| ${s.largestAbs} ms, within one frame ${s.withinOneFrame}, within 45 late / 125 early ${s.within45Late125Early}; not measured ${rs.flatMap((r) => r[kind].filter((x) => x.skipped)).length}`);
  }
  lines.push(`${v} closure: ${rs.reduce((a, r) => a + r.closure.hits, 0)} of ${rs.reduce((a, r) => a + r.closure.of, 0)}; one-frame runs ${rs.map((r) => `${r.phrase} ${r.table.oneFrame}`).join(", ")}; changes per second ${rs.map((r) => `${r.phrase} ${r.table.perSecond}`).join(", ")}`);
}
fs.writeFileSync(path.join(dir, `${outName}.txt`), lines.join("\n") + "\n");
console.log(lines.join("\n"));

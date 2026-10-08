// RMS per frame (30 fps) of the development phrases, as percentiles, to choose rig/lipsync-volume.json thresholds.
//
//   npm run lipsync:stats
import fs from "node:fs";
import path from "node:path";
import { decode } from "../lib/audio.mjs";
import { frameRms } from "../lib/lipsync-volume.mjs";
import { ROOT } from "../lib/spec.mjs";

const V = JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "voice.json"), "utf8"));
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
const all = [];
for (const p of Object.keys(V.phrases)) {
  const d = decode(path.join(ROOT, "audio", "dev", `${p}.mp3`));
  const rms = frameRms(d.samples, d.sampleRate, 30);
  all.push(...rms);
  const s = [...rms].sort((a, b) => a - b);
  console.log(`${p}: ${rms.length} frames; RMS p10 ${pct(s, 10)}, p25 ${pct(s, 25)}, p50 ${pct(s, 50)}, p75 ${pct(s, 75)}, p90 ${pct(s, 90)}, max ${s.at(-1)}`);
}
const s = all.sort((a, b) => a - b);
console.log(`all: ${s.length} frames; RMS p10 ${pct(s, 10)}, p20 ${pct(s, 20)}, p25 ${pct(s, 25)}, p30 ${pct(s, 30)}, p50 ${pct(s, 50)}, p60 ${pct(s, 60)}, p70 ${pct(s, 70)}, p75 ${pct(s, 75)}, p90 ${pct(s, 90)}, max ${s.at(-1)}`);
for (const [lo, hi] of [[0, 0.005], [0.005, 0.01], [0.01, 0.02], [0.02, 0.04], [0.04, 0.08], [0.08, 0.16], [0.16, 1]]) {
  console.log(`  RMS ${lo}..${hi}: ${s.filter((x) => x >= lo && x < hi).length} frames`);
}

// Compares two PNG-sequence renders frame by frame: sha256 of every file, and for frames that differ, how many pixels
// differ and by how much (largest channel difference, and mean absolute difference over all channels).
//
//   node scripts/frame-hashes.mjs out/render/clip-1 out/render/clip-2
import fs from "node:fs";
import path from "node:path";
import { readPng, sha256 } from "../lib/png.mjs";

const [a, b] = process.argv.slice(2);
const list = (d) => fs.readdirSync(d).filter((f) => f.endsWith(".png")).sort();
const fa = list(a), fb = list(b);
if (fa.length !== fb.length || fa.some((f, i) => f !== fb[i])) { console.log(`frame lists differ: ${fa.length} vs ${fb.length}`); process.exit(1); }
let same = 0;
const diffs = [];
for (const f of fa) {
  const ba = fs.readFileSync(path.join(a, f)), bb = fs.readFileSync(path.join(b, f));
  if (sha256(ba) === sha256(bb)) { same++; continue; }
  const ia = readPng(path.join(a, f)).img.data, ib = readPng(path.join(b, f)).img.data;
  let px = 0, max = 0, sum = 0;
  for (let i = 0; i < ia.length; i += 4) {
    let d = 0;
    for (let c = 0; c < 4; c++) { const v = Math.abs(ia[i + c] - ib[i + c]); sum += v; if (v > d) d = v; }
    if (d) px++;
    if (d > max) max = d;
  }
  diffs.push({ frame: f, pixelsDiffering: px, maxChannelDiff: max, meanAbsDiff: sum / ia.length });
}
console.log(`${fa.length} frames: ${same} identical by sha256, ${diffs.length} differ`);
for (const d of diffs) console.log(`  ${d.frame}: ${d.pixelsDiffering} px differ, max channel diff ${d.maxChannelDiff}, mean abs diff ${d.meanAbsDiff}`);
const hashes = fa.map((f) => `${f} ${sha256(fs.readFileSync(path.join(a, f)))}`);
fs.writeFileSync(path.join(path.dirname(a), `${path.basename(a)}.sha256.txt`), hashes.join("\n") + "\n");
fs.writeFileSync(path.join(path.dirname(b), `${path.basename(b)}.sha256.txt`), fb.map((f) => `${f} ${sha256(fs.readFileSync(path.join(b, f)))}`).join("\n") + "\n");
if (diffs.length) process.exitCode = 1;

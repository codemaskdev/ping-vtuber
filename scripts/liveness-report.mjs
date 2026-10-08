// Measures liveness over a run and draws out/liveness-timeline.png (a chart for the video, not character art):
// blink moments, the breathing curve, the tilt curve and the cursor state.
//
//   npm run liveness:report -- --seed 1 --seconds 60
import fs from "node:fs";
import path from "node:path";
import { drawText } from "../lib/font.mjs";
import { create, fillRect } from "../lib/image.mjs";
import { blinkSchedule, livenessAt, livenessParts } from "../lib/liveness.mjs";
import { writePng } from "../lib/png.mjs";
import { combine } from "../lib/pose.mjs";
import { neutralPose } from "../lib/rig.mjs";
import { ROOT } from "../lib/spec.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? Number(process.argv[i + 1]) : d; };
const seed = arg("--seed", 1), seconds = arg("--seconds", 60), FPS = 30, frames = seconds * FPS;
const rig = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "rig.json"), "utf8"));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "liveness.json"), "utf8"));

// Numbers.
const blinks = blinkSchedule(cfg, seed, seconds).filter((b) => b.start < seconds);
const starts = blinks.map((b) => b.start);
const intervals = starts.slice(1).map((s, i) => s - starts[i]);
const singleIntervals = blinks.slice(1).map((b, i) => [b, i]).filter(([b]) => !b.double).map(([b, i]) => b.start - blinks[i].start);
const parts = [], poses = [];
let closedFrames = 0;
for (let f = 0; f < frames; f++) {
  parts.push(livenessParts(cfg, seed, f, FPS));
  const p = combine(rig, neutralPose(rig), livenessAt(cfg, seed, f, FPS));
  poses.push(p);
  if (p.eyes === "closed") closedFrames++;
}
const maxAbs = (k) => Math.max(...poses.map((p) => Math.abs(p.head[k])));
console.log(`seed ${seed}, ${seconds} s at ${FPS} fps (${frames} frames)`);
console.log(`blinks starting in the run: ${blinks.length} (${blinks.filter((b) => b.double).length} of them the second of a double); frames with eyes closed: ${closedFrames}`);
console.log(`interval between blink starts: shortest ${Math.min(...intervals)} s, longest ${Math.max(...intervals)} s`);
console.log(`interval between blink starts, not counting the second of a double: shortest ${Math.min(...singleIntervals)} s, longest ${Math.max(...singleIntervals)} s`);
console.log(`largest |tilt| ${maxAbs("tilt")} deg; largest |x| ${maxAbs("x")} px; largest |y| ${maxAbs("y")} px (breathing included)`);
console.log(`limits: tilt ${rig.limits.headTiltDeg.join("..")} deg, x ${rig.limits.headShiftPx.x.join("..")} px, y ${rig.limits.headShiftPx.y.join("..")} px`);

// Chart: one pixel column per frame.
const L = 150, R = 30, TOP = 70, ROW = 150, GAP = 40, Wd = L + frames + R;
const rows = ["BLINKS", "BREATHING Y PX", "TILT DEG", "CURSOR"];
const Hd = TOP + rows.length * (ROW + GAP) + 40;
const img = create(Wd, Hd, [16, 16, 20, 255]);
const INK = [230, 230, 236, 255], GRID = [60, 60, 70, 255], CYAN = [47, 230, 255, 255], RED = [255, 77, 109, 255], YEL = [255, 212, 0, 255];
drawText(img, `PING LIVENESS - SEED ${seed} - ${seconds} S AT ${FPS} FPS - CHART, NOT CHARACTER ART`, L, 20, 3, INK);
rows.forEach((name, r) => {
  const y0 = TOP + r * (ROW + GAP);
  drawText(img, name, L, y0 - 22, 2, INK);
  fillRect(img, L, y0, frames, 1, GRID); fillRect(img, L, y0 + ROW - 1, frames, 1, GRID);
  for (let s = 0; s <= seconds; s += 5) fillRect(img, L + s * FPS, y0, 1, ROW, GRID);
});
const plot = (r, value, lo, hi, colour) => {
  const y0 = TOP + r * (ROW + GAP);
  fillRect(img, L, y0 + Math.round(((hi - 0) / (hi - lo)) * (ROW - 1)), frames, 1, [90, 90, 100, 255]);
  let prev = null;
  for (let f = 0; f < frames; f++) {
    const y = y0 + Math.round(((hi - value(f)) / (hi - lo)) * (ROW - 1));
    const a = prev === null ? y : Math.min(prev, y), b = prev === null ? y : Math.max(prev, y);
    fillRect(img, L + f, a, 1, b - a + 2, colour);
    prev = y;
  }
  drawText(img, `${hi}`, L - 60, y0, 2, INK); drawText(img, `${lo}`, L - 60, y0 + ROW - 14, 2, INK);
};
// Blinks: a bar for every frame with the eyes closed (yellow for the second of a double).
for (let f = 0; f < frames; f++) {
  const b = parts[f].blink;
  if (b) fillRect(img, L + f, TOP + 10, 1, ROW - 20, b.double ? YEL : CYAN);
}
const bd = cfg.breathing.depthPx / 2, tm = cfg.micro.tiltDeg;
plot(1, (f) => parts[f].breathY, -bd, bd, CYAN);
plot(2, (f) => parts[f].micro.tilt, -tm, tm, CYAN);
for (let f = 0; f < frames; f++) if (parts[f].cursor) fillRect(img, L + f, TOP + 3 * (ROW + GAP) + 30, 1, ROW - 60, RED);
for (let s = 0; s <= seconds; s += 5) drawText(img, `${s}S`, L + s * FPS - 8, Hd - 30, 2, INK);
const out = path.join(ROOT, "out", "liveness-timeline.png");
fs.mkdirSync(path.dirname(out), { recursive: true });
const w = writePng(out, img);
console.log(`out/liveness-timeline.png  ${Wd}x${Hd}  sha256 ${w.sha256}`);

// out/liveness-strip.png: the rendered frames of one blink side by side (one open frame before and after), labelled
// with frame numbers. Frame n (counted from 0, as lib/liveness.mjs counts) is the render's frame_<n + 1>.png.
//
//   npm run liveness:strip -- --seed 1 --render out/render/liveness-seed-1-run-1
import fs from "node:fs";
import path from "node:path";
import { drawText } from "../lib/font.mjs";
import { create, over, resample } from "../lib/image.mjs";
import { livenessAt } from "../lib/liveness.mjs";
import { readPng, writePng } from "../lib/png.mjs";
import { ROOT } from "../lib/spec.mjs";

const i = process.argv.indexOf("--seed"), seed = i >= 0 ? Number(process.argv[i + 1]) : 1;
const j = process.argv.indexOf("--render"), dir = path.join(ROOT, j >= 0 ? process.argv[j + 1] : `out/render/liveness-seed-${seed}-run-1`);
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "liveness.json"), "utf8"));
const FPS = 30, total = fs.readdirSync(dir).filter((f) => f.endsWith(".png")).length;
let first = -1;
for (let f = 0; f < total; f++) if (livenessAt(cfg, seed, f, FPS).eyes === "closed") { first = f; break; }
if (first < 0) throw new Error("no blink in the render");
let last = first;
while (last + 1 < total && livenessAt(cfg, seed, last + 1, FPS).eyes === "closed") last++;
const frames = [];
for (let f = Math.max(0, first - 1); f <= Math.min(total - 1, last + 1); f++) frames.push(f);
const CELL = 300, GAP = 12, BAND = 34, INK = [230, 230, 236, 255];
const sheet = create(frames.length * (CELL + GAP) + GAP, 60 + CELL + BAND + GAP, [16, 16, 20, 255]);
drawText(sheet, `PING - ONE BLINK, SEED ${seed} - FRAMES ${first} TO ${last} CLOSED`, GAP, 18, 3, INK);
frames.forEach((f, k) => {
  const img = readPng(path.join(dir, `frame_${String(f + 1).padStart(6, "0")}.png`)).img;
  const x = GAP + k * (CELL + GAP);
  over(sheet, resample(img, CELL, CELL), x, 60);
  drawText(sheet, `FRAME ${f} ${livenessAt(cfg, seed, f, FPS).eyes === "closed" ? "CLOSED" : "OPEN"}`, x, 60 + CELL + 10, 2, INK);
});
const out = path.join(ROOT, "out", "liveness-strip.png");
const w = writePng(out, sheet);
console.log(`out/liveness-strip.png  ${sheet.width}x${sheet.height}  frames ${frames.join(", ")} (closed ${first}..${last}, ${(first / FPS)} s to ${((last + 1) / FPS)} s)  sha256 ${w.sha256}`);

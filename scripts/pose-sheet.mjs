// out/pose-sheet.png from the HyperFrames render of the "pose-sheet" sequence (out/render/pose-sheet/frame_*.png):
// one labelled cell per pose, scaled down for viewing only. Brows as drawn and at browsRestDy sit side by side.
//
//   node scripts/build-preview.mjs pose-sheet
//   (cd rig/preview && npx --yes hyperframes@0.8.134 render --format png-sequence -o ../../out/render/pose-sheet)
//   node scripts/pose-sheet.mjs
import fs from "node:fs";
import path from "node:path";
import { drawText } from "../lib/font.mjs";
import { create, over, resample } from "../lib/image.mjs";
import { readPng, writePng } from "../lib/png.mjs";
import { ROOT } from "../lib/spec.mjs";
import { rig, rigSequences } from "./build-preview.mjs";

const entries = rigSequences()["pose-sheet"].entries.map((e) => e.label);
const dir = path.join(ROOT, "out", "render", "pose-sheet");
const frame = (label) => {
  const i = entries.indexOf(label);
  if (i < 0) throw new Error(`no pose ${label}`);
  return readPng(path.join(dir, `frame_${String(i + 1).padStart(6, "0")}.png`)).img;
};
const find = (prefix) => entries.find((e) => e.startsWith(prefix));
const ROWS = [
  ["neutral", "eyes closed", "cursor off", "neutral + skeleton"],
  ["mouth rest", "mouth small", "mouth open", "mouth round"],
  ["mouth wide", find("head tilt -"), find(`head tilt ${rig.limits.headTiltDeg[1]}`), find("head shift")],
  [find("brows as drawn"), find("brows at browsRestDy"), find("brows raised")],
];
const CELL = 314, GAP = 12, BAND = 30, TITLE = 60, INK = [230, 230, 236, 255];
const W = 4 * CELL + 5 * GAP, H = TITLE + ROWS.length * (CELL + BAND + GAP) + GAP;
const sheet = create(W, H, [16, 16, 20, 255]);
drawText(sheet, "PING RIG - POSE SHEET (HYPERFRAMES RENDER)", GAP, 18, 3, INK);
ROWS.forEach((row, r) => row.forEach((label, c) => {
  const x = GAP + c * (CELL + GAP), y = TITLE + r * (CELL + BAND + GAP);
  over(sheet, resample(frame(label), CELL, CELL), x, y);
  drawText(sheet, label.length > 26 ? label.slice(0, 26) : label, x, y + CELL + 8, 2, INK);
}));
const out = path.join(ROOT, "out", "pose-sheet.png");
const w = writePng(out, sheet);
console.log(`out/pose-sheet.png  ${W}x${H}  ${w.bytes} bytes  sha256 ${w.sha256}`);

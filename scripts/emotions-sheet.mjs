// out/emotions-sheet.png from the HyperFrames render of the "emotions-sheet" sequence: neutral and every state of
// rig/emotions.json, one labelled cell each (scaled for viewing only).
//
//   node scripts/build-preview.mjs emotions-sheet
//   (cd rig/preview && npx --yes hyperframes@0.8.134 render --format png-sequence -o ../../out/render/emotions-sheet)
//   node scripts/emotions-sheet.mjs
import path from "node:path";
import { drawText } from "../lib/font.mjs";
import { create, over, resample } from "../lib/image.mjs";
import { readPng, writePng } from "../lib/png.mjs";
import { ROOT } from "../lib/spec.mjs";
import { rigSequences } from "./build-preview.mjs";

const entries = rigSequences()["emotions-sheet"].entries.map((e) => e.label);
const CELL = 314, GAP = 12, BAND = 30, TITLE = 60, INK = [230, 230, 236, 255];
const sheet = create(entries.length * (CELL + GAP) + GAP, TITLE + CELL + BAND + GAP, [16, 16, 20, 255]);
drawText(sheet, "PING - EMOTIONS (HYPERFRAMES RENDER, NO LIVENESS)", GAP, 18, 3, INK);
entries.forEach((label, i) => {
  const img = readPng(path.join(ROOT, "out", "render", "emotions-sheet", `frame_${String(i + 1).padStart(6, "0")}.png`)).img;
  const x = GAP + i * (CELL + GAP);
  over(sheet, resample(img, CELL, CELL), x, TITLE);
  drawText(sheet, label, x, TITLE + CELL + 8, 2, INK);
});
const w = writePng(path.join(ROOT, "out", "emotions-sheet.png"), sheet);
console.log(`out/emotions-sheet.png  ${sheet.width}x${sheet.height}  sha256 ${w.sha256}`);

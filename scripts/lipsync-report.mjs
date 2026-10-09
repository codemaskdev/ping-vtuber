// Lip sync v1 numbers per phrase and out/lipsync-v1/P2-timeline.png (a chart for looking, not character art):
// the loudness curve, the thresholds, the mouth chosen for each frame, and the alignment's characters on the time axis.
//
//   npm run lipsync:report -- P1 P2 P3 --chart P2
import fs from "node:fs";
import path from "node:path";
import { decode } from "../lib/audio.mjs";
import { drawText } from "../lib/font.mjs";
import { create, fillRect } from "../lib/image.mjs";
import { lipsyncVolume } from "../lib/lipsync-volume.mjs";
import { writePng } from "../lib/png.mjs";
import { ROOT } from "../lib/spec.mjs";

const FPS = 30;
const args = process.argv.slice(2);
const ci = args.indexOf("--chart"), chartFor = ci >= 0 ? args[ci + 1] : null;
const phrases = args.filter((a, k) => /^P\d+$/.test(a) && args[k - 1] !== "--chart");
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "lipsync-volume.json"), "utf8"));
const SHAPES = ["rest", "small", "open"];

function analyse(p) {
  const d = decode(path.join(ROOT, "audio", "dev", `${p}.mp3`));
  const { rms, mouths } = lipsyncVolume(d.samples, d.sampleRate, FPS, cfg);
  const changes = mouths.slice(1).filter((m, i) => m !== mouths[i]).length;
  const runs = [];
  for (let i = 0, start = 0; i <= mouths.length; i++) if (i === mouths.length || mouths[i] !== mouths[start]) { runs.push({ shape: mouths[start], length: i - start, at: start }); start = i; }
  const lens = runs.map((r) => r.length).sort((a, b) => a - b);
  const median = lens.length % 2 ? lens[(lens.length - 1) / 2] : (lens[lens.length / 2 - 1] + lens[lens.length / 2]) / 2;
  // Open frames whose neighbours on both sides are below the rest threshold.
  const lonelyOpen = mouths.map((m, i) => i).filter((i) => mouths[i] === "open" && i > 0 && i < mouths.length - 1 && rms[i - 1] < cfg.restBelow && rms[i + 1] < cfg.restBelow);
  return { p, d, rms, mouths, changes, seconds: mouths.length / FPS, runs, lens, median, lonelyOpen };
}

const results = phrases.map(analyse);
for (const r of results) {
  const per = Object.fromEntries(SHAPES.map((s) => [s, r.mouths.filter((m) => m === s).length]));
  const oneFrame = r.runs.filter((x) => x.length === 1);
  console.log(`${r.p}: ${r.mouths.length} frames (${r.seconds} s of audio); mouth changes ${r.changes} = ${r.changes / r.seconds} per second`);
  console.log(`  frames per shape: rest ${per.rest}, small ${per.small}, open ${per.open}; round and wide: 0 (v1 has no such shapes)`);
  console.log(`  runs of one shape: ${r.runs.length}; shortest ${r.lens[0]} frames, median ${r.median} frames, longest ${r.lens.at(-1)}; runs of 1 frame: ${oneFrame.length} (${oneFrame.map((x) => `${x.shape}@${x.at}`).join(", ")})`);
  console.log(`  open frames between two frames under the rest threshold: ${r.lonelyOpen.length ? r.lonelyOpen.join(", ") : "none"}`);
}

if (chartFor) {
  const r = results.find((x) => x.p === chartFor) || analyse(chartFor);
  const align = JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "raw", `${chartFor}.align.json`), "utf8")).alignment;
  const PX = 18, L = 150, Rm = 30, n = r.mouths.length, Wd = L + n * PX + Rm;
  const TOP = 70, CH = 360, MH = 60, TXT = 70, Hd = TOP + CH + 30 + MH + 30 + TXT + 60;
  const img = create(Wd, Hd, [16, 16, 20, 255]);
  const INK = [230, 230, 236, 255], GRID = [60, 60, 70, 255], CYAN = [47, 230, 255, 255], RED = [255, 77, 109, 255], YEL = [255, 212, 0, 255];
  const COL = { rest: [90, 90, 100, 255], small: CYAN, open: YEL };
  drawText(img, `LIP SYNC V1 - ${chartFor} - LOUDNESS, THRESHOLDS, MOUTH PER FRAME, CHARACTERS - CHART, NOT CHARACTER ART`, 10, 20, 2, INK);
  const maxR = Math.max(...r.rms, cfg.openFrom * 1.5), yOf = (v) => TOP + CH - 1 - Math.round((v / maxR) * (CH - 1));
  fillRect(img, L, TOP, n * PX, 1, GRID); fillRect(img, L, TOP + CH - 1, n * PX, 1, GRID);
  for (let f = 0; f <= n; f += 5) fillRect(img, L + f * PX, TOP, 1, CH + 30 + MH, GRID);
  drawText(img, "RMS", 10, TOP, 2, INK);
  drawText(img, `${Math.round(maxR * 1000) / 1000}`, 10, TOP + 24, 2, INK);
  drawText(img, "0", 130, TOP + CH - 16, 2, INK);
  for (let f = 0; f < n; f++) {
    const y = yOf(r.rms[f]);
    fillRect(img, L + f * PX + 2, y, PX - 4, TOP + CH - y, RED);
  }
  // Thresholds over the bars, labelled in the left margin.
  for (const [v, c, label] of [[cfg.restBelow, CYAN, `REST ${cfg.restBelow}`], [cfg.openFrom, YEL, `OPEN ${cfg.openFrom}`]]) {
    fillRect(img, L, yOf(v), n * PX, 2, c);
    drawText(img, label, 10, yOf(v) - 7, 2, c);
  }
  const my = TOP + CH + 30;
  drawText(img, "MOUTH", 10, my + 20, 2, INK);
  for (let f = 0; f < n; f++) fillRect(img, L + f * PX + 1, my, PX - 2, MH, COL[r.mouths[f]]);
  drawText(img, "REST", L, my + MH + 6, 2, COL.rest); drawText(img, "SMALL", L + 80, my + MH + 6, 2, COL.small); drawText(img, "OPEN", L + 180, my + MH + 6, 2, COL.open);
  const ty = my + MH + 40;
  drawText(img, "TEXT", 10, ty, 2, INK);
  align.characters.forEach((ch, k) => {
    const x = L + Math.round(align.character_start_times_seconds[k] * FPS * PX);
    fillRect(img, x, ty - 6, 1, 4, INK);
    drawText(img, ch === " " ? "_" : ch, x, ty + (k % 2) * 20, 2, INK);
  });
  for (let f = 0; f <= n; f += 15) drawText(img, `${f / FPS}S`, L + f * PX - 8, Hd - 30, 2, INK);
  const file = path.join(ROOT, "out", "lipsync-v1", `${chartFor}-timeline.png`);
  const w = writePng(file, img);
  console.log(`out/lipsync-v1/${chartFor}-timeline.png  ${Wd}x${Hd}  sha256 ${w.sha256}`);
}

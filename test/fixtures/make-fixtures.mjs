// Makes TEST FIXTURE stand-ins for the generator images, so processing and checks can be tested before the real
// art exists. They are plain shapes, labelled TEST FIXTURE in the pixels and in a PNG text chunk, written only to
// test/fixtures/raw/, and the scripts refuse them as character art.
//
//   node test/fixtures/make-fixtures.mjs
//
// Each variant is drawn with a known shift and colour change, so the tests can check that the measurements find them.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drawText, textWidth } from "../../lib/font.mjs";
import { create } from "../../lib/image.mjs";
import { FIXTURE_KEY, FIXTURE_VALUE, writePng } from "../../lib/png.mjs";
import { intBelow, mulberry32 } from "../../lib/rng.mjs";
import { loadSpec } from "../../lib/spec.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE_RAW = path.join(here, "raw");

// Known distortions per raw: shift (content moves by +dx, +dy) and a flat colour change on every pixel.
export const DISTORTIONS = {
  "01-master.png": { dx: 0, dy: 0, tint: 0, seed: 1 },
  "02-head.png": { dx: 2, dy: -1, tint: 0, seed: 2 },
  "03-eyes_closed.png": { dx: 0, dy: 0, tint: 0, seed: 3 },
  "04-mouth_small.png": { dx: 1, dy: 1, tint: 0, seed: 4 },
  "05-mouth_open.png": { dx: 0, dy: 0, tint: 3, seed: 5 },
  "06-mouth_round.png": { dx: -3, dy: 2, tint: 0, seed: 6 },
  "07-mouth_wide.png": { dx: 0, dy: 0, tint: 0, seed: 7 },
};

const CYAN = [47, 230, 255];
const SCREEN = [6, 10, 20];
const LABEL = [255, 212, 0, 255];

// Face description per raw, in canvas coordinates for 1254 x 1254.
const FACES = {
  "01-master.png": { eyes: "open", brows: true, mouth: "rest" },
  "02-head.png": { eyes: null, brows: false, mouth: null },
  "03-eyes_closed.png": { eyes: "closed", brows: true, mouth: "rest" },
  "04-mouth_small.png": { eyes: "open", brows: true, mouth: "small" },
  "05-mouth_open.png": { eyes: "open", brows: true, mouth: "open" },
  "06-mouth_round.png": { eyes: "open", brows: true, mouth: "round" },
  "07-mouth_wide.png": { eyes: "open", brows: true, mouth: "wide" },
};

const HEAD = { x0: 188, y0: 188, x1: 1066, y1: 1066, r: 60, line: 14, glow: 40 };

// Distance from (x, y) to the rounded rectangle's edge region: negative inside, positive outside.
function roundedDist(x, y) {
  const cx = Math.min(Math.max(x, HEAD.x0 + HEAD.r), HEAD.x1 - HEAD.r);
  const cy = Math.min(Math.max(y, HEAD.y0 + HEAD.r), HEAD.y1 - HEAD.r);
  const dx = x - cx, dy = y - cy;
  return Math.sqrt(dx * dx + dy * dy) - HEAD.r;
}

function rect(img, x, y, w, h, rgb) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(img, xx, yy, rgb);
}
function frame(img, x, y, w, h, t, rgb) {
  rect(img, x, y, w, t, rgb); rect(img, x, y + h - t, w, t, rgb);
  rect(img, x, y, t, h, rgb); rect(img, x + w - t, y, t, h, rgb);
}
function ring(img, cx, cy, r, t, rgb) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d2 <= r * r && d2 >= (r - t) * (r - t)) put(img, x, y, rgb);
    }
  }
}
function put(img, x, y, rgb) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  img.data.set([rgb[0], rgb[1], rgb[2], 255], (y * img.width + x) * 4);
}

export function drawFixture(file, W, H) {
  const face = FACES[file], dist = DISTORTIONS[file];
  // Draw unshifted, then shift and tint while copying out.
  const img = create(W, H, [0, 0, 0, 255]);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = roundedDist(x, y);
      if (d <= -HEAD.line) put(img, x, y, SCREEN);
      else if (d <= 0) put(img, x, y, CYAN);
      else if (d < HEAD.glow) {
        const k = (HEAD.glow - d) / HEAD.glow / 2;
        put(img, x, y, CYAN.map((c) => Math.round(c * k)));
      }
    }
  }
  const eyeX = [477, 777];
  if (face.brows) for (const ex of eyeX) rect(img, ex - 49, 405, 98, 26, CYAN);
  if (face.eyes === "open") for (const ex of eyeX) rect(img, ex - 49, 511, 98, 156, CYAN);
  if (face.eyes === "closed") for (const ex of eyeX) rect(img, ex - 49, 579, 98, 20, CYAN);
  if (face.mouth === "rest") rect(img, 481, 819, 293, 18, CYAN);
  if (face.mouth === "small") frame(img, 481, 792, 293, 73, 14, CYAN);
  if (face.mouth === "open") frame(img, 481, 731, 293, 195, 14, CYAN);
  if (face.mouth === "round") ring(img, 627, 828, 73, 14, CYAN);
  if (face.mouth === "wide") frame(img, 408, 784, 439, 88, 14, CYAN);
  // Visible labels: inside the screen below the mouth band, and on the background above and below the head.
  const label = "TEST FIXTURE - NOT CHARACTER ART";
  const lx = (W - textWidth(label, 3)) >> 1;
  drawText(img, label, lx, 1010, 3, LABEL);
  drawText(img, label, lx, 120, 3, LABEL);
  drawText(img, label + " - " + file, (W - textWidth(label + " - " + file, 3)) >> 1, 1140, 3, LABEL);

  const rng = mulberry32(dist.seed);
  const out = create(W, H, [0, 0, 0, 255]);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = x - dist.dx, sy = y - dist.dy;
      const o = (y * W + x) * 4;
      const noise = intBelow(rng, 6);
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) { out.data[o] = out.data[o + 1] = out.data[o + 2] = noise; continue; }
      const i = (sy * W + sx) * 4;
      for (let c = 0; c < 3; c++) out.data[o + c] = Math.min(255, img.data[i + c] + dist.tint + noise);
    }
  }
  return out;
}

export function makeFixtures(dir = FIXTURE_RAW) {
  const spec = loadSpec();
  fs.mkdirSync(dir, { recursive: true });
  const written = [];
  for (const r of spec.raws) {
    const w = writePng(path.join(dir, r.file), drawFixture(r.file, spec.canvas.width, spec.canvas.height), { [FIXTURE_KEY]: FIXTURE_VALUE });
    written.push({ file: r.file, ...w });
  }
  return written;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const w of makeFixtures()) console.log(`test/fixtures/raw/${w.file}  ${w.bytes} bytes  sha256 ${w.sha256}`);
}

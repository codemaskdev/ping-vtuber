// Makes TEST FIXTURE stand-ins for the generator images, so processing and checks can be tested before the real
// art exists. They are plain shapes following the logo's geometry, labelled TEST FIXTURE in the pixels and in a PNG
// text chunk, written only to test/fixtures/, and the scripts refuse them as character art.
//
//   node test/fixtures/make-fixtures.mjs
//
// Each variant is drawn with a known shift, colour change or screen growth, so the tests can check that the
// measurements find them. The fixture canvas is deliberately not the size of any real generator output.
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
export const FIXTURE_SIZE = 800;

// Known distortions per raw: shift (content moves by +dx, +dy), flat colour change, screen grown by `grow` px a side.
export const DISTORTIONS = {
  "01-master.png": { dx: 0, dy: 0, tint: 0, grow: 0, seed: 1 },
  "02-head.png": { dx: 2, dy: -1, tint: 0, grow: 0, seed: 2 },
  "03-brows.png": { dx: 0, dy: 1, tint: 0, grow: 0, seed: 3 },
  "04-eyes_closed.png": { dx: 0, dy: 0, tint: 0, grow: 0, seed: 4 },
  "05-mouth_small.png": { dx: 1, dy: 1, tint: 0, grow: 0, seed: 5 },
  "06-mouth_open.png": { dx: 0, dy: 0, tint: 3, grow: 0, seed: 6 },
  "07-mouth_round.png": { dx: -3, dy: 2, tint: 0, grow: 0, seed: 7 },
  "08-mouth_wide.png": { dx: 0, dy: 0, tint: 0, grow: 3, seed: 8 },
};

const FACES = {
  "01-master.png": { eyes: "open", brows: false, mouth: "rest", cursor: true },
  "02-head.png": { eyes: null, brows: false, mouth: null, cursor: false },
  "03-brows.png": { eyes: "open", brows: true, mouth: "rest", cursor: true },
  "04-eyes_closed.png": { eyes: "closed", brows: false, mouth: "rest", cursor: true },
  "05-mouth_small.png": { eyes: "open", brows: false, mouth: "small", cursor: true },
  "06-mouth_open.png": { eyes: "open", brows: false, mouth: "open", cursor: true },
  "07-mouth_round.png": { eyes: "open", brows: false, mouth: "round", cursor: true },
  "08-mouth_wide.png": { eyes: "open", brows: false, mouth: "wide", cursor: true },
};

const CYAN = [46, 230, 255];
const SCREEN = [11, 13, 19];
const RED = [255, 77, 109];
const LABEL = [255, 212, 0, 255];

// Logo units (64-unit square, screen from 1.5 to 62.5) to canvas pixels: the screen is 70% of the canvas, centred.
const K = (FIXTURE_SIZE * 7) / 10 / 61, O = (FIXTURE_SIZE * 15) / 100;
const px = (u) => Math.round(O + (u - 1.5) * K);

function put(img, x, y, rgb) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  img.data.set([rgb[0], rgb[1], rgb[2], 255], (y * img.width + x) * 4);
}
// Filled box in logo units [u0, u1) x [v0, v1).
function box(img, u0, v0, u1, v1, rgb) {
  for (let y = px(v0); y < px(v1); y++) for (let x = px(u0); x < px(u1); x++) put(img, x, y, rgb);
}
// Hollow rectangle of pixel blocks (3 logo units each): w x h blocks, top-left at (u, v).
function hollow(img, u, v, wBlocks, hBlocks, rgb, skipCorners = false) {
  for (let j = 0; j < hBlocks; j++) {
    for (let i = 0; i < wBlocks; i++) {
      const edge = i === 0 || j === 0 || i === wBlocks - 1 || j === hBlocks - 1;
      const corner = (i === 0 || i === wBlocks - 1) && (j === 0 || j === hBlocks - 1);
      if (edge && !(skipCorners && corner)) box(img, u + 3 * i, v + 3 * j, u + 3 * i + 3, v + 3 * j + 3, rgb);
    }
  }
}
// Convex polygon in logo units, filled.
function poly(img, pts, rgb) {
  const P = pts.map(([u, v]) => [O + (u - 1.5) * K, O + (v - 1.5) * K]);
  const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      let pos = 0, neg = 0;
      for (let i = 0; i < P.length; i++) {
        const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length];
        const c = (bx - ax) * (y + 0.5 - ay) - (by - ay) * (x + 0.5 - ax);
        if (c > 0) pos++; else if (c < 0) neg++;
      }
      if (!pos || !neg) put(img, x, y, rgb);
    }
  }
}

export function drawFixture(file, S = FIXTURE_SIZE) {
  const face = FACES[file], dist = DISTORTIONS[file];
  const img = create(S, S, [0, 0, 0, 255]);
  // Screen: rounded square, outline 2.5 units, glow 0.05 S outside, grown by dist.grow px a side.
  const x0 = px(1.5) - dist.grow, x1 = px(62.5) + dist.grow, r = Math.round(12 * K) + dist.grow;
  const line = Math.round(2.5 * K), glow = Math.round(S / 20);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, x0 + r), x1 - r);
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) - r;
      if (d <= -line) put(img, x, y, SCREEN);
      else if (d <= 0) put(img, x, y, CYAN);
      else if (d < glow) put(img, x, y, CYAN.map((c) => Math.round((c * (glow - d)) / glow / 2)));
    }
  }
  // The prompt chevron (dim cyan) stays on every image, the empty screen included.
  const dim = CYAN.map((c) => Math.round((c * 6) / 10));
  poly(img, [[8, 9], [12, 12.5], [11, 13.5], [7, 10]], dim);
  poly(img, [[12, 12.5], [8, 16], [7, 15], [11, 11.5]], dim);
  if (face.cursor) box(img, 15, 9, 19, 16, RED);
  if (face.eyes === "open") {
    poly(img, [[14, 25], [28, 28.5], [28, 36], [16, 36]], CYAN);
    poly(img, [[50, 25], [36, 28.5], [36, 36], [48, 36]], CYAN);
  }
  if (face.eyes === "closed") { box(img, 14, 33, 28, 36, CYAN); box(img, 36, 33, 50, 36, CYAN); }
  if (face.brows) { box(img, 14, 20.5, 28, 22, CYAN); box(img, 36, 20.5, 50, 22, CYAN); }
  // Mouths keep the smile's top edge (43) and open downward; one pixel block = 3 units.
  if (face.mouth === "rest") { box(img, 26, 46, 38, 49, CYAN); box(img, 23, 43, 26, 46, CYAN); box(img, 38, 43, 41, 46, CYAN); }
  if (face.mouth === "small") hollow(img, 23, 43, 6, 3, CYAN);
  if (face.mouth === "open") hollow(img, 23, 43, 6, 5, CYAN);
  if (face.mouth === "round") hollow(img, 26, 43, 4, 4, CYAN, true);
  if (face.mouth === "wide") hollow(img, 18.5, 43, 9, 3, CYAN);
  // Visible labels: on the screen below the mouth band, and on the background above and below the screen.
  const label = "TEST FIXTURE - NOT CHARACTER ART";
  const lx = (S - textWidth(label, 2)) >> 1;
  drawText(img, label, lx, px(58) + 3, 2, LABEL); // between the open mouth (to 58 units) and the outline
  drawText(img, label, lx, 30, 2, LABEL);
  drawText(img, label + " " + file, (S - textWidth(label + " " + file, 2)) >> 1, S - 50, 2, LABEL);

  const rng = mulberry32(dist.seed);
  const out = create(S, S, [0, 0, 0, 255]);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const sx = x - dist.dx, sy = y - dist.dy;
      const o = (y * S + x) * 4;
      const noise = intBelow(rng, 6);
      if (sx < 0 || sy < 0 || sx >= S || sy >= S) { out.data[o] = out.data[o + 1] = out.data[o + 2] = noise; continue; }
      const i = (sy * S + sx) * 4;
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
    const w = writePng(path.join(dir, r.file), drawFixture(r.file), { [FIXTURE_KEY]: FIXTURE_VALUE });
    written.push({ file: r.file, ...w });
  }
  return written;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const w of makeFixtures()) console.log(`test/fixtures/raw/${w.file}  ${w.bytes} bytes  sha256 ${w.sha256}`);
}

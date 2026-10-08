// out/contact-sheet.png: every layer on a checkerboard, then head + eyes_open + each mouth, then the same
// composites at 64 x 64 (the size Ping must stay readable at). The thumbnails are scaled for display only; the
// layers themselves are never resampled.
//
//   npm run sheet                 real art → out/contact-sheet.png
//   npm run sheet -- --fixtures   fixtures → test/fixtures/build/contact-sheet.png
import fs from "node:fs";
import path from "node:path";
import { paths } from "../lib/cli.mjs";
import { drawText } from "../lib/font.mjs";
import { checkerboard, create, over, resample } from "../lib/image.mjs";
import { guardDirs } from "../lib/pipeline.mjs";
import { FIXTURE_KEY, FIXTURE_VALUE, readPng, writePng } from "../lib/png.mjs";
import { loadSpec, rel } from "../lib/spec.mjs";

const TILE = 314, GAP = 12, BAND = 30, COLS = 4, SMALL = 64;
const INK = [230, 230, 236, 255], WARN = [255, 212, 0, 255];

export function buildSheet(spec, layersDir, fixtures) {
  guardDirs([layersDir], fixtures);
  const imgs = new Map();
  for (const l of spec.layers) {
    const file = path.join(layersDir, l.file);
    if (!fs.existsSync(file)) throw new Error(`missing ${rel(file)}: run npm run process first`);
    const r = readPng(file);
    if (r.fixture !== fixtures) throw new Error(`${rel(file)}: fixture flag does not match the mode`);
    imgs.set(l.id, r.img);
  }
  const { width: W, height: H } = imgs.get("head");
  const layers = [...spec.layers].sort((a, b) => a.z - b.z);
  const mouths = spec.layers.filter((l) => l.group === "mouth");
  const composites = mouths.map((m) => {
    const c = create(W, H);
    for (const id of ["head", "eyes_open", m.id]) over(c, imgs.get(id));
    return { id: m.id, img: c };
  });
  const rowsOf = (n) => Math.ceil(n / COLS);
  const titleH = 60;
  const sec = (n) => rowsOf(n) * (TILE + BAND + GAP);
  const smallH = SMALL + BAND + GAP;
  const sheetW = COLS * TILE + (COLS + 1) * GAP;
  const sheetH = titleH + sec(layers.length) + BAND + sec(composites.length) + BAND + smallH + GAP;
  const sheet = create(sheetW, sheetH, [16, 16, 20, 255]);
  drawText(sheet, fixtures ? "PING LAYERS - TEST FIXTURE - NOT CHARACTER ART" : "PING LAYERS", GAP, 18, 4, fixtures ? WARN : INK);

  let y = titleH;
  const grid = (items, y0) => {
    items.forEach((it, i) => {
      const x = GAP + (i % COLS) * (TILE + GAP), yy = y0 + Math.floor(i / COLS) * (TILE + BAND + GAP);
      const tile = checkerboard(TILE, TILE, 12);
      over(tile, resample(it.img, TILE, TILE));
      over(sheet, tile, x, yy);
      drawText(sheet, it.id, x, yy + TILE + 8, 2, INK);
    });
    return y0 + sec(items.length);
  };
  y = grid(layers.map((l) => ({ id: l.id, img: imgs.get(l.id) })), y);
  drawText(sheet, "COMPOSITES: HEAD + EYES_OPEN + MOUTH", GAP, y + 6, 2, INK);
  y = grid(composites, y + BAND);
  drawText(sheet, `COMPOSITES AT ${SMALL} X ${SMALL}`, GAP, y + 6, 2, INK);
  y += BAND;
  composites.forEach((c, i) => {
    const x = GAP + i * (SMALL + 3 * GAP);
    const tile = checkerboard(SMALL, SMALL, 8);
    over(tile, resample(c.img, SMALL, SMALL));
    over(sheet, tile, x, y);
  });
  return sheet;
}

const p = paths();
try {
  const sheet = buildSheet(loadSpec(), p.layers, p.fixtures);
  fs.mkdirSync(path.dirname(p.sheet), { recursive: true });
  const w = writePng(p.sheet, sheet, p.fixtures ? { [FIXTURE_KEY]: FIXTURE_VALUE } : {});
  console.log(`${rel(p.sheet)}  ${sheet.width}x${sheet.height}  ${w.bytes} bytes  sha256 ${w.sha256}`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

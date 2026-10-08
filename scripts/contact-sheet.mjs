// out/contact-sheet.png: every layer on a checkerboard, then head + eyes_open + each mouth, then the same
// composites at 64 x 64 (the size Ping must stay readable at). The thumbnails are scaled for display only; the
// layers themselves are never resampled.
// out/composites/*.png: full-size composites with no scaling, layers stacked by z: glow + head + cursor + eyes_open
// with each mouth, one with eyes_closed, one with brows.
//
//   npm run sheet                 real art → out/contact-sheet.png
//   npm run sheet -- --fixtures   fixtures → test/fixtures/build/contact-sheet.png
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { paths } from "../lib/cli.mjs";
import { drawText } from "../lib/font.mjs";
import { checkerboard, create, over, resample } from "../lib/image.mjs";
import { guardDirs, mouthAnchors } from "../lib/pipeline.mjs";
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
  // Every mouth is drawn moved down by its anchorDy (art/layers.json mouthAnchor); the layers are not changed.
  const dy = moveOf(spec, imgs);
  const placed = (id) => { const c = create(W, H); over(c, imgs.get(id), 0, dy(id)); return c; };
  const layers = [...spec.layers].sort((a, b) => a.z - b.z);
  const mouths = spec.layers.filter((l) => l.group === "mouth");
  const composites = mouths.map((m) => {
    const c = create(W, H);
    for (const id of ["head", "eyes_open", m.id]) over(c, imgs.get(id), 0, dy(id));
    return { id: m.id, img: c };
  });
  const rowsOf = (n) => Math.ceil(n / COLS);
  const titleH = 60;
  const sec = (n) => rowsOf(n) * (TILE + BAND + GAP);
  const smallH = SMALL + BAND + GAP;
  const sheetW = COLS * TILE + (COLS + 1) * GAP;
  const sheetH = titleH + sec(layers.length) + BAND + sec(composites.length) + BAND + smallH + GAP;
  const sheet = create(sheetW, sheetH, [16, 16, 20, 255]);
  drawText(sheet, fixtures ? "PING LAYERS - TEST FIXTURE - NOT CHARACTER ART" : "PING LAYERS - MOUTHS MOVED BY ANCHORDY", GAP, 18, 4, fixtures ? WARN : INK);

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
  y = grid(layers.map((l) => ({ id: dy(l.id) ? `${l.id} DY ${dy(l.id)}` : l.id, img: dy(l.id) ? placed(l.id) : imgs.get(l.id) })), y);
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

// anchorDy of a layer id (0 for anything but a moved mouth), from lib/pipeline.mjs mouthAnchors on these layers.
function moveOf(spec, imgs) {
  const a = imgs.has("mouth_rest") ? mouthAnchors(spec, imgs) : null;
  return (id) => (a && a.mouths[id] && a.mouths[id].anchorDy) || 0;
}

// Full-size composites: name → layer ids, drawn in z order, each mouth moved by its anchorDy. Nothing is scaled.
export function compositeSets(spec) {
  const mouths = spec.layers.filter((l) => l.group === "mouth").map((l) => l.id);
  const sets = mouths.map((m) => [`eyes_open-${m}`, ["glow", "head", "cursor", "eyes_open", m]]);
  sets.push(["eyes_closed-mouth_rest", ["glow", "head", "cursor", "eyes_closed", "mouth_rest"]]);
  sets.push(["brows-eyes_open-mouth_rest", ["glow", "head", "cursor", "eyes_open", "brows", "mouth_rest"]]);
  const z = new Map(spec.layers.map((l) => [l.id, l.z]));
  return sets.map(([name, ids]) => ({ name, ids: [...ids].sort((a, b) => z.get(a) - z.get(b)) }));
}

export function writeComposites(spec, layersDir, outDir, fixtures) {
  guardDirs([layersDir, outDir], fixtures);
  const files = new Map(spec.layers.map((l) => [l.id, readPng(path.join(layersDir, l.file))]));
  for (const [id, r] of files) if (r.fixture !== fixtures) throw new Error(`${id}: fixture flag does not match the mode`);
  const imgs = new Map([...files].map(([id, r]) => [id, r.img]));
  const dy = moveOf(spec, imgs);
  fs.mkdirSync(outDir, { recursive: true });
  const { width: W, height: H } = imgs.get("head");
  return compositeSets(spec).map(({ name, ids }) => {
    const c = create(W, H);
    for (const id of ids) over(c, imgs.get(id), 0, dy(id));
    const file = path.join(outDir, `${name}.png`);
    const w = writePng(file, c, fixtures ? { [FIXTURE_KEY]: FIXTURE_VALUE } : {});
    return { file: rel(file), layers: ids, moved: Object.fromEntries(ids.filter((id) => dy(id)).map((id) => [id, dy(id)])), width: W, height: H, ...w };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const p = paths();
  try {
    for (const c of writeComposites(loadSpec(), p.layers, p.composites, p.fixtures)) {
      console.log(`${c.file}  ${c.width}x${c.height}  ${c.layers.join(" + ")}  sha256 ${c.sha256}`);
    }
    const sheet = buildSheet(loadSpec(), p.layers, p.fixtures);
    fs.mkdirSync(path.dirname(p.sheet), { recursive: true });
    const w = writePng(p.sheet, sheet, p.fixtures ? { [FIXTURE_KEY]: FIXTURE_VALUE } : {});
    console.log(`${rel(p.sheet)}  ${sheet.width}x${sheet.height}  ${w.bytes} bytes  sha256 ${w.sha256}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

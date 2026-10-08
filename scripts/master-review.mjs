// out/master-review.png: a full-size copy of the master with the measured regions (boxes) and pivots (crosses)
// drawn on it, for the author's review before the regions are frozen. A view only: never written into art/.
//
//   npm run review                 real master → out/master-review.png
//   npm run review -- --fixtures   fixture master → test/fixtures/build/master-review.png
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { paths } from "../lib/cli.mjs";
import { drawText } from "../lib/font.mjs";
import { fillRect, flattenOnBlack } from "../lib/image.mjs";
import { guardDirs } from "../lib/pipeline.mjs";
import { FIXTURE_KEY, FIXTURE_VALUE, readPng, writePng } from "../lib/png.mjs";
import { ROOT, loadSpec, rel } from "../lib/spec.mjs";

const COLOURS = {
  head: [255, 255, 255, 255],
  cursor: [255, 140, 0, 255],
  eyes: [0, 255, 90, 255],
  brows: [255, 230, 0, 255],
  mouth: [255, 0, 220, 255],
  screen: [150, 150, 150, 255],
};

function frame(img, [x, y, w, h], t, rgba) {
  fillRect(img, x, y, w, t, rgba); fillRect(img, x, y + h - t, w, t, rgba);
  fillRect(img, x, y, t, h, rgba); fillRect(img, x + w - t, y, t, h, rgba);
}
function cross(img, [x, y], r, t, rgba) {
  fillRect(img, x - r, y - (t >> 1), 2 * r + 1, t, rgba);
  fillRect(img, x - (t >> 1), y - r, t, 2 * r + 1, rgba);
}

export function buildReview(spec, rawDir, regionsFile, outFile, fixtures) {
  guardDirs([rawDir, regionsFile, outFile], fixtures);
  if (!fixtures && path.relative(path.join(ROOT, "art"), path.resolve(outFile)).split(path.sep)[0] !== "..") {
    throw new Error("the review image never goes into art/");
  }
  const m = readPng(path.join(rawDir, spec.processing.master));
  if (m.fixture !== fixtures) throw new Error("fixture flag does not match the mode");
  const regions = JSON.parse(fs.readFileSync(regionsFile, "utf8"));
  if (regions.master.sha256 !== m.sha256) throw new Error(`${rel(regionsFile)} was measured on another master`);
  const img = flattenOnBlack(m.img).img;
  const t = Math.max(2, Math.ceil(img.width / 400)), s = Math.max(2, Math.ceil(img.width / 500));
  frame(img, regions.measured.screen, 1, COLOURS.screen);
  const kinds = new Map();
  for (const l of spec.layers) {
    if (l.regionFrom === "glow") continue;
    if (!kinds.has(l.regionFrom)) kinds.set(l.regionFrom, { region: regions.layers[l.id].region, pivot: regions.layers[l.id].pivot, ids: [] });
    kinds.get(l.regionFrom).ids.push(l.id);
  }
  for (const [kind, k] of kinds) {
    frame(img, k.region, t, COLOURS[kind]);
    cross(img, k.pivot, 6 * t, t, COLOURS[kind]);
    const label = kind === "mouth" ? "MOUTH (5 LAYERS)" : k.ids.join(" ");
    drawText(img, label, k.region[0] + 2 * t, k.region[1] + 2 * t, s, COLOURS[kind]);
  }
  drawText(img, `MASTER REVIEW - REGIONS ${regions.frozen ? "FROZEN" : "NOT FROZEN"} - MARGIN ${regions.margin} PX`, 2 * t, 2 * t, s, COLOURS.head);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  return { kinds: [...kinds.keys()], ...writePng(outFile, img, fixtures ? { [FIXTURE_KEY]: FIXTURE_VALUE } : {}), width: img.width, height: img.height };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const p = paths();
  try {
    const r = buildReview(loadSpec(), p.raw, p.regions, p.review, p.fixtures);
    console.log(`${rel(p.review)}  ${r.width}x${r.height}  ${r.bytes} bytes  sha256 ${r.sha256}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

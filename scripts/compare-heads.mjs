// Compares G2 (empty screen) attempts with the master where they should be identical: the chevron, the outline and
// the rest of the inside of the screen. Masks come from the master and the frozen art/regions.json:
//   outline  = the master's silhouette minus the inside of the screen (lib/regions.mjs screenInterior, no shrink);
//   chevron  = lit (max channel >= silhouetteThreshold), non-red master pixels inside the screen, outside the eyes,
//              brows and mouth regions;
//   inside   = the inside of the screen outside the cursor, eyes, brows and mouth regions, chevron excluded.
// Each attempt is aligned to the master by its measured offset first (same search as processing).
//
//   npm run compare:heads -- G2-01 G2-02
import fs from "node:fs";
import path from "node:path";
import { findOffset, silhouette } from "../lib/extract.mjs";
import { flattenOnBlack, translate } from "../lib/image.mjs";
import { readPng } from "../lib/png.mjs";
import { screenInterior } from "../lib/regions.mjs";
import { ROOT, loadSpec } from "../lib/spec.mjs";

const spec = loadSpec(), P = spec.processing;
const regions = JSON.parse(fs.readFileSync(path.join(ROOT, "art", "regions.json"), "utf8"));
const master = flattenOnBlack(readPng(path.join(ROOT, "art", "raw", P.master)).img).img;
const { width: W, height: H } = master, m = master.data, n = W * H;
const sil = silhouette(master, P.silhouetteThreshold).mask;
const inside = screenInterior(master, sil, P.silhouetteThreshold, 0);
const R = (id) => regions.layers[id].region;
const inR = (r, x, y) => x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3];
const face = [R("eyes_open"), R("brows"), R("mouth_rest")], cursor = R("cursor");
const masks = { outline: new Uint8Array(n), chevron: new Uint8Array(n), inside: new Uint8Array(n) };
for (let p = 0; p < n; p++) {
  const x = p % W, y = (p - x) / W, i = p * 4;
  if (sil[p] && !inside[p]) { masks.outline[p] = 1; continue; }
  if (!inside[p] || face.some((r) => inR(r, x, y))) continue;
  const lit = Math.max(m[i], m[i + 1], m[i + 2]) >= P.silhouetteThreshold;
  const red = m[i] - Math.max(m[i + 1], m[i + 2]) > P.featureLo;
  if (lit && !red) masks.chevron[p] = 1;
  else if (!inR(cursor, x, y)) masks.inside[p] = 1;
}
const mean = (img, mask) => {
  const s = [0, 0, 0]; let c = 0;
  for (let p = 0; p < n; p++) if (mask[p]) { for (let k = 0; k < 3; k++) s[k] += img.data[p * 4 + k]; c++; }
  return { sum: s, pixels: c, mean: s.map((v) => v / c) };
};
const diff = (a, b, mask) => {
  let s = 0, c = 0;
  for (let p = 0; p < n; p++) if (mask[p]) { for (let k = 0; k < 3; k++) { const d = a.data[p * 4 + k] - b.data[p * 4 + k]; s += d < 0 ? -d : d; } c += 3; }
  return { sum: s, samples: c, mean: s / c };
};
const mc = mean(master, masks.chevron);
console.log(`masks from art/raw/${P.master}: outline ${masks.outline.reduce((a, b) => a + b, 0)} px, chevron ${mc.pixels} px, inside ${masks.inside.reduce((a, b) => a + b, 0)} px`);
console.log(`master chevron mean RGB ${mc.mean.join(", ")} (sums ${mc.sum.join(", ")} over ${mc.pixels} px)`);
for (const id of process.argv.slice(2)) {
  const img = flattenOnBlack(readPng(path.join(ROOT, "art", "raw", "attempts", `${id}.png`)).img).img;
  const ex = spec.raws.find((r) => r.file === P.base).changes.map((c) => R(c));
  const off = findOffset(master, img, ex, P.searchRadiusPx, P.searchStridePx);
  const a = translate(img, off.dx, off.dy);
  const ch = mean(a, masks.chevron);
  const o = diff(master, a, masks.outline), c = diff(master, a, masks.chevron), i = diff(master, a, masks.inside);
  console.log(`${id}: offset ${off.dx},${off.dy}; chevron mean RGB ${ch.mean.join(", ")} (sums ${ch.sum.join(", ")})`);
  console.log(`  mean |RGB difference| from the master: outline ${o.mean} (${o.sum}/${o.samples}), chevron ${c.mean} (${c.sum}/${c.samples}), inside the screen ${i.mean} (${i.sum}/${i.samples})`);
}

import assert from "node:assert/strict";
import test from "node:test";
import { drift, extractFeature, extractGlow, findOffset, silhouette } from "../lib/extract.mjs";
import { GLYPHS } from "../lib/font.mjs";
import { alphaBBox, create, fillRect, over, resample, translate } from "../lib/image.mjs";
import { FIXTURE_KEY, FIXTURE_VALUE, decode, encode, isFixture, sha256 } from "../lib/png.mjs";
import { mulberry32 } from "../lib/rng.mjs";

function noise(w, h, seed) {
  const rng = mulberry32(seed), img = create(w, h, [0, 0, 0, 255]);
  for (let i = 0; i < w * h; i++) img.data.set([Math.floor(rng() * 256), Math.floor(rng() * 256), Math.floor(rng() * 256)], i * 4);
  return img;
}
const px = (img, x, y) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];

test("seeded generator repeats exactly", () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});

test("findOffset recovers a known shift; drift of a pure shift is 0", () => {
  const master = noise(64, 64, 1);
  const variant = translate(master, -3, 2); // variant(x, y) = master(x - 3, y + 2) → content moved by (+3, -2)
  const off = findOffset(master, variant, [], 5, 1);
  assert.deepEqual([off.dx, off.dy, off.atEdge], [3, -2, false]);
  const d = drift(master, variant, off.dx, off.dy, [], 0);
  assert.equal(d.sum, 0);
  assert.equal(d.samples, 61 * 62 * 3); // the overlap: 64 - 3 columns, 64 - 2 rows
});

test("findOffset ignores the excluded feature region", () => {
  const master = noise(64, 64, 2);
  const variant = translate(master, 0, 0);
  fillRect(variant, 20, 20, 20, 20, [255, 255, 255, 255]);
  const off = findOffset(master, variant, [[20, 20, 20, 20]], 3, 1);
  assert.deepEqual([off.dx, off.dy], [0, 0]);
  assert.equal(drift(master, variant, 0, 0, [[20, 20, 20, 20]], 3).sum, 0);
});

test("drift measures a flat colour change exactly", () => {
  const a = create(10, 10, [10, 20, 30, 255]), b = create(10, 10, [13, 20, 26, 255]);
  const d = drift(a, b, 0, 0, [], 0);
  assert.deepEqual([d.sum, d.samples, d.mean], [700, 300, 700 / 300]);
});

test("silhouette keeps the inside of a closed outline and drops specks", () => {
  const img = create(40, 40, [0, 0, 0, 255]);
  for (let i = 5; i < 35; i++) for (const [x, y] of [[i, 5], [i, 34], [5, i], [34, i]]) img.data.set([0, 200, 255], (y * 40 + x) * 4);
  img.data.set([0, 200, 255], (1 * 40 + 1) * 4); // a speck
  const s = silhouette(img, 48);
  assert.equal(s.mask[20 * 40 + 20], 1);
  assert.equal(s.mask[1 * 40 + 1], 0);
  assert.equal(s.components, 2);
  // Open a gap in the outline: the background floods in and the centre is lost.
  img.data.set([0, 0, 0], (5 * 40 + 20) * 4);
  assert.equal(silhouette(img, 48).mask[20 * 40 + 20], 0);
});

test("glow alpha follows brightness above the floor", () => {
  const img = create(3, 1, [0, 0, 0, 255]);
  img.data.set([0, 0, 16], 0); img.data.set([0, 60, 120], 4); img.data.set([0, 0, 255], 8);
  const g = extractGlow(img, new Uint8Array(3), 16);
  assert.deepEqual(px(g, 0, 0), [0, 0, 0, 0]);
  assert.deepEqual(px(g, 1, 0), [0, 128, 255, Math.round((104 * 255) / 239)]);
  assert.deepEqual(px(g, 2, 0), [0, 0, 255, 255]);
});

test("feature alpha ramps from lo to hi and stays inside rect and mask", () => {
  const base = create(4, 1, [10, 10, 10, 255]), v = create(4, 1, [10, 10, 10, 255]);
  v.data.set([30, 10, 10], 0); v.data.set([58, 10, 10], 4); v.data.set([200, 10, 10], 8); v.data.set([200, 10, 10], 12);
  const mask = Uint8Array.from([1, 1, 1, 0]);
  const f = extractFeature(v, base, mask, [0, 0, 4, 1], 24, 72);
  assert.deepEqual([0, 1, 2, 3].map((x) => px(f, x, 0)[3]), [0, Math.round((24 * 255) / 48), 255, 0]);
  assert.equal(extractFeature(v, base, mask, [0, 0, 2, 1], 24, 72).data[11], 0);
});

test("resample keeps flat colour and size; translate fills with black", () => {
  const flat = create(100, 100, [40, 200, 90, 255]);
  for (const [w, h] of [[64, 64], [131, 131]]) {
    const r = resample(flat, w, h);
    assert.equal(r.width, w);
    assert.deepEqual(px(r, 0, 0), [40, 200, 90, 255]);
    assert.deepEqual(px(r, w - 1, h - 1), [40, 200, 90, 255]);
  }
  assert.deepEqual(px(translate(flat, 5, 0), 99, 0), [0, 0, 0, 255]);
});

test("over blends straight alpha; alphaBBox finds visible pixels", () => {
  const dst = create(2, 1, [0, 0, 0, 255]), src = create(2, 1);
  src.data.set([255, 255, 255, 128], 0);
  over(dst, src);
  assert.deepEqual(px(dst, 0, 0), [128, 128, 128, 255]);
  assert.deepEqual(alphaBBox(src), { x: 0, y: 0, w: 1, h: 1 });
  assert.equal(alphaBBox(create(3, 3)), null);
});

test("PNG encode is deterministic, round-trips, and carries the fixture mark", () => {
  const img = noise(16, 16, 3);
  const a = encode(img), b = encode(img);
  assert.equal(sha256(a), sha256(b));
  assert.deepEqual(decode(a).data, img.data);
  const f = encode(img, { [FIXTURE_KEY]: FIXTURE_VALUE });
  assert.ok(isFixture(f));
  assert.ok(!isFixture(a));
  assert.deepEqual(decode(f).data, img.data);
});

test("every font glyph is 7 rows of 5 cells", () => {
  for (const [k, g] of Object.entries(GLYPHS)) {
    const rows = g.split("|");
    assert.equal(rows.length, 7, k);
    for (const r of rows) assert.match(r, /^[.#]{5}$/, k);
  }
});

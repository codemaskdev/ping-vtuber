import assert from "node:assert/strict";
import test from "node:test";
import { MAX_MOUTHS, loadSpec, validateSpec } from "../lib/spec.mjs";

const spec = loadSpec();
const clone = () => JSON.parse(JSON.stringify(spec));
const byId = (s, id) => s.layers.find((l) => l.id === id);

test("art/layers.json is valid", () => {
  assert.deepEqual(validateSpec(spec), []);
});

test("the canvas mirrors the CodeMask host avatar (1254 x 1254)", () => {
  assert.deepEqual(spec.canvas, { width: 1254, height: 1254 });
});

test("has every required layer and at most 6 mouths", () => {
  for (const id of ["head", "eyes_open", "eyes_closed", "brows", "glow"]) assert.ok(byId(spec, id), id);
  const mouths = spec.layers.filter((l) => l.group === "mouth");
  assert.ok(mouths.length >= 1 && mouths.length <= MAX_MOUTHS);
  assert.ok(byId(spec, "mouth_rest"), "mouth_rest");
  for (const m of mouths) assert.ok(m.covers && m.about, m.id);
});

test("feature regions do not overlap each other, and pivots sit inside their regions", () => {
  const bands = ["brows", "eyes_open", "mouth_rest"].map((id) => byId(spec, id).region);
  for (let i = 0; i < bands.length; i++) {
    for (let j = i + 1; j < bands.length; j++) {
      const a = bands[i], b = bands[j];
      const overlap = a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
      assert.ok(!overlap, `${a} overlaps ${b}`);
    }
  }
  for (const l of spec.layers) {
    if (l.extract !== "feature") continue;
    const [x, y, w, h] = l.region, [px, py] = l.pivot;
    assert.ok(px >= x && py >= y && px < x + w && py < y + h, l.id);
  }
});

test("eyes_open and eyes_closed share region and pivot", () => {
  assert.deepEqual(byId(spec, "eyes_open").region, byId(spec, "eyes_closed").region);
  assert.deepEqual(byId(spec, "eyes_open").pivot, byId(spec, "eyes_closed").pivot);
});

test("every raw is used, and every variant is an edit of the master", () => {
  const used = new Set(spec.layers.map((l) => l.source));
  for (const r of spec.raws) assert.ok(used.has(r.file), r.file);
  assert.equal(spec.raws[0].file, spec.processing.master);
});

test("validation catches broken specs", () => {
  const cases = [
    [(s) => { s.layers[1].id = s.layers[0].id; }, /duplicate id/],
    [(s) => { byId(s, "brows").region = [1200, 0, 100, 10]; }, /region outside the canvas/],
    [(s) => { byId(s, "brows").pivot = [5000, 1]; }, /pivot outside the canvas/],
    [(s) => { byId(s, "head").parent = "glow"; }, /parent cycle|exactly one root/],
    [(s) => { byId(s, "brows").parent = "nope"; }, /unknown parent/],
    [(s) => { byId(s, "mouth_round").region = [251, 680, 752, 279]; }, /share one region/],
    [(s) => { byId(s, "brows").file = "Brows.png"; }, /file must be brows.png/],
    [(s) => { byId(s, "brows").source = "99-x.png"; }, /not in raws/],
    [(s) => { for (let i = 0; i < 2; i++) s.layers.push({ ...byId(s, "mouth_wide"), id: `mouth_x${i}`, file: `mouth_x${i}.png` }); }, /1\.\.6 shapes/],
    [(s) => { s.processing.featureHi = 1; }, /featureHi/],
    [(s) => { s.raws[3].changes = []; }, /must name the layers it changes/],
  ];
  for (const [mutate, re] of cases) {
    const s = clone();
    mutate(s);
    const errors = validateSpec(s);
    assert.ok(errors.some((e) => re.test(e)), `${re} not in ${JSON.stringify(errors)}`);
  }
});

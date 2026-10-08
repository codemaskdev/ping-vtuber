import assert from "node:assert/strict";
import test from "node:test";
import { MAX_MOUTHS, REGION_KINDS, loadSpec, validateSpec } from "../lib/spec.mjs";

const spec = loadSpec();
const clone = () => JSON.parse(JSON.stringify(spec));
const byId = (s, id) => s.layers.find((l) => l.id === id);

test("art/layers.json is valid", () => {
  assert.deepEqual(validateSpec(spec), []);
});

test("no canvas size, region or pivot is typed in: they are measured on the master", () => {
  assert.equal(typeof spec.canvas, "string");
  for (const l of spec.layers) {
    assert.ok(!("region" in l) && !("pivot" in l), l.id);
    assert.ok(REGION_KINDS.includes(l.regionFrom), l.id);
  }
  assert.equal(spec.regionRule.marginPercentOfScreenWidth, 3);
});

test("has every required layer and at most 6 mouths", () => {
  for (const id of ["head", "eyes_open", "eyes_closed", "brows", "glow", "cursor"]) assert.ok(byId(spec, id), id);
  const mouths = spec.layers.filter((l) => l.group === "mouth");
  assert.ok(mouths.length >= 1 && mouths.length <= MAX_MOUTHS);
  assert.ok(byId(spec, "mouth_rest"));
  for (const m of mouths) assert.ok(m.covers && m.about, m.id);
});

test("cursor is a child of head taken from the master; brows are their own edit", () => {
  assert.equal(byId(spec, "cursor").parent, "head");
  assert.equal(byId(spec, "cursor").source, spec.processing.master);
  const browsRaw = spec.raws.find((r) => r.file === byId(spec, "brows").source);
  assert.notEqual(browsRaw.file, spec.processing.master);
  assert.deepEqual(browsRaw.changes, ["brows"]);
  assert.ok(!spec.layers.some((l) => l.id !== "brows" && l.source === browsRaw.file), "nothing else depends on the brows edit");
});

test("raws run G1 master, G2 head, G3 brows, G4 eyes_closed, G5-G8 mouths", () => {
  assert.deepEqual(spec.raws.map((r) => r.prompt), ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8"]);
  assert.deepEqual(spec.raws.slice(0, 4).map((r) => r.file), ["01-master.png", "02-head.png", "03-brows.png", "04-eyes_closed.png"]);
  const used = new Set(spec.layers.map((l) => l.source));
  for (const r of spec.raws) assert.ok(used.has(r.file), r.file);
});

test("offset, drift and screen-edge limits are the ones the author chose after the calibration run", () => {
  assert.deepEqual([spec.checks.maxOffsetPx, spec.checks.maxDrift, spec.checks.maxScaleDeltaPx], [2, 2.5, 6]);
  assert.match(spec.checks.$comment, /chosen by the author after the stage 2 calibration/);
});

test("validation catches broken specs", () => {
  const cases = [
    [(s) => { s.layers[1].id = s.layers[0].id; }, /duplicate id/],
    [(s) => { byId(s, "brows").region = [0, 0, 1, 1]; }, /measured into art\/regions.json/],
    [(s) => { byId(s, "brows").regionFrom = "nose"; }, /unknown regionFrom/],
    [(s) => { byId(s, "head").parent = "glow"; }, /parent cycle|exactly one root/],
    [(s) => { byId(s, "brows").parent = "nope"; }, /unknown parent/],
    [(s) => { byId(s, "mouth_round").regionFrom = "eyes"; }, /mouths take the mouth region/],
    [(s) => { byId(s, "brows").file = "Brows.png"; }, /file must be brows.png/],
    [(s) => { byId(s, "brows").source = "99-x.png"; }, /not in raws/],
    [(s) => { for (let i = 0; i < 2; i++) s.layers.push({ ...byId(s, "mouth_wide"), id: `mouth_x${i}`, file: `mouth_x${i}.png` }); }, /1\.\.6 shapes/],
    [(s) => { s.processing.featureHi = 1; }, /featureHi/],
    [(s) => { s.raws[3].changes = []; }, /must name the layers it changes/],
    [(s) => { s.checks.maxDrift = "6"; }, /checks.maxDrift/],
    [(s) => { delete s.pivotRule.mouth; }, /pivotRule.mouth/],
    [(s) => { s.raws.reverse(); }, /master must be the first raw/],
  ];
  for (const [mutate, re] of cases) {
    const s = clone();
    mutate(s);
    const errors = validateSpec(s);
    assert.ok(errors.some((e) => re.test(e)), `${re} not in ${JSON.stringify(errors)}`);
  }
});

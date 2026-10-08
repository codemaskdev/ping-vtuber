// End to end on TEST FIXTURES: make → regions → process (twice) → check, plus the guards that keep fixtures out of
// the art.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { create, translate } from "../lib/image.mjs";
import { checkLayers, loadRaws, processAll } from "../lib/pipeline.mjs";
import { FIXTURE_KEY, FIXTURE_VALUE, readPng, writePng } from "../lib/png.mjs";
import { ROOT, loadSpec } from "../lib/spec.mjs";
import { compositeSets, writeComposites } from "../scripts/contact-sheet.mjs";
import { buildReview } from "../scripts/master-review.mjs";
import { freezeRegions, measureRegions } from "../scripts/regions.mjs";
import { DISTORTIONS, FIXTURE_RAW, FIXTURE_SIZE, makeFixtures } from "./fixtures/make-fixtures.mjs";

const spec = loadSpec();
const BUILD = path.join(ROOT, "test", "fixtures", "build", "pipeline-test");
const run = (name) => path.join(BUILD, name);
const REGIONS = run("regions.json");
const mark = { [FIXTURE_KEY]: FIXTURE_VALUE };
fs.rmSync(BUILD, { recursive: true, force: true });
makeFixtures();
const regions = measureRegions(spec, FIXTURE_RAW, REGIONS, { fixtures: true });
const logA = processAll(spec, FIXTURE_RAW, run("a"), REGIONS, { fixtures: true });
const logB = processAll(spec, FIXTURE_RAW, run("b"), REGIONS, { fixtures: true });
const checked = checkLayers(spec, FIXTURE_RAW, run("a"), REGIONS, { fixtures: true });
const row = (res, id) => res.rows.find((r) => r.id === id);

test("the canvas is the master's own size; regions are measured on it", () => {
  assert.deepEqual(regions.canvas, { width: FIXTURE_SIZE, height: FIXTURE_SIZE });
  assert.deepEqual(logA.canvas, regions.canvas);
  assert.equal(regions.frozen, false);
  for (const l of spec.layers) assert.ok(regions.layers[l.id].region && regions.layers[l.id].pivot, l.id);
  assert.deepEqual([regions.baseOffset.dx, regions.baseOffset.dy], [DISTORTIONS["02-head.png"].dx, DISTORTIONS["02-head.png"].dy]);
});

test("feature regions are measured boxes plus the margin, and do not overlap", () => {
  const m = regions.margin;
  assert.equal(m, Math.ceil((regions.measured.screen[2] * 3) / 100));
  const L = regions.layers;
  assert.deepEqual(L.cursor.region, [regions.measured.cursor[0] - m, regions.measured.cursor[1] - m, regions.measured.cursor[2] + 2 * m, regions.measured.cursor[3] + 2 * m]);
  const keys = ["cursor", "eyes_open", "brows", "mouth_rest"];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = L[keys[i]].region, b = L[keys[j]].region;
      assert.ok(!(a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]), `${keys[i]} overlaps ${keys[j]}`);
    }
  }
});

test("processing is deterministic: two runs give the same bytes and the same log", () => {
  assert.deepEqual(logA.layers.map((l) => l.sha256), logB.layers.map((l) => l.sha256));
  for (const l of spec.layers) assert.ok(fs.readFileSync(run("a/" + l.file)).equals(fs.readFileSync(run("b/" + l.file))), l.id);
  const strip = (log) => JSON.stringify({ ...log, layers: log.layers.map((l) => ({ ...l, file: path.basename(l.file) })) });
  assert.equal(strip(logA), strip(logB));
});

test("fixture makers are deterministic too", () => {
  const before = spec.raws.map((r) => readPng(path.join(FIXTURE_RAW, r.file)).sha256);
  makeFixtures();
  assert.deepEqual(spec.raws.map((r) => readPng(path.join(FIXTURE_RAW, r.file)).sha256), before);
});

test("each variant is shifted by its measured offset before extraction, and the shift is logged", () => {
  for (const r of logA.raws) {
    if (r.role === "master") continue;
    const want = DISTORTIONS[r.file];
    assert.deepEqual([r.offset.dx, r.offset.dy], [want.dx, want.dy], r.file);
    const t = r.steps.find((s) => s.op === "translate");
    if (want.dx || want.dy) assert.deepEqual([t.dx, t.dy], [want.dx, want.dy], r.file);
    else assert.equal(t, undefined, r.file);
  }
});

test("no pass/fail check fails on the fixtures; variants are 'measured'", () => {
  assert.ok(checked.ok, JSON.stringify(checked.rows.filter((r) => r.problems.length)));
  assert.equal(checked.rows.length, spec.layers.length);
  for (const r of checked.rows) assert.equal(r.measured === true, r.source !== spec.processing.master, r.id);
  assert.ok(row(checked, "mouth_open").drift.mean > row(checked, "mouth_small").drift.mean, "the +3 tint shows up as more drift");
});

test("screen size is measured per variant next to the master's and catches a scale change", () => {
  const g = DISTORTIONS["08-mouth_wide.png"].grow;
  assert.deepEqual(row(checked, "mouth_wide").scaleDelta, [2 * g, 2 * g]);
  assert.deepEqual(row(checked, "mouth_small").scaleDelta, [0, 0]);
});

test("the mouth region has room for mouth_open, 5 blocks under the smile's top", () => {
  const open = row(checked, "mouth_open").bbox, rest = row(checked, "mouth_rest").bbox, small = row(checked, "mouth_small").bbox;
  assert.equal(open.y, rest.y);
  assert.ok(open.h > small.h * 1.5, "open differs clearly from small");
  assert.ok(row(checked, "mouth_open").inside);
});

test("partial mode: with only the master and the empty screen, their layers are made and the rest wait", () => {
  const dir = run("partial-raw");
  fs.mkdirSync(dir, { recursive: true });
  for (const f of ["01-master.png", "02-head.png"]) fs.copyFileSync(path.join(FIXTURE_RAW, f), path.join(dir, f));
  assert.throws(() => processAll(spec, dir, run("partial"), REGIONS, { fixtures: true }), /missing in .*03-brows.png/);
  const log = processAll(spec, dir, run("partial"), REGIONS, { fixtures: true, partial: true });
  assert.deepEqual(log.layers.map((l) => l.id), ["glow", "head", "cursor", "eyes_open", "mouth_rest"]);
  assert.deepEqual(log.waiting, ["eyes_closed", "brows", "mouth_small", "mouth_open", "mouth_round", "mouth_wide"]);
  for (const l of log.layers) assert.ok(fs.readFileSync(path.join(ROOT, l.file)).equals(fs.readFileSync(run("a/" + path.basename(l.file)))), l.id);
  const res = checkLayers(spec, dir, run("partial"), REGIONS, { fixtures: true, partial: true });
  assert.ok(res.ok);
  assert.deepEqual(res.rows.filter((r) => r.waiting).map((r) => r.id).sort(), [...log.waiting].sort());
});

test("full-size composites: no scaling, layers stacked by z", () => {
  const out = writeComposites(spec, run("a"), run("composites"), true);
  assert.deepEqual(out.map((c) => path.basename(c.file)), compositeSets(spec).map((c) => `${c.name}.png`));
  assert.equal(out.length, 7);
  for (const c of out) assert.deepEqual([c.width, c.height], [FIXTURE_SIZE, FIXTURE_SIZE]);
  assert.deepEqual(out.find((c) => c.file.endsWith("brows-eyes_open-mouth_rest.png")).layers, ["glow", "head", "cursor", "eyes_open", "brows", "mouth_rest"]);
  // Where the mouth layer is opaque, the composite shows exactly the mouth pixel.
  const comp = readPng(path.join(run("composites"), "eyes_open-mouth_open.png")).img, mouth = readPng(run("a/mouth_open.png")).img;
  let checkedPx = 0;
  for (let i = 0; i < mouth.data.length; i += 4) {
    if (mouth.data[i + 3] !== 255) continue;
    assert.deepEqual([...comp.data.subarray(i, i + 4)], [...mouth.data.subarray(i, i + 4)]);
    checkedPx++;
  }
  assert.ok(checkedPx > 0);
});

test("the master review is drawn on a full-size copy and never goes into art/", () => {
  const r = buildReview(spec, FIXTURE_RAW, REGIONS, run("master-review.png"), true);
  assert.deepEqual([r.width, r.height], [FIXTURE_SIZE, FIXTURE_SIZE]);
  assert.deepEqual(r.kinds.sort(), ["brows", "cursor", "eyes", "head", "mouth"]);
  assert.throws(() => buildReview(spec, path.join(ROOT, "art", "raw"), path.join(ROOT, "art", "regions.json"), path.join(ROOT, "art", "review.png"), false), /never goes into art/);
});

test("the eyes_closed fixture lies on the open eyes' bottom edge, as the prompt says", () => {
  const open = row(checked, "eyes_open").bbox, closed = row(checked, "eyes_closed").bbox;
  assert.equal(closed.y + closed.h, open.y + open.h);
  assert.ok(closed.h < open.h / 3);
});

test("check:layers fails a layer out of its region, with corner alpha, or missing", () => {
  const dir = run("broken");
  fs.cpSync(run("a"), dir, { recursive: true });
  writePng(path.join(dir, "mouth_round.png"), translate(readPng(path.join(dir, "mouth_round.png")).img, 0, -200), mark);
  const brows = readPng(path.join(dir, "brows.png")).img;
  brows.data.set([255, 255, 255, 255], 0);
  writePng(path.join(dir, "brows.png"), brows, mark);
  fs.rmSync(path.join(dir, "mouth_wide.png"));
  const res = checkLayers(spec, FIXTURE_RAW, dir, REGIONS, { fixtures: true });
  const problems = Object.fromEntries(res.rows.map((r) => [r.id, r.problems.join("; ")]));
  assert.equal(res.ok, false);
  assert.match(problems.mouth_round, /outside region/);
  assert.match(problems.brows, /corner alpha/);
  assert.match(problems.mouth_wide, /missing/);
  assert.equal(problems.mouth_rest, "");
});

test("once limits are set, offset, drift and scale become pass/fail", () => {
  const strict = JSON.parse(JSON.stringify(spec));
  strict.checks = { maxOffsetPx: 2, maxDrift: 5, maxScaleDeltaPx: 4 };
  const res = checkLayers(strict, FIXTURE_RAW, run("a"), REGIONS, { fixtures: true });
  assert.match(row(res, "mouth_round").problems.join(), /offset > 2 px/);
  assert.match(row(res, "mouth_wide").problems.join(), /drift > 5/);
  assert.match(row(res, "mouth_wide").problems.join(), /screen size differs by > 4 px/);
});

test("a raw of another size than the master fails; nothing is resampled", () => {
  const dir = run("wrong-size");
  fs.cpSync(FIXTURE_RAW, dir, { recursive: true });
  writePng(path.join(dir, "05-mouth_small.png"), create(FIXTURE_SIZE + 2, FIXTURE_SIZE + 2, [0, 0, 0, 255]), mark);
  assert.throws(() => loadRaws(spec, dir, { fixtures: true }), /05-mouth_small.png is 802x802, the master is 800x800/);
});

test("frozen regions are never re-measured, and belong to one master", () => {
  const file = run("frozen/regions.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.copyFileSync(REGIONS, file);
  freezeRegions(spec, FIXTURE_RAW, file, { fixtures: true });
  assert.throws(() => measureRegions(spec, FIXTURE_RAW, file, { fixtures: true }), /is frozen/);
  const other = JSON.parse(fs.readFileSync(file, "utf8"));
  other.master.sha256 = "0".repeat(64);
  fs.writeFileSync(file, JSON.stringify(other));
  assert.throws(() => processAll(spec, FIXTURE_RAW, run("x"), file, { fixtures: true }), /measured on another master/);
});

test("fixtures are refused as character art, and fixture mode stays in test/fixtures", () => {
  assert.throws(() => loadRaws(spec, FIXTURE_RAW, { fixtures: false }), /TEST FIXTURE/);
  assert.throws(() => processAll(spec, FIXTURE_RAW, path.join(ROOT, "art", "layers"), REGIONS, { fixtures: true }), /outside test\/fixtures/);
  assert.throws(() => processAll(spec, FIXTURE_RAW, run("x"), REGIONS, { fixtures: false }), /fixture folder/);
  for (const l of logA.layers) assert.ok(readPng(path.join(ROOT, l.file)).fixture, l.file);
});

test("logs name only repo-relative paths", () => {
  for (const text of [JSON.stringify(logA), fs.readFileSync(REGIONS, "utf8")]) assert.ok(!text.includes(ROOT));
});

test("CLI: check:layers on real art says what is missing and exits 1 while art/raw is empty", { skip: fs.readdirSync(path.join(ROOT, "art", "raw")).some((f) => f.endsWith(".png")) }, () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "check-layers.mjs")], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /missing in art\/raw\/: 01-master\.png/);
});

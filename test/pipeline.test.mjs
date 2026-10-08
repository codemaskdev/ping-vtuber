// End to end on TEST FIXTURES: make → process (twice) → check, plus the guards that keep fixtures out of the art.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { translate } from "../lib/image.mjs";
import { checkLayers, loadRaws, processAll } from "../lib/pipeline.mjs";
import { FIXTURE_KEY, FIXTURE_VALUE, readPng, writePng } from "../lib/png.mjs";
import { ROOT, loadSpec } from "../lib/spec.mjs";
import { DISTORTIONS, FIXTURE_RAW, makeFixtures } from "./fixtures/make-fixtures.mjs";

const spec = loadSpec();
const BUILD = path.join(ROOT, "test", "fixtures", "build", "pipeline-test");
const run = (name) => path.join(BUILD, name);
fs.rmSync(BUILD, { recursive: true, force: true });
makeFixtures();
const logA = processAll(spec, FIXTURE_RAW, run("a"), { fixtures: true });
const logB = processAll(spec, FIXTURE_RAW, run("b"), { fixtures: true });

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

test("measured offsets equal the shifts built into the fixtures", () => {
  for (const r of logA.raws) {
    const want = DISTORTIONS[r.file];
    if (r.role === "master") continue;
    assert.deepEqual([r.offset.dx, r.offset.dy], [want.dx, want.dy], r.file);
  }
});

test("every layer passes check:layers on the fixtures", () => {
  const res = checkLayers(spec, FIXTURE_RAW, run("a"), { fixtures: true });
  assert.ok(res.ok, JSON.stringify(res.rows.filter((r) => r.problems.length)));
  assert.equal(res.rows.length, spec.layers.length);
  const tinted = res.rows.find((r) => r.source === "05-mouth_open.png");
  const clean = res.rows.find((r) => r.source === "07-mouth_wide.png");
  assert.ok(tinted.drift.mean > clean.drift.mean, "the +3 tint shows up as more drift");
});

test("check:layers fails a layer pushed out of its region, with corner alpha, or missing", () => {
  const dir = run("broken");
  fs.cpSync(run("a"), dir, { recursive: true });
  const mark = { [FIXTURE_KEY]: FIXTURE_VALUE };
  writePng(path.join(dir, "mouth_round.png"), translate(readPng(path.join(dir, "mouth_round.png")).img, 0, -200), mark);
  const brows = readPng(path.join(dir, "brows.png")).img;
  brows.data.set([255, 255, 255, 255], 0);
  writePng(path.join(dir, "brows.png"), brows, mark);
  fs.rmSync(path.join(dir, "mouth_wide.png"));
  const res = checkLayers(spec, FIXTURE_RAW, dir, { fixtures: true });
  const problems = Object.fromEntries(res.rows.map((r) => [r.id, r.problems.join("; ")]));
  assert.equal(res.ok, false);
  assert.match(problems.mouth_round, /outside region/);
  assert.match(problems.brows, /corner alpha/);
  assert.match(problems.mouth_wide, /missing/);
  assert.equal(problems.mouth_rest, "");
});

test("check:layers fails on too much offset", () => {
  const strict = JSON.parse(JSON.stringify(spec));
  strict.checks.maxOffsetPx = 2;
  const res = checkLayers(strict, FIXTURE_RAW, run("a"), { fixtures: true });
  assert.match(res.rows.find((r) => r.id === "mouth_round").problems.join(), /offset > 2 px/);
});

test("fixtures are refused as character art, and fixture mode stays in test/fixtures", () => {
  assert.throws(() => loadRaws(spec, FIXTURE_RAW, { fixtures: false }), /TEST FIXTURE/);
  assert.throws(() => processAll(spec, FIXTURE_RAW, path.join(ROOT, "art", "layers"), { fixtures: true }), /outside test\/fixtures/);
  assert.throws(() => processAll(spec, FIXTURE_RAW, run("x"), { fixtures: false }), /fixture folder/);
  for (const l of logA.layers) assert.ok(readPng(path.join(ROOT, l.file)).fixture, l.file);
});

test("the log names only repo-relative paths", () => {
  const text = JSON.stringify(logA);
  assert.ok(!text.includes(ROOT), "absolute path in the log");
});

test("CLI: check:layers on real art says what is missing and exits 1 while art/raw is empty", { skip: fs.readdirSync(path.join(ROOT, "art", "raw")).some((f) => f.endsWith(".png")) }, () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "check-layers.mjs")], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /missing in art\/raw\/: 01-master\.png/);
});

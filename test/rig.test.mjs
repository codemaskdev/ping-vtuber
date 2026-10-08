// lib/rig.mjs: pose → draw list.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { drawList, neutralPose, skeleton, validatePose } from "../lib/rig.mjs";
import { ROOT } from "../lib/spec.mjs";

const rig = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "rig.json"), "utf8"));
const N = () => neutralPose(rig);
const ids = (list) => list.map((d) => d.id);
const item = (list, id) => list.find((d) => d.id === id);

test("rig.json comes from the frozen regions, the process log and art/layers.json", () => {
  const regions = JSON.parse(fs.readFileSync(path.join(ROOT, "art", "regions.json"), "utf8"));
  const log = JSON.parse(fs.readFileSync(path.join(ROOT, "art", "process-log.json"), "utf8"));
  assert.deepEqual(rig.canvas, regions.canvas);
  assert.deepEqual(rig.headPivot, regions.layers.head.pivot);
  for (const l of rig.layers) {
    assert.deepEqual(l.pivot, regions.layers[l.id].pivot, l.id);
    if (l.kind === "mouth") assert.equal(l.anchorDy, log.mouthAnchors.mouths[l.id].anchorDy, l.id);
  }
  assert.equal(rig.browsRest.browsRestDy, rig.browsRest.gapPx - rig.browsRest.blockPx);
  assert.ok(rig.fitCheck.layers.every((f) => f.smallestRoomPx >= 0));
});

test("neutral pose: brows hidden like the logo and the master; every other default layer once, in z order", () => {
  assert.equal(rig.neutralPose.brows, "hidden");
  const d = drawList(rig, N());
  assert.deepEqual(ids(d), ["glow", "head", "cursor", "eyes_open", "mouth_rest"]);
  for (let i = 1; i < d.length; i++) assert.ok(d[i].z >= d[i - 1].z);
  for (const x of d) {
    assert.deepEqual(x.rotate, { deg: 0, centre: rig.headPivot });
    assert.deepEqual(x.translate, [0, 0]);
    assert.equal(x.file, rig.layers.find((l) => l.id === x.id).file);
  }
  assert.deepEqual(item(d, "mouth_rest").offset, [0, 0]);
  const shown = N(); shown.brows = { dy: rig.browsRest.browsRestDy };
  assert.deepEqual(item(drawList(rig, shown), "brows").offset, [0, rig.browsRest.browsRestDy]);
  assert.equal(item(d, "glow").opacity, 1);
});

test("head: tilt and shift apply to the head and every child", () => {
  const p = N(); p.head = { tilt: -3.5, x: 12, y: -7 };
  for (const x of drawList(rig, p)) {
    assert.deepEqual(x.rotate, { deg: -3.5, centre: rig.headPivot }, x.id);
    assert.deepEqual(x.translate, [12, -7], x.id);
  }
});

test("eyes: exactly one eyes layer, the one asked for", () => {
  for (const e of ["open", "closed"]) {
    const p = N(); p.eyes = e;
    assert.deepEqual(ids(drawList(rig, p)).filter((i) => i.startsWith("eyes_")), [`eyes_${e}`]);
  }
});

test("brows: dy moves only the brows; hidden drops them", () => {
  const p = N(); p.brows = { dy: -40 };
  const d = drawList(rig, p);
  assert.deepEqual(item(d, "brows").offset, [0, -40]);
  for (const x of d) if (x.id !== "brows" && x.id !== "mouth_rest") assert.deepEqual(x.offset, [0, 0], x.id);
  p.brows = "hidden";
  assert.ok(!ids(drawList(rig, p)).includes("brows"));
});

test("mouth: exactly one mouth layer, moved by its own anchorDy", () => {
  for (const m of ["rest", "small", "open", "round", "wide"]) {
    const p = N(); p.mouth = m;
    const d = drawList(rig, p);
    assert.deepEqual(ids(d).filter((i) => i.startsWith("mouth_")), [`mouth_${m}`]);
    assert.deepEqual(item(d, `mouth_${m}`).offset, [0, rig.layers.find((l) => l.id === `mouth_${m}`).anchorDy]);
  }
});

test("cursor: on draws it, off leaves it out", () => {
  const p = N(); p.cursor = false;
  assert.ok(!ids(drawList(rig, p)).includes("cursor"));
  p.cursor = true;
  assert.ok(ids(drawList(rig, p)).includes("cursor"));
});

test("glow: opacity reaches only the glow layer", () => {
  const p = N(); p.glow = 0.25;
  const d = drawList(rig, p);
  assert.equal(item(d, "glow").opacity, 0.25);
  for (const x of d) if (x.id !== "glow") assert.equal(x.opacity, 1);
});

test("poses outside the limits, unknown or missing fields are rejected, never clamped", () => {
  const L = rig.limits;
  const bad = [
    (p) => { p.head.tilt = L.headTiltDeg[1] + 0.001; },
    (p) => { p.head.tilt = L.headTiltDeg[0] - 1; },
    (p) => { p.head.x = L.headShiftPx.x[1] + 1; },
    (p) => { p.head.y = L.headShiftPx.y[0] - 1; },
    (p) => { p.head.tilt = Number.NaN; },
    (p) => { p.brows = { dy: L.browsDy[0] - 1 }; },
    (p) => { p.brows = { dy: L.browsDy[1] + 1 }; },
    (p) => { p.glow = 1.01; },
    (p) => { p.glow = -0.01; },
    (p) => { p.eyes = "half"; },
    (p) => { p.mouth = "fv"; },
    (p) => { p.cursor = "on"; },
    (p) => { p.nose = 1; },
    (p) => { delete p.mouth; },
    (p) => { p.head.z = 0; },
  ];
  for (const mutate of bad) {
    const p = N(); mutate(p);
    assert.throws(() => drawList(rig, p), /pose rejected/, mutate.toString());
  }
  // The limits themselves are allowed.
  const p = N(); p.head = { tilt: L.headTiltDeg[0], x: L.headShiftPx.x[1], y: L.headShiftPx.y[0] }; p.brows = { dy: L.browsDy[0] }; p.glow = 0;
  assert.doesNotThrow(() => validatePose(rig, p));
});

test("the same pose gives the same draw list, and the pose is not changed", () => {
  const p = N(); p.head.tilt = 2.25; p.mouth = "round";
  const before = JSON.stringify(p);
  assert.deepEqual(drawList(rig, p), drawList(rig, JSON.parse(before)));
  assert.equal(JSON.stringify(p), before);
});

test("skeleton: a pivot and a box per layer, parent links, the smile line, under the head's transform", () => {
  const p = N(); p.head.tilt = 4;
  const s = skeleton(rig, p);
  assert.equal(s.items.filter((i) => i.type === "cross").length, rig.layers.length);
  assert.equal(s.items.filter((i) => i.type === "rect").length, rig.layers.length);
  assert.equal(s.items.filter((i) => i.type === "line" && i.label !== "smile top").length, rig.layers.filter((l) => l.parent).length);
  assert.ok(s.items.some((i) => i.label === "smile top" && i.from[1] === rig.smileTop));
  assert.deepEqual(s.rotate, { deg: 4, centre: rig.headPivot });
});

test("lib/rig.mjs runs in a browser: no imports, no Node globals, no trigonometry", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib", "rig.mjs"), "utf8");
  assert.ok(!/^\s*import\s/m.test(src), "imports");
  assert.ok(!/\brequire\(|\bprocess\.|\bBuffer\b|node:/.test(src), "Node-only API");
  assert.ok(!/Math\.(sin|cos|tan|atan2?|pow|exp|log)/.test(src), "trigonometry");
});

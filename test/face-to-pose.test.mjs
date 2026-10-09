// lib/face-to-pose.mjs on numbers made by code (no camera, no face). Checked by eye by the author on 2026-10-09, no measurements.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { asinPoly, faceToPose, headFromMatrix } from "../lib/face-to-pose.mjs";
import { validatePose } from "../lib/rig.mjs";
import { ROOT } from "../lib/spec.mjs";

const rig = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "rig.json"), "utf8"));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "face.json"), "utf8"));
// Rotation about the camera axis with a given sine (cosine from it), translation in cm; column-major.
const matrix = (s, tx = 0, ty = 0) => { const c = Math.sqrt(1 - s * s); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, tx, ty, -40, 1]; };
const face = (b = {}, m = matrix(0)) => ({ blendshapes: b, matrix: m });

test("asinPoly is within 0.001 rad of the arcsine up to 44 degrees", () => {
  // Known values: asin(0.5) = pi/6, asin(sqrt(2)/2) = pi/4.
  assert.ok(Math.abs(asinPoly(0.5) - Math.PI / 6) < 0.001);
  assert.ok(Math.abs(asinPoly(0.7) - (Math.PI / 4) * 0.98) < 0.01);
  assert.equal(asinPoly(0), 0);
});

test("a neutral face gives the neutral pose, valid against the rig", () => {
  const { pose } = faceToPose(rig, cfg, face(), null);
  assert.deepEqual(pose, { head: { tilt: 0, x: 0, y: 0 }, eyes: "open", brows: "hidden", mouth: "rest", cursor: true, glow: 1 });
  assert.doesNotThrow(() => validatePose(rig, pose));
});

test("head roll and shift come from the matrix, mirrored, scaled and smoothed", () => {
  const h = headFromMatrix(matrix(0.5));
  assert.ok(Math.abs(h.rollDeg - 30) < 0.06, String(h.rollDeg));
  let r = faceToPose(rig, cfg, face({}, matrix(0, 2, 1)), null); // first frame sets the origin
  r = faceToPose(rig, cfg, face({}, matrix(0.1, 4, 2)), r.state);
  const target = { tilt: -((asinPoly(0.1) * 180) / Math.PI) * cfg.head.tiltGain, x: -(4 - 2) * cfg.head.shiftPxPerCm, y: -(2 - 1) * cfg.head.shiftPxPerCm };
  for (const k of ["tilt", "x", "y"]) assert.ok(Math.abs(r.pose.head[k] - target[k] * cfg.head.smoothing) < 1e-9, k);
});

test("tilt beyond the rig limit saturates and says so", () => {
  let r = null;
  for (let i = 0; i < 60; i++) r = faceToPose(rig, cfg, face({}, matrix(0.6)), r?.state ?? null);
  assert.equal(r.pose.head.tilt, rig.limits.headTiltDeg[0]);
  assert.ok(r.state.saturated.includes("tilt"));
  assert.doesNotThrow(() => validatePose(rig, r.pose));
});

test("blink has hysteresis: closes above closeAbove, stays closed until under openBelow", () => {
  const seq = [0.1, 0.6, 0.5, 0.4, 0.3, 0.5].map((v) => ({ eyeBlinkLeft: v, eyeBlinkRight: v }));
  let s = null;
  const eyes = seq.map((b) => { const r = faceToPose(rig, cfg, face(b), s); s = r.state; return r.pose.eyes; });
  assert.deepEqual(eyes, ["open", "closed", "closed", "closed", "open", "open"]);
});

test("mouth: pucker → round, jaw → open or small, smile → wide, nothing → rest", () => {
  const m = (b) => faceToPose(rig, cfg, face(b), null).pose.mouth;
  assert.equal(m({ mouthPucker: 0.5, jawOpen: 0.6 }), "round");
  assert.equal(m({ jawOpen: 0.6 }), "open");
  assert.equal(m({ mouthSmileLeft: 0.6, mouthSmileRight: 0.6, jawOpen: 0.1 }), "wide");
  assert.equal(m({ jawOpen: 0.2 }), "small");
  assert.equal(m({ jawOpen: 0.05 }), "rest");
});

test("brows appear with hysteresis and move up or down from their rest height within the limits", () => {
  let s = null;
  const step = (b) => { const r = faceToPose(rig, cfg, face(b), s); s = r.state; return r.pose.brows; };
  assert.equal(step({ browInnerUp: 0.25 }), "hidden");
  const up = step({ browInnerUp: 0.8 });
  assert.equal(up.dy, rig.limits.browsDy[0]);
  assert.notEqual(step({ browInnerUp: 0.25 }), "hidden", "stays shown above hideBelow");
  assert.equal(step({ browInnerUp: 0.1 }), "hidden");
  const down = faceToPose(rig, cfg, face({ browDownLeft: 0.7, browDownRight: 0.7 }), null).pose.brows;
  assert.equal(down.dy, rig.limits.browsDy[1]);
});

test("no face keeps the last head and opens nothing new; same input, same output", () => {
  const a = faceToPose(rig, cfg, null, null), b = faceToPose(rig, cfg, null, null);
  assert.deepEqual(a, b);
  assert.equal(a.pose.mouth, "rest");
});

test("lib/face-to-pose.mjs has no MediaPipe, no imports, no trigonometry", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib", "face-to-pose.mjs"), "utf8");
  assert.ok(!/^\s*import\s/m.test(src) && !/mediapipe|tasks-vision/i.test(src.replace(/^\/\/.*$/gm, "")) && !/Math\.(sin|cos|tan|asin|acos|atan2?|pow|exp|log)\b/.test(src));
});

test("the synthetic stream (made by code) plays through face-to-pose into valid poses, the same every time", async () => {
  const { syntheticStream, playStream } = await import("../scripts/face-stream.mjs");
  const a = playStream(rig, cfg, syntheticStream(1)), b = playStream(rig, cfg, syntheticStream(1));
  assert.deepEqual(a, b);
  assert.equal(a.poses.length, 300);
  for (const p of a.poses) assert.doesNotThrow(() => validatePose(rig, p));
  assert.ok(a.poses.some((p) => p.eyes === "closed") && a.poses.some((p) => p.brows !== "hidden"));
  assert.notDeepEqual(syntheticStream(1)[100], syntheticStream(2)[100]);
});

// lib/lipsync-volume.mjs on synthetic signals made by code (no speech).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { frameCount, frameRms, lipsyncVolume } from "../lib/lipsync-volume.mjs";
import { combine } from "../lib/pose.mjs";
import { livenessAt } from "../lib/liveness.mjs";
import { neutralPose, drawList } from "../lib/rig.mjs";
import { ROOT } from "../lib/spec.mjs";

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "lipsync-volume.json"), "utf8"));
const rig = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "rig.json"), "utf8"));
const SR = 44100, FPS = 30;
// A square wave: its RMS equals its amplitude exactly, so the tests need no sine.
const square = (seconds, amp, period = 100) => Float32Array.from({ length: seconds * SR }, (_, i) => ((Math.floor(i / (period / 2)) & 1) ? -amp : amp));

test("silence gives rest on every frame", () => {
  const r = lipsyncVolume(new Float32Array(SR), SR, FPS, cfg);
  assert.equal(r.mouths.length, 30);
  assert.ok(r.mouths.every((m) => m === "rest"));
});

test("a loud tone gives open, a quiet tone gives small", () => {
  assert.ok(lipsyncVolume(square(1, cfg.openFrom * 2), SR, FPS, cfg).mouths.every((m) => m === "open"));
  assert.ok(lipsyncVolume(square(1, (cfg.restBelow + cfg.openFrom) / 2), SR, FPS, cfg).mouths.every((m) => m === "small"));
  assert.ok(lipsyncVolume(square(1, cfg.restBelow / 2), SR, FPS, cfg).mouths.every((m) => m === "rest"));
});

test("each frame reads only its own window: no smoothing, no hysteresis, no look-ahead", () => {
  const s = new Float32Array(SR); // 30 frames of silence with one loud frame (frame 10) in the middle
  const a = Math.floor((10 * SR) / FPS), b = Math.floor((11 * SR) / FPS);
  for (let i = a; i < b; i++) s[i] = (i & 1) ? -0.5 : 0.5;
  const m = lipsyncVolume(s, SR, FPS, cfg).mouths;
  assert.equal(m[10], "open");
  assert.equal(m[9], "rest");
  assert.equal(m[11], "rest");
  assert.equal(frameRms(s, SR, FPS)[10], 0.5);
});

test("same input, same output; frame count rounds up", () => {
  const s = square(2, 0.05);
  assert.deepEqual(lipsyncVolume(s, SR, FPS, cfg), lipsyncVolume(Float32Array.from(s), SR, FPS, cfg));
  assert.equal(frameCount(SR + 1, SR, FPS), 31);
  assert.throws(() => lipsyncVolume(s, SR, FPS, { restBelow: 0.1, openFrom: 0.1 }), /restBelow must be below openFrom/);
});

test("the mouth plugs into combine() next to liveness, and only one mouth is drawn", () => {
  const pose = combine(rig, neutralPose(rig), livenessAt(JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "liveness.json"), "utf8")), 1, 90, FPS), { mouth: "open" });
  assert.equal(pose.mouth, "open");
  assert.deepEqual(drawList(rig, pose).map((d) => d.id).filter((i) => i.startsWith("mouth_")), ["mouth_open"]);
});

test("lib/lipsync-volume.mjs runs in a browser: no imports, no Node API, no logarithms", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib", "lipsync-volume.mjs"), "utf8");
  assert.ok(!/^\s*import\s/m.test(src));
  assert.ok(!/\bprocess\.|\bBuffer\b|node:|Math\.(log|pow|exp|sin|cos)/.test(src));
});

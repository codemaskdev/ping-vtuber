// The HyperFrames side: rig.json up to date, the preview project, the adapter, and the sequences.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { neutralPose } from "../lib/rig.mjs";
import { ROOT } from "../lib/spec.mjs";
import { buildRig } from "../scripts/build-rig.mjs";
import { checkSequence, rig, rigSequences } from "../scripts/build-preview.mjs";

test("rig/rig.json is what scripts/build-rig.mjs writes now", () => {
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "rig.json"), "utf8")), JSON.parse(JSON.stringify(buildRig().rig)));
});

test("the preview pins the HyperFrames version of the episodes pipeline, 0.8.134", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "preview", "package.json"), "utf8"));
  for (const s of Object.values(pkg.scripts)) assert.match(s, /hyperframes@0\.8\.134 /);
  const builder = fs.readFileSync(path.join(ROOT, "scripts", "build-preview.mjs"), "utf8");
  assert.ok(!/hyperframes@(?!0\.8\.134)/.test(builder));
});

test("the adapter only paints: no rig logic, no pose fields, no limits", () => {
  const src = fs.readFileSync(path.join(ROOT, "rig", "adapter.js"), "utf8");
  for (const word of ["anchorDy", "limits", "pose", "eyes", "mouth", "brows", "browsRestDy", "parent"]) assert.ok(!src.includes(word), word);
});

test("a final render never carries the debug skeleton", () => {
  const seqs = rigSequences();
  for (const [name, s] of Object.entries(seqs)) if (s.final) assert.ok(s.entries.every((e) => !e.skeleton), name);
  assert.throws(() => checkSequence("x", { final: true, entries: [{ label: "debug", pose: neutralPose(rig), skeleton: true }] }), /debug skeleton is not allowed/);
  assert.doesNotThrow(() => checkSequence("y", { final: false, entries: [{ label: "debug", pose: neutralPose(rig), skeleton: true }] }));
});

test("the pose sheet has every cell the author asked for, and every sequence's poses pass the limits", () => {
  const labels = rigSequences()["pose-sheet"].entries.map((e) => e.label);
  for (const want of ["neutral", "eyes closed", "mouth rest", "mouth small", "mouth open", "mouth round", "mouth wide", "cursor off", "neutral + skeleton"]) assert.ok(labels.includes(want), want);
  for (const prefix of ["brows as drawn", "brows at browsRestDy", "brows raised", "head tilt -", "head tilt 4", "head shift"]) assert.ok(labels.some((l) => l.startsWith(prefix)), prefix);
  for (const [name, s] of Object.entries(rigSequences())) assert.doesNotThrow(() => checkSequence(name, s), name);
});

test("the clip holds each pose for whole frames: framesPerEntry at fps, no easing", () => {
  const c = rigSequences().clip;
  assert.equal(c.fps, 30);
  assert.equal(c.framesPerEntry, 15);
  assert.equal(c.entries.length * c.framesPerEntry, 120);
});

test("the liveness clip is a final render of 10 s at 30 fps for one seed", async () => {
  const { livenessSequence } = await import("../scripts/build-preview.mjs");
  const s = livenessSequence(1);
  assert.deepEqual([s.kind, s.seed, s.fps, s.frames, s.final], ["liveness", 1, 30, 300, true]);
  assert.throws(() => livenessSequence(-1), /seed/);
});

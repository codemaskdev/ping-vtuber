// lib/liveness.mjs and lib/pose.mjs.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { blinkSchedule, livenessAt, livenessParts, microSchedule } from "../lib/liveness.mjs";
import { combine } from "../lib/pose.mjs";
import { mulberry32 } from "../lib/rng.mjs";
import { neutralPose } from "../lib/rig.mjs";
import { ROOT } from "../lib/spec.mjs";

const rig = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "rig.json"), "utf8"));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "liveness.json"), "utf8"));
const FPS = 30, FRAMES = 60 * FPS;

test("same seed and frame give the same partial pose in any call order", () => {
  const frames = Array.from({ length: 600 }, (_, i) => i);
  const forward = frames.map((f) => JSON.stringify(livenessAt(cfg, 7, f, FPS)));
  const rng = mulberry32(99), shuffled = [...frames];
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const seen = new Map(shuffled.map((f) => [f, JSON.stringify(livenessAt(cfg, 7, f, FPS))]));
  for (const f of frames) assert.equal(seen.get(f), forward[f], `frame ${f}`);
  // Asking a late frame first changes nothing for an early one.
  livenessAt(cfg, 7, 1799, FPS);
  assert.equal(JSON.stringify(livenessAt(cfg, 7, 3, FPS)), forward[3]);
});

test("another seed gives another schedule", () => {
  const a = blinkSchedule(cfg, 1, 60), b = blinkSchedule(cfg, 2, 60);
  assert.notDeepEqual(a.map((x) => x.start), b.map((x) => x.start));
  assert.notDeepEqual(microSchedule(cfg, 1, 60).map((x) => x.tilt), microSchedule(cfg, 2, 60).map((x) => x.tilt));
});

test("blinks never overlap, keep their lengths and gaps, and sometimes come double", () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const s = blinkSchedule(cfg, seed, 300);
    for (let i = 0; i < s.length; i++) {
      const len = s[i].end - s[i].start;
      assert.ok(len >= cfg.blink.closedS[0] && len <= cfg.blink.closedS[1], `seed ${seed} blink ${i} length ${len}`);
      if (i) {
        const gap = s[i].start - s[i - 1].end;
        const [lo, hi] = s[i].double ? cfg.blink.doubleGapS : cfg.blink.intervalS;
        assert.ok(gap >= lo && gap <= hi, `seed ${seed} blink ${i} gap ${gap}`);
      }
    }
  }
  assert.ok([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].some((seed) => blinkSchedule(cfg, seed, 300).some((b) => b.double)));
});

test("every frame of a 60 second run stays inside the pose limits, with room left", () => {
  const L = rig.limits;
  let maxTilt = 0, maxX = 0, maxY = 0;
  for (let f = 0; f < FRAMES; f++) {
    const pose = combine(rig, neutralPose(rig), livenessAt(cfg, 1, f, FPS));
    maxTilt = Math.max(maxTilt, Math.abs(pose.head.tilt));
    maxX = Math.max(maxX, Math.abs(pose.head.x));
    maxY = Math.max(maxY, Math.abs(pose.head.y));
  }
  assert.ok(maxTilt <= L.headTiltDeg[1] / 4, `tilt ${maxTilt}`);
  assert.ok(maxX <= L.headShiftPx.x[1] / 4 && maxY <= L.headShiftPx.y[1] / 4, `shift ${maxX}, ${maxY}`);
});

test("liveness eases: the drift moves less than 0.1 degree and 0.5 px from one frame to the next", () => {
  for (let f = 1; f < FRAMES; f++) {
    const a = livenessParts(cfg, 1, f - 1, FPS).micro, b = livenessParts(cfg, 1, f, FPS).micro;
    assert.ok(Math.abs(a.tilt - b.tilt) < 0.1 && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5, `frame ${f}`);
  }
});

test("the cursor blinks on and off at the configured rate, starting on", () => {
  const on = [0, 1, 15].map((f) => livenessAt(cfg, 1, f, FPS).cursor);
  assert.deepEqual(on, [true, true, true]);
  assert.equal(livenessAt(cfg, 1, 16, FPS).cursor, false); // 16/30 = 0.533 s
  assert.equal(livenessAt(cfg, 1, 32, FPS).cursor, true); // 32/30 = 1.067 s, the next period
});

test("combine: head offsets add, eyes closed and cursor off win, the last setter wins, limits reject", () => {
  const base = neutralPose(rig);
  const p = combine(rig, base, { head: { tilt: 1, x: 2, y: 3 } }, { head: { tilt: 0.5, y: -1 }, eyes: "closed" }, { eyes: "open", cursor: false }, { mouth: "open" }, { mouth: "round" });
  assert.deepEqual(p.head, { tilt: 1.5, x: 2, y: 2 });
  assert.equal(p.eyes, "closed");
  assert.equal(p.cursor, false);
  assert.equal(p.mouth, "round");
  assert.deepEqual(base, neutralPose(rig), "the base pose is not changed");
  assert.throws(() => combine(rig, base, { head: { tilt: 3 } }, { head: { tilt: 2 } }), /pose rejected: head.tilt 5/);
  assert.throws(() => combine(rig, base, { nose: 1 }), /unknown field nose/);
});

test("lib/liveness.mjs and lib/pose.mjs run in a browser: only relative imports, no trigonometry", () => {
  for (const f of ["liveness.mjs", "pose.mjs", "rng.mjs"]) {
    const src = fs.readFileSync(path.join(ROOT, "lib", f), "utf8");
    for (const m of src.matchAll(/^\s*import .* from "([^"]+)"/gm)) assert.match(m[1], /^\.\/[a-z]+\.mjs$/, `${f}: ${m[1]}`);
    assert.ok(!/Math\.(sin|cos|tan|atan2?|pow|exp|log)\b/.test(src), f);
    assert.ok(!/\bprocess\.|\bBuffer\b|node:/.test(src), f);
  }
});

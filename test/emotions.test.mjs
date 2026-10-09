// lib/emotions.mjs and lib/script-tags.mjs.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { emotionAt, speechPartial, speechSpan } from "../lib/emotions.mjs";
import { livenessAt } from "../lib/liveness.mjs";
import { combine } from "../lib/pose.mjs";
import { neutralPose } from "../lib/rig.mjs";
import { marksFromAlignment, parseTags } from "../lib/script-tags.mjs";
import { ROOT } from "../lib/spec.mjs";

const rig = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "rig.json"), "utf8"));
const E = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "emotions.json"), "utf8"));
const L = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "liveness.json"), "utf8"));
const states = Object.keys(E.states);

test("three states besides neutral (focused removed by eye, prompt #20), each a partial pose with a reason, each valid on its own and with liveness", () => {
  assert.deepEqual([...states].sort(), ["happy", "sleepy", "surprised"]);
  assert.ok(!E.demoMarks.some((m) => m.state === "focused"));
  assert.equal(E.states.happy.partial.head.tilt, 6);
  assert.ok(E.states.happy.chosenByEye && E.removedByEye.focused);
  for (const s of states) {
    assert.ok(E.states[s].why, s);
    assert.doesNotThrow(() => combine(rig, neutralPose(rig), E.states[s].partial), s);
    for (let f = 0; f < 1800; f += 7) assert.doesNotThrow(() => combine(rig, neutralPose(rig), livenessAt(L, 1, f, 30), E.states[s].partial), `${s} frame ${f}`);
  }
});

test("a mark eases in over transitionFrames: discrete parts switch at the middle, numbers ease", () => {
  const marks = [{ frame: 0, state: "neutral" }, { frame: 10, state: "surprised" }];
  assert.deepEqual(emotionAt(rig, E, marks, 9), { head: { tilt: 0, x: 0, y: 0 } });
  const start = emotionAt(rig, E, marks, 10), mid = emotionAt(rig, E, marks, 10 + E.transitionFrames / 2), end = emotionAt(rig, E, marks, 10 + E.transitionFrames);
  assert.equal(start.mouth, undefined);
  assert.equal(mid.mouth, "round");
  assert.equal(end.head.y, -4);
  assert.equal(end.brows.dy, -47);
  assert.ok(mid.head.y < 0 && mid.head.y > -4);
  assert.deepEqual(emotionAt(rig, E, marks, 500), end, "the state holds after the transition");
});

test("same frame, same answer, whatever the call order", () => {
  const f = Array.from({ length: 300 }, (_, i) => i);
  const a = f.map((x) => JSON.stringify(emotionAt(rig, E, E.demoMarks, x)));
  const b = [...f].reverse().map((x) => JSON.stringify(emotionAt(rig, E, E.demoMarks, x))).reverse();
  assert.deepEqual(a, b);
});

test("during speech the lip sync mouth wins; outside it the emotion's mouth shows", () => {
  const align = { characters: [..."hi"], character_start_times_seconds: [0.5, 0.6], character_end_times_seconds: [0.6, 0.7] };
  const span = speechSpan(align, 30);
  assert.deepEqual(span, { first: 15, last: 20 });
  const mouths = new Array(30).fill("small");
  const happy = emotionAt(rig, E, [{ frame: 0, state: "happy" }], 18);
  assert.equal(combine(rig, neutralPose(rig), happy, speechPartial(mouths, span, 18)).mouth, "small");
  assert.equal(combine(rig, neutralPose(rig), happy, speechPartial(mouths, span, 25)).mouth, E.states.happy.partial.mouth);
  assert.equal(combine(rig, neutralPose(rig), emotionAt(rig, E, [{ frame: 0, state: "surprised" }], 25), speechPartial(mouths, span, 25)).mouth, "round");
});

test("tags: parsed out of the text, indices point at the next word, unknown tags fail", () => {
  const r = parseTags("Hello. [happy] I am Ping. [surprised]Oh wow.[neutral]", states);
  assert.equal(r.clean, "Hello. I am Ping. Oh wow.");
  assert.deepEqual(r.tags, [{ index: 7, state: "happy" }, { index: 18, state: "surprised" }, { index: 25, state: "neutral" }]);
  assert.equal(r.clean[7], "I");
  assert.throws(() => parseTags("Hi [angry] there", states), /unknown emotion tag \[angry\]/);
  assert.throws(() => parseTags("Hi [happy there", states), /unbalanced/);
  assert.deepEqual(parseTags("no tags", states), { clean: "no tags", tags: [] });
});

test("tags become marks at the frame of their character's start, or after the last one", () => {
  const { clean, tags } = parseTags("[happy]Hi [sleepy]yo[neutral]", states);
  const align = { characters: [...clean], character_start_times_seconds: [...clean].map((_, i) => i * 0.1), character_end_times_seconds: [...clean].map((_, i) => (i + 1) * 0.1) };
  assert.deepEqual(marksFromAlignment(tags, align, 30), [{ frame: 0, state: "happy" }, { frame: 9, state: "sleepy" }, { frame: 15, state: "neutral" }]);
});

test("emotions and tags modules run in a browser: no imports, no Node API, no trigonometry", () => {
  for (const f of ["emotions.mjs", "script-tags.mjs"]) {
    const src = fs.readFileSync(path.join(ROOT, "lib", f), "utf8");
    assert.ok(!/^\s*import\s/m.test(src) && !/\bprocess\.|\bBuffer\b|node:|Math\.(sin|cos|pow|exp|log)/.test(src), f);
  }
});

// lib/line.mjs: how liveness, emotion and lip sync combine on a spoken line (author's prompt #22).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { linePose } from "../lib/line.mjs";
import { livenessAt } from "../lib/liveness.mjs";
import { ROOT } from "../lib/spec.mjs";

const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
const rig = read("rig/rig.json"), LC = read("rig/liveness.json"), EC = read("rig/emotions.json");
const blinkFrame = (seed) => { for (let f = 0; f < 3000; f++) if (livenessAt(LC, seed, f, 30).eyes === "closed") return f; return -1; };
const openFrame = (seed) => { for (let f = 40; f < 3000; f++) if (livenessAt(LC, seed, f, 30).eyes !== "closed") return f; return -1; };

test("mouth: speech inside the span wins over the emotion's mouth; outside it the emotion's mouth shows", () => {
  const line = { seed: 1, marks: [{ frame: 0, state: "surprised" }], mouths: new Array(30).fill("small"), span: { first: 5, last: 20 } };
  assert.equal(linePose(rig, LC, EC, line, 10, 30).mouth, "small");
  assert.equal(linePose(rig, LC, EC, line, 25, 30).mouth, "round"); // surprised's mouth, after the span
  const neutral = { ...line, marks: [] };
  assert.equal(linePose(rig, LC, EC, neutral, 25, 30).mouth, "rest");
});

test("eyes: closed wins (sleepy keeps them shut, a blink shuts them during happy); speech never opens them", () => {
  const f = openFrame(1);
  const sleepy = { seed: 1, marks: [{ frame: 0, state: "sleepy" }], mouths: new Array(400).fill("open"), span: { first: 0, last: 399 } };
  assert.equal(linePose(rig, LC, EC, sleepy, f, 30).eyes, "closed");
  const b = blinkFrame(1), happy = { ...sleepy, marks: [{ frame: 0, state: "happy" }] };
  assert.equal(linePose(rig, LC, EC, happy, b, 30).eyes, "closed");
  assert.equal(linePose(rig, LC, EC, happy, f, 30).eyes, "open");
});

test("brows come from the emotion only; the head is liveness plus the emotion", () => {
  const line = { seed: 1, marks: [{ frame: 0, state: "happy" }], mouths: [], span: null };
  const p = linePose(rig, LC, EC, line, 60, 30), l = livenessAt(LC, 1, 60, 30);
  assert.deepEqual(p.brows, EC.states.happy.partial.brows);
  for (const k of ["tilt", "x", "y"]) assert.ok(Math.abs(p.head[k] - ((l.head?.[k] || 0) + EC.states.happy.partial.head[k])) < 1e-9, k);
  assert.equal(linePose(rig, LC, EC, { ...line, marks: [] }, 60, 30).brows, "hidden");
  assert.equal(p.cursor, l.cursor === false ? false : true);
});

test("every state with liveness and speech stays inside the rig limits for 60 s", () => {
  for (const state of ["neutral", ...Object.keys(EC.states)]) {
    const line = { seed: 1, marks: [{ frame: 0, state }], mouths: new Array(1800).fill("round"), span: { first: 0, last: 1799 } };
    for (let f = 0; f < 1800; f += 7) assert.doesNotThrow(() => linePose(rig, LC, EC, line, f, 30), `${state} frame ${f}`);
  }
});

test("rig/lines.json: the six lines, text as in the script, one tag at most, v3", () => {
  const L = read("rig/lines.json");
  assert.deepEqual(Object.keys(L.lines), ["hook", "alive", "fix", "emotions", "webcam", "outro"]);
  assert.equal(L.lipSync, "v3");
  assert.equal(L.lines.outro.tailSeconds, 3);
  for (const l of Object.values(L.lines)) assert.ok((l.text.match(/\[/g) || []).length <= 1);
});

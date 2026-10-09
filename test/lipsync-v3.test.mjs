// Lip sync v3 (author's prompt #18), and v2 unchanged beside it.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { decode } from "../lib/audio.mjs";
import { lipsyncText } from "../lib/lipsync-text.mjs";
import { frameWinners, growOrRemove, lipsyncV3, rescueClosures } from "../lib/lipsync-v3.mjs";
import { frameCount } from "../lib/lipsync-volume.mjs";
import { ROOT } from "../lib/spec.mjs";

const v2rules = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "lipsync-text.json"), "utf8"));
const v3rules = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "lipsync-v3.json"), "utf8"));
const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, "test", "v2-snapshot.json"), "utf8")).phrases;
const align = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "raw", `${p}.align.json`), "utf8")).alignment;
const frames = (p) => { const d = decode(path.join(ROOT, "audio", "dev", `${p}.mp3`)); return frameCount(d.samples.length, d.sampleRate, 30); };

test("v2 gives exactly the mouths recorded before v3 was written, on every seen phrase", () => {
  for (const [p, s] of Object.entries(snapshot)) assert.equal(lipsyncText(align(p), 30, v2rules, s.frames).mouths.join(" "), s.mouths, p);
});

test("v3's rule 1 is v2's majority rule: the same classes before rescue and runs", () => {
  for (const [p, s] of Object.entries(snapshot)) assert.deepEqual(frameWinners(align(p), 30, v3rules, s.frames).classes, lipsyncText(align(p), 30, v2rules, s.frames).rawClasses, p);
});

test("v3 is labelled and keeps v2's letter rules", () => {
  assert.equal(v3rules.changedAfterSeeing.label, "changed after seeing P1 to P3 and H1 to H4");
  for (const k of ["letters", "y", "otherLetters", "pairs", "silentFinalE", "pronounI", "classes", "priority", "minFrames"]) assert.deepEqual(v3rules[k], v2rules[k], k);
});

test("rule 2: a closing letter with no frame takes the frame it overlaps most", () => {
  // a 0..0.05, b 0.05..0.06, o 0.06..0.2 at 30 fps: b wins no frame; it overlaps frame 1 (0.0333..0.0667) most.
  const al = { characters: ["a", "b", "o"], character_start_times_seconds: [0, 0.05, 0.06], character_end_times_seconds: [0.05, 0.06, 0.2] };
  const w = frameWinners(al, 30, v3rules, 6);
  assert.ok(!w.winner.includes(1));
  const r = rescueClosures(al, 30, v3rules, w.classes, w.winner, w.letters);
  assert.equal(r.classes[1], "closure");
  assert.deepEqual(r.rescued.map((x) => [x.letter, x.frame]), [["b", 1]]);
});

test("rule 3: grow from the longer neighbour (tie: the later one), else remove; a closure run is never removed", () => {
  const g = (c) => growOrRemove(c, v3rules).classes;
  assert.deepEqual(g(["open", "open", "open", "wide", "round", "round"]), ["open", "open", "wide", "wide", "round", "round"]);
  assert.deepEqual(g(["open", "open", "open", "wide", "round", "round", "round"]), ["open", "open", "open", "wide", "wide", "round", "round"]);
  assert.deepEqual(g(["open", "open", "wide", "round", "round"]), ["open", "open", "open", "round", "round"]);
  assert.deepEqual(g(["open", "open", "closure", "round", "round"]), ["open", "open", "closure", "round", "round"]);
});

test("v3 on every seen phrase: every m, b, p, f, v shows a closure frame; only closure runs are shorter than the minimum", () => {
  for (const [p, s] of Object.entries(snapshot)) {
    const al = align(p), r = lipsyncV3(al, 30, v3rules, s.frames);
    al.characters.forEach((c, k) => {
      if (!/^[mbpfv]$/i.test(c) || r.letters[k].cls !== "closure") return;
      const a = al.character_start_times_seconds[k], b = al.character_end_times_seconds[k];
      assert.ok(r.classes.some((x, f) => x === "closure" && a < (f + 1) / 30 && b > f / 30), `${p}: ${c} at ${a}`);
    });
    for (let i = 0, st = 0; i <= r.classes.length; i++) if (i === r.classes.length || r.classes[i] !== r.classes[st]) { if (i - st < v3rules.minFrames) assert.equal(r.classes[st], "closure", `${p} frame ${st}`); st = i; }
    assert.equal(r.mouths.length, s.frames);
  }
});

test("lib/lipsync-v3.mjs runs in a browser: relative imports only, no trigonometry", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib", "lipsync-v3.mjs"), "utf8");
  for (const m of src.matchAll(/^import .* from "([^"]+)";$/gm)) assert.match(m[1], /^\.\//);
  assert.ok(!/Math\.(sin|cos|tan|atan2?|pow|exp|log)|process\.|node:/.test(src));
  assert.ok(frames("P1") > 0);
});

test("rule 3 never takes the last closure frame of a closing letter (decided after H2's \"brought\")", () => {
  // closure 0..2 (a letter b overlaps only frame 2), a one-frame small at 3, round 4..5. The small run cannot take
  // frame 2 and round cannot give (it would drop below 2), so the small run is removed into the closure before it.
  const keepLast = (f, now) => !(f === 2 && now[2] === "closure");
  assert.deepEqual(growOrRemove(["closure", "closure", "closure", "small", "round", "round"], v3rules, keepLast).classes, ["closure", "closure", "closure", "closure", "round", "round"]);
  // Without the protection it grows into frame 2.
  assert.deepEqual(growOrRemove(["closure", "closure", "closure", "small", "round", "round"], v3rules).classes, ["closure", "closure", "small", "small", "round", "round"]);
});

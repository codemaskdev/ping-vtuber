// lib/lipsync-text.mjs: letter classes, frame mapping, minimum run length.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { enforceMinFrames, frameClasses, letterClasses, lipsyncText } from "../lib/lipsync-text.mjs";
import { ROOT } from "../lib/spec.mjs";

const rules = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "lipsync-text.json"), "utf8"));
const cls = (text) => letterClasses(text, rules).map((x) => x.cls);
// An alignment with every character lasting `d` seconds.
const even = (text, d) => ({ characters: [...text], character_start_times_seconds: [...text].map((_, i) => i * d), character_end_times_seconds: [...text].map((_, i) => (i + 1) * d) });

test("letters map as the rules say, and every rule has a reason", () => {
  assert.deepEqual(cls("mbpfv"), ["closure", "closure", "closure", "closure", "closure"]);
  assert.deepEqual(cls("o u w a"), ["round", "gap", "round", "gap", "round", "gap", "open"]);
  assert.deepEqual(cls("kt"), ["small", "small"]);
  assert.deepEqual(cls("hi."), ["small", "wide", "gap"]);
  for (const [k, v] of Object.entries(rules.letters)) assert.ok(v.why, k);
  for (const p of rules.pairs) assert.ok(p.why, p.letters);
  for (const k of ["y", "otherLetters", "silentFinalE", "pronounI"]) assert.ok(rules[k].why, k);
  assert.ok(rules.priorityWhy && rules.minFramesWhy);
});

test("y: a consonant before a vowel at a word start, a vowel elsewhere; open when it is a word's only vowel", () => {
  assert.equal(letterClasses("you", rules)[0].rule, "y consonant");
  assert.equal(letterClasses("very", rules)[3].rule, "y vowel");
  assert.equal(letterClasses("very", rules)[3].cls, "wide");
  // Changed after seeing words.txt (author's prompt #16): "My" came out wide; it sounds like "I".
  for (const w of ["my", "by", "why", "My"]) {
    const y = letterClasses(w, rules).at(-1);
    assert.deepEqual([y.cls, y.rule], ["open", "y only vowel"], w);
  }
  assert.ok(rules.y.onlyVowel.changedAfterSeeing);
});

test("ou and ow: the first letter open, the second round; you and your stay round (author's prompt #16)", () => {
  assert.deepEqual(cls("mouth"), ["closure", "open", "round", "small", "small"]);
  assert.deepEqual(cls("sound"), ["small", "open", "round", "small", "small"]);
  assert.deepEqual(cls("loud"), ["small", "open", "round", "small"]);
  assert.deepEqual(cls("wow"), ["round", "open", "round"]);
  assert.deepEqual(cls("you"), ["small", "round", "round"]);
  assert.deepEqual(cls("your"), ["small", "round", "round", "small"]);
  for (const p of rules.pairs.filter((x) => ["ou", "ow"].includes(x.letters))) assert.ok(p.changedAfterSeeing && p.before, p.letters);
  assert.equal(rules.changedAfterSeeing.length, 3);
});

test("pairs, silent final e and the pronoun I", () => {
  assert.deepEqual(cls("the"), ["small", "small", "wide"]);
  assert.deepEqual(cls("soon"), ["small", "round", "round", "small"]);
  assert.deepEqual(cls("move"), ["closure", "round", "closure", "closure"]); // silent e takes v's class
  assert.equal(letterClasses("live", rules)[3].rule, "silent final e");
  assert.equal(letterClasses("see", rules)[2].rule, "pair ee");
  assert.equal(letterClasses("I am", rules)[0].cls, "open");
});

test("when letters of two classes share a frame, the higher priority wins", () => {
  // "am" in one frame at 30 fps: a (open) and m (closure) both overlap frame 0 → closure wins.
  const r = lipsyncText(even("am", 1 / 60), 30, rules, 1);
  assert.equal(r.rawClasses[0], "closure");
});

test("no run is shorter than minFrames, and gaps are rest", () => {
  const r = lipsyncText(even("hello. i am ping.", 0.05), 30, rules);
  const runs = [];
  for (let i = 0, s = 0; i <= r.mouths.length; i++) if (i === r.mouths.length || r.mouths[i] !== r.mouths[s]) { runs.push(i - s); s = i; }
  assert.ok(runs.every((l) => l >= rules.minFrames), JSON.stringify(runs));
  assert.deepEqual(enforceMinFrames(["gap", "closure", "gap", "gap"], rules), ["closure", "closure", "gap", "gap"]);
  assert.deepEqual(enforceMinFrames(["open", "open", "small", "open", "open"], rules), ["open", "open", "open", "open", "open"]);
  const tail = lipsyncText(even("a", 0.1), 30, rules, 10);
  assert.equal(tail.mouths.at(-1), "rest");
});

test("same input, same output; runs in a browser (no imports, no Node API)", () => {
  const a = even("my mouth moves", 0.04);
  assert.deepEqual(lipsyncText(a, 30, rules), lipsyncText(JSON.parse(JSON.stringify(a)), 30, rules));
  const src = fs.readFileSync(path.join(ROOT, "lib", "lipsync-text.mjs"), "utf8");
  assert.ok(!/^\s*import\s/m.test(src) && !/\bprocess\.|\bBuffer\b|node:/.test(src));
});

test("a frame takes the character that covers most of it; priority only breaks ties (author's prompt #17)", () => {
  assert.equal(rules.frameRule.mode, "majority");
  assert.ok(rules.frameRule.changedAfterSeeing && rules.frameRule.before);
  // m 0..0.02, o 0.02..0.1, v 0.1..0.12 at 30 fps: frame 0 (0..0.0333) is mostly m, frames 1 and 2 are o, frame 3
  // (0.1..0.1333) is mostly v (20 ms against 13.3 ms that no character covers).
  const align = { characters: ["m", "o", "v"], character_start_times_seconds: [0, 0.02, 0.1], character_end_times_seconds: [0.02, 0.1, 0.12] };
  const { classes } = frameClasses(align, 30, rules, 4);
  assert.deepEqual(classes, ["closure", "round", "round", "closure"]);
  // An exact tie goes to the higher priority (closure beats round).
  const tie = { characters: ["o", "m"], character_start_times_seconds: [0, 0.5], character_end_times_seconds: [0.5, 1] };
  assert.equal(frameClasses(tie, 1, rules, 1).classes[0], "closure");
  // The rules before prompt #17 (no frameRule): any overlap, highest priority.
  const before = { ...rules };
  delete before.frameRule;
  assert.equal(frameClasses(align, 30, before, 1).classes[0], "closure");
});

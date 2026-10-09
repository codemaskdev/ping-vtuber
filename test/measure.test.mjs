// The measurement (MEASUREMENT.md): reference segments, mouth reading, offsets; and on P1-P3 that the mouth read from
// the pixels of the finished mp4 agrees with the draw list the clip was built from.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { brightFeatures, changesTable, classifyMouth, closureScore, offsets, restInPause, soundSegments, summary } from "../lib/measure.mjs";
import { ROOT } from "../lib/spec.mjs";

const SR = 1000;
const signal = (parts) => Float32Array.from(parts.flatMap(([ms, amp]) => Array.from({ length: ms }, (_, i) => (i % 2 ? amp : -amp))));
const P = { windowS: 0.01, hopS: 0.001, threshold: 0.01, minPauseS: 0.08 };

test("sound segments: quiet shorter than the minimum pause stays inside the sound; file edges are pause edges", () => {
  const r = soundSegments(signal([[50, 0], [200, 0.5], [40, 0], [100, 0.5], [120, 0], [100, 0.5], [60, 0]]), SR, P);
  assert.equal(r.segments.length, 2);
  assert.ok(Math.abs(r.segments[0].start - 0.05) <= 0.006 && Math.abs(r.segments[0].end - 0.39) <= 0.006, JSON.stringify(r.segments));
  assert.ok(Math.abs(r.segments[1].start - 0.51) <= 0.006 && Math.abs(r.segments[1].end - 0.61) <= 0.006);
  assert.deepEqual(r.pauses.map((p) => [p.leading ?? false, p.trailing ?? false, p.before]), [[true, false, 0], [false, false, 1], [false, true, null]]);
});

test("mouth templates: nearest bright box, unread when too far from all", () => {
  const tpl = { rest: { w: 294, h: 97 }, small: { w: 294, h: 125 } };
  assert.equal(classifyMouth({ w: 296, h: 99 }, tpl, 14).mouth, "rest");
  assert.equal(classifyMouth({ w: 294, h: 139 }, tpl, 14).mouth, "small"); // 14 px away: still read
  assert.equal(classifyMouth({ w: 294, h: 140 }, tpl, 14).mouth, "unread");
  const rgb = new Uint8Array(4 * 3 * 3);
  rgb[(1 * 4 + 2) * 3 + 1] = 200;
  assert.deepEqual(brightFeatures(rgb, 4, 3, 128), { w: 1, h: 1, n: 1 });
});

test("onset and end offsets from the mouth's rest in each pause", () => {
  const fps = 10;
  // Sound 0.25..0.5 and 0.8..1.0; pauses 0..0.25, 0.5..0.8, 1.0..1.2.
  const ref = { segments: [{ start: 0.25, end: 0.5 }, { start: 0.8, end: 1.0 }], pauses: [{ start: 0, end: 0.25, before: 0, leading: true }, { start: 0.5, end: 0.8, before: 1 }, { start: 1.0, end: 1.2, before: null, trailing: true }] };
  const mouths = ["rest", "rest", "rest", "open", "open", "open", "rest", "rest", "small", "small", "small", "rest", "rest"];
  const frames = mouths.map((mouth, k) => ({ t: k / fps, mouth }));
  const words = [{ word: "Hello", start: 0.2, end: 0.55 }, { word: "there", start: 0.75, end: 1.05 }];
  assert.deepEqual(restInPause(frames, ref.pauses[1], fps), { first: 6, last: 7 });
  const r = offsets(ref, frames, words, fps);
  assert.deepEqual(r.onsets.map((o) => [o.word, o.frame, Math.round(o.ms)]), [["Hello", 3, 50], ["there", 8, 0]]);
  assert.deepEqual(r.ends.map((e) => [e.word, e.frame, Math.round(e.ms)]), [["Hello", 6, 100], ["there", 11, 100]]);
  // A word starting with m, b, p, f or v is not measured; a mouth open at frame 0 gives frame 0, flagged.
  const r2 = offsets(ref, frames.map((f, k) => (k === 0 ? { ...f, mouth: "small" } : f)), [{ word: "Many", start: 0.2, end: 0.55 }, words[1]], fps);
  assert.equal(r2.onsets[0].skipped, "starts with m, b, p, f or v");
  const r3 = offsets(ref, frames.map((f, k) => (k < 3 ? { ...f, mouth: "small" } : f)), words, fps);
  assert.deepEqual([r3.onsets[0].frame, Math.round(r3.onsets[0].ms), Boolean(r3.onsets[0].note)], [0, -250, true]);
  // No rest in the pause: not measured.
  const r4 = offsets(ref, frames.map((f, k) => (k === 6 || k === 7 ? { ...f, mouth: "small" } : f)), words, fps);
  assert.equal(r4.onsets[1].skipped, "the mouth does not rest in the pause");
  assert.equal(r4.ends[0].skipped, "the mouth does not rest in the pause");
});

test("closure score, changes table and the yardsticks", () => {
  const align = { characters: ["a", "m", "a"], character_start_times_seconds: [0, 0.1, 0.2], character_end_times_seconds: [0.1, 0.2, 0.3] };
  const frames = ["open", "rest", "open"].map((mouth, k) => ({ t: k / 10, mouth }));
  assert.deepEqual([closureScore(align, frames, 10).hits, closureScore(align, frames, 10).of], [1, 1]);
  assert.equal(changesTable(["rest", "open", "open", "rest"], 30).changes, 2);
  assert.deepEqual(summary([10, -40, 46, -126, 33.3, "x"]), { count: 5, median: 10, largestAbs: 126, withinOneFrame: 2, within45Late125Early: 3 });
});

const clipsThere = ["P1", "P2", "P3"].every((p) => ["v1", "v2"].every((v) => fs.existsSync(path.join(ROOT, "out", `lipsync-${v}`, `${p}.mp4`))));
test("P1-P3: the mouth read from the pixels agrees with the draw list on every frame", { skip: clipsThere ? false : "needs the P1-P3 clips (npm run lipsync:clips)", timeout: 300000 }, async () => {
  const { measureClip } = await import("../scripts/measure.mjs");
  for (const p of ["P1", "P2", "P3"]) for (const v of ["v1", "v2"]) {
    const r = measureClip(p, v, { checkDrawList: true });
    assert.equal(r.drawList.lengthMismatch, undefined, `${p} ${v}`);
    assert.deepEqual(r.drawList.disagree, [], `${p} ${v}`);
    assert.deepEqual(r.unread, [], `${p} ${v}`);
    assert.equal(r.videoStartS, 0);
    assert.equal(r.audioStartS, 0);
  }
});

// Lip sync v3 (author's prompt #18): v2's letter classes, then three rules of its own (rig/lipsync-v3.json):
//   1. a frame takes the character that covers most of its time (class priority only breaks exact ties), as v2 now;
//   2. every m, b, p, f, v that ends up with no frame takes the frame it overlaps most;
//   3. a run shorter than the minimum first grows by taking one frame from a neighbouring run that would still keep the
//      minimum (the longer neighbour; on a tie the later one); only if neither can give is it removed; a closure run
//      is never removed and may stay one frame long. Decided by Claude (rule 2 says a letter that "ends up" with no
//      frame): a closure frame that is the last closure frame of an m, b, p, f or v cannot be given.
// lib/lipsync-text.mjs (v2) is frozen and not changed; only its letter classes are used here. Pure: runs in a browser.
import { letterClasses } from "./lipsync-text.mjs";

const CLOSING = /^[mbpfv]$/i;

// Rule 1 with the winning character of every frame (-1 when the frame is mostly time no character covers).
export function frameWinners(alignment, fps, rules, frames) {
  const chars = alignment.characters, starts = alignment.character_start_times_seconds, ends = alignment.character_end_times_seconds;
  const letters = letterClasses(chars.join(""), rules);
  const rank = (c) => rules.priority.indexOf(c);
  const n = frames ?? Math.ceil(Math.max(0, ...ends) * fps);
  const classes = new Array(n).fill("gap"), winner = new Array(n).fill(-1);
  for (let f = 0; f < n; f++) {
    const a = f / fps, b = (f + 1) / fps;
    let best = -1, bestCover = 0, covered = 0;
    for (let k = 0; k < chars.length; k++) {
      const cover = Math.min(ends[k], b) - Math.max(starts[k], a);
      if (cover <= 0) continue;
      covered += cover;
      if (cover > bestCover || (cover === bestCover && rank(letters[k].cls) < rank(best < 0 ? "gap" : letters[best].cls))) { best = k; bestCover = cover; }
    }
    if (best >= 0 && !(b - a - covered > bestCover)) { classes[f] = letters[best].cls; winner[f] = best; }
  }
  return { classes, winner, letters };
}

// Rule 2. A closing letter whose class is closure and that won no frame takes the frame it overlaps most (on a tie the
// earlier one), unless that frame already shows a closure.
export function rescueClosures(alignment, fps, rules, classes, winner, letters) {
  const chars = alignment.characters, starts = alignment.character_start_times_seconds, ends = alignment.character_end_times_seconds;
  const out = [...classes], won = [...winner], rescued = [];
  for (let k = 0; k < chars.length; k++) {
    if (!CLOSING.test(chars[k]) || letters[k].cls !== rules.closureRescue.class || won.includes(k)) continue;
    let best = -1, bestCover = 0;
    for (let f = Math.max(0, Math.floor(starts[k] * fps)); f < out.length && f / fps < ends[k]; f++) {
      const cover = Math.min(ends[k], (f + 1) / fps) - Math.max(starts[k], f / fps);
      if (cover > bestCover) { best = f; bestCover = cover; }
    }
    if (best < 0) continue;
    if (out[best] === rules.closureRescue.class) { rescued.push({ letter: chars[k], index: k, frame: best, already: true }); continue; }
    rescued.push({ letter: chars[k], index: k, frame: best, was: out[best] });
    out[best] = rules.closureRescue.class;
    won[best] = k;
  }
  return { classes: out, winner: won, rescued };
}

const runsOf = (c) => {
  const r = [];
  for (let i = 0, s = 0; i <= c.length; i++) if (i === c.length || c[i] !== c[s]) { r.push({ start: s, len: i - s, cls: c[s] }); s = i; }
  return r;
};

// Rule 3. canGive(frame, classesNow) may forbid giving a frame (lipsyncV3: a closing letter's last closure frame).
export function growOrRemove(classes, rules, canGive = () => true) {
  const out = [...classes], min = rules.minFrames, keep = rules.closureRescue.class;
  const log = [];
  for (let guard = 0; guard < out.length * 8; guard++) {
    const r = runsOf(out);
    if (r.length < 2) break;
    let changed = false;
    for (let i = 0; i < r.length && !changed; i++) {
      const run = r[i];
      if (run.len >= min) continue;
      const prev = r[i - 1], next = r[i + 1];
      const edge = (g) => (g === prev ? prev.start + prev.len - 1 : next.start);
      const givers = [prev, next].filter((g) => g && g.len - 1 >= min && canGive(edge(g), out));
      if (givers.length) {
        // The longer neighbour; on a tie the later one (next).
        const g = givers.length === 2 ? (prev.len > next.len ? prev : next) : givers[0];
        const f = edge(g);
        log.push({ grew: run.cls, at: run.start, took: f, from: g.cls });
        out[f] = run.cls;
        changed = true;
      } else if (run.cls !== keep) {
        const into = prev ? prev.cls : next.cls;
        log.push({ removed: run.cls, at: run.start, len: run.len, into });
        for (let f = run.start; f < run.start + run.len; f++) out[f] = into;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { classes: out, log };
}

export function lipsyncV3(alignment, fps, rules, frames) {
  const w = frameWinners(alignment, fps, rules, frames);
  const r = rescueClosures(alignment, fps, rules, w.classes, w.winner, w.letters);
  // Spans of the closing letters whose class is closure: a closure frame is the last one of a letter when no other
  // closure frame overlaps that letter.
  const al = alignment, keep = rules.closureRescue.class;
  const spans = al.characters.map((c, k) => (CLOSING.test(c) && w.letters[k].cls === keep ? [al.character_start_times_seconds[k], al.character_end_times_seconds[k]] : null)).filter(Boolean);
  const over = (f, [a, b]) => a < (f + 1) / fps && b > f / fps;
  const canGive = (f, now) => now[f] !== keep || spans.every((sp) => !over(f, sp) || now.some((c, g) => g !== f && c === keep && over(g, sp)));
  const g = growOrRemove(r.classes, rules, canGive);
  return { mouths: g.classes.map((c) => rules.classes[c].mouth), classes: g.classes, rawClasses: w.classes, rescuedClasses: r.classes, letters: w.letters, rescued: r.rescued, runLog: g.log };
}

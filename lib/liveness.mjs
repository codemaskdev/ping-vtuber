// Liveness: a pure function of (config, seed, frame, fps) → partial pose. Blinks (sometimes double), breathing, a slow
// micro head drift and the terminal cursor's blink. Runs in Node and in the browser (imports only lib/rng.mjs).
//
// The answer for a frame never depends on which frames were asked before (HyperFrames seeks): each call builds the
// seed's schedules from time 0 up to the frame's time and looks the frame up. Nothing is cached.
// No trigonometry (CLAUDE.md rule 5): breathing and drift ease with polynomials.
import { mulberry32 } from "./rng.mjs";

// Independent streams per channel, so adding a blink never shifts the head drift.
const STREAM = { blink: 0x9e3779b9, micro: 0x85ebca6b };
const between = (rng, [lo, hi]) => lo + rng() * (hi - lo);
const smoothstep = (x) => x * x * (3 - 2 * x);
const smootherstep = (x) => x * x * x * (x * (x * 6 - 15) + 10);

// Blinks as [start, end) in seconds, every one starting after the previous one ended.
export function blinkSchedule(config, seed, untilS) {
  const B = config.blink, rng = mulberry32((seed ^ STREAM.blink) >>> 0);
  const out = [];
  let t = between(rng, B.intervalS);
  while (t <= untilS) {
    const end = t + between(rng, B.closedS);
    out.push({ start: t, end, double: false });
    let last = end;
    if (rng() < B.doubleChance) {
      const s2 = end + between(rng, B.doubleGapS);
      last = s2 + between(rng, B.closedS);
      out.push({ start: s2, end: last, double: true });
    }
    t = last + between(rng, B.intervalS);
  }
  return out;
}

// Micro drift targets: { at, tilt, x, y }; the first is the rest position at time 0.
export function microSchedule(config, seed, untilS) {
  const M = config.micro, rng = mulberry32((seed ^ STREAM.micro) >>> 0);
  const out = [{ at: 0, tilt: 0, x: 0, y: 0 }];
  while (out[out.length - 1].at <= untilS) {
    const at = out[out.length - 1].at + between(rng, M.segmentS);
    out.push({ at, tilt: between(rng, [-M.tiltDeg, M.tiltDeg]), x: between(rng, [-M.shiftPx, M.shiftPx]), y: between(rng, [-M.shiftPx, M.shiftPx]) });
  }
  return out;
}

// Breathing offset in px: a smoothstep up and down over one period, centred on 0 (from -depth/2 to +depth/2).
export function breathY(config, t) {
  const P = config.breathing.periodS, u = (t - Math.floor(t / P) * P) / P;
  const b = u < 0.5 ? smoothstep(u * 2) : smoothstep(2 - u * 2);
  return config.breathing.depthPx * (b - 0.5);
}

export function cursorOn(config, t) {
  const C = config.cursor, period = C.onS + C.offS;
  return t - Math.floor(t / period) * period < C.onS;
}

// Every channel at one frame, for charts and tests.
export function livenessParts(config, seed, frame, fps) {
  if (!Number.isInteger(frame) || frame < 0) throw new Error("frame must be a non-negative integer");
  const t = frame / fps;
  const blink = blinkSchedule(config, seed, t).find((b) => t >= b.start && t < b.end) || null;
  const m = microSchedule(config, seed, t);
  let i = 0;
  while (m[i + 1].at <= t) i++;
  const a = m[i], b = m[i + 1], k = smootherstep((t - a.at) / (b.at - a.at));
  return {
    t,
    blink,
    breathY: breathY(config, t),
    micro: { tilt: a.tilt + (b.tilt - a.tilt) * k, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k },
    cursor: cursorOn(config, t),
  };
}

// The partial pose: head offsets to add, eyes closed during a blink, the cursor's state.
export function livenessAt(config, seed, frame, fps) {
  const p = livenessParts(config, seed, frame, fps);
  return {
    head: { tilt: p.micro.tilt, x: p.micro.x, y: p.micro.y + p.breathY },
    eyes: p.blink ? "closed" : "open",
    cursor: p.cursor,
  };
}

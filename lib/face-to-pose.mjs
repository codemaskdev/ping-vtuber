// Webcam face → Ping pose (author's prompt #15). Plain JavaScript, no MediaPipe in it, no imports: it takes numbers
// (MediaPipe's blendshape scores and the 4×4 facial transformation matrix) and returns a pose. Runs in the browser.
//
//   faceToPose(rig, config, face, state) → { pose, state }
//   face  = { blendshapes: { eyeBlinkLeft: 0..1, jawOpen: 0..1, ... }, matrix: [16 numbers, column-major] } or null
//   state = what the previous call returned (null on the first frame)
// NOT VERIFIED WITH A REAL CAMERA.

// arcsine as a polynomial (CLAUDE.md rule 5: no trigonometry from Math). Error under 0.001 rad for |x| <= 0.7 (44 degrees).
export function asinPoly(x) {
  const x2 = x * x;
  return x * (1 + x2 * (1 / 6 + x2 * (3 / 40 + x2 * (5 / 112 + x2 * (35 / 1152)))));
}

const mean = (a, b) => ((a || 0) + (b || 0)) / 2;
const clampFlag = (v, [lo, hi], name, flags) => {
  if (v < lo) { flags.push(name); return lo; }
  if (v > hi) { flags.push(name); return hi; }
  return v;
};

// Head roll (degrees) and translation (cm) from the matrix: roll from the rotation's first column, no trigonometry.
export function headFromMatrix(m) {
  const r00 = m[0], r10 = m[1], len = Math.sqrt(r00 * r00 + r10 * r10) || 1;
  const s = Math.max(-0.7, Math.min(0.7, r10 / len));
  return { rollDeg: (asinPoly(s) * 180) / Math.PI, x: m[12], y: m[13], z: m[14], rollSaturated: Math.abs(r10 / len) > 0.7 };
}

export function faceToPose(rig, config, face, prev) {
  const L = rig.limits;
  const state = prev ? JSON.parse(JSON.stringify(prev)) : { origin: null, head: { tilt: 0, x: 0, y: 0 }, eyesClosed: false, browsShown: false, frames: 0 };
  state.frames++;
  state.saturated = [];
  if (face && face.matrix) {
    const h = headFromMatrix(face.matrix);
    if (!state.origin) state.origin = { x: h.x, y: h.y };
    const sign = config.mirror ? -1 : 1;
    const target = {
      tilt: sign * h.rollDeg * config.head.tiltGain,
      x: sign * (h.x - state.origin.x) * config.head.shiftPxPerCm,
      y: -(h.y - state.origin.y) * config.head.shiftPxPerCm,
    };
    const a = state.frames === 1 ? 1 : config.head.smoothing;
    for (const k of ["tilt", "x", "y"]) state.head[k] += (target[k] - state.head[k]) * a;
    if (h.rollSaturated) state.saturated.push("roll beyond the polynomial's range");
  }
  const b = (face && face.blendshapes) || {};
  // Blink with hysteresis.
  const blink = mean(b.eyeBlinkLeft, b.eyeBlinkRight);
  if (state.eyesClosed ? blink < config.blink.openBelow : blink > config.blink.closeAbove) state.eyesClosed = !state.eyesClosed;
  // Mouth.
  const M = config.mouth, jaw = b.jawOpen || 0, smile = mean(b.mouthSmileLeft, b.mouthSmileRight);
  let mouth = "rest";
  if (Math.max(b.mouthPucker || 0, b.mouthFunnel || 0) > M.roundAbove) mouth = "round";
  else if (jaw > M.openJawAbove) mouth = "open";
  else if (smile > M.wideSmileAbove && jaw < M.wideJawBelow) mouth = "wide";
  else if (jaw > M.smallJawAbove) mouth = "small";
  // Brows with hysteresis on their activity.
  const B = config.brows, up = Math.max(b.browInnerUp || 0, mean(b.browOuterUpLeft, b.browOuterUpRight)), down = mean(b.browDownLeft, b.browDownRight);
  const activity = Math.max(up, down);
  if (state.browsShown ? activity < B.hideBelow : activity > B.showAbove) state.browsShown = !state.browsShown;
  const rest = rig.browsRest.browsRestDy;
  const dy = up >= down ? rest + (L.browsDy[0] - rest) * Math.min(1, up / B.upFull) : rest + (L.browsDy[1] - rest) * Math.min(1, down / B.downFull);
  // Saturate at the rig's limits, and say so (never silently).
  const head = {
    tilt: clampFlag(state.head.tilt, L.headTiltDeg, "tilt", state.saturated),
    x: clampFlag(state.head.x, L.headShiftPx.x, "x", state.saturated),
    y: clampFlag(state.head.y, L.headShiftPx.y, "y", state.saturated),
  };
  const pose = { head, eyes: state.eyesClosed ? "closed" : "open", brows: state.browsShown ? { dy } : "hidden", mouth, cursor: true, glow: 1 };
  return { pose, state };
}

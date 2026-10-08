// Emotions: (rig, config, marks, frame) → partial pose, eased between states (author's prompt #15). Marks are
// [{ frame, state }], state "neutral" or a key of config.states. Pure, no imports: runs in a browser too.
// It plugs into combine() after liveness; lip sync goes after it, so during speech the speech mouth wins (see
// rig/emotions.json "speech" and speechPartial below).

const smootherstep = (x) => x * x * x * (x * (x * 6 - 15) + 10);
const NEUTRAL = { head: { tilt: 0, x: 0, y: 0 } };

function partialOf(config, state) {
  if (state === "neutral") return NEUTRAL;
  const s = config.states[state];
  if (!s) throw new Error(`unknown emotion ${state}`);
  return s.partial;
}

export function emotionAt(rig, config, marks, frame) {
  if (!marks.length) return {};
  const sorted = [...marks].sort((a, b) => a.frame - b.frame);
  let i = -1;
  for (let k = 0; k < sorted.length; k++) if (sorted[k].frame <= frame) i = k;
  if (i < 0) return {};
  const to = partialOf(config, sorted[i].state), from = i > 0 ? partialOf(config, sorted[i - 1].state) : NEUTRAL;
  const t = Math.min(1, (frame - sorted[i].frame) / config.transitionFrames), k = smootherstep(t);
  const lerp = (a, b) => a + (b - a) * k;
  const fh = from.head || NEUTRAL.head, th = to.head || NEUTRAL.head;
  const out = { head: { tilt: lerp(fh.tilt || 0, th.tilt || 0), x: lerp(fh.x || 0, th.x || 0), y: lerp(fh.y || 0, th.y || 0) } };
  const late = t >= 0.5, side = late ? to : from;
  const rest = rig.browsRest.browsRestDy, dyOf = (p) => (p.brows && p.brows !== "hidden" ? p.brows.dy : rest);
  if (side.brows && side.brows !== "hidden") out.brows = { dy: lerp(dyOf(from), dyOf(to)) };
  if (side.eyes === "closed") out.eyes = "closed";
  if (side.mouth) out.mouth = side.mouth;
  return out;
}

// Frames from the first to the last letter of an utterance, from its character alignment.
export function speechSpan(alignment, fps) {
  const ch = alignment.characters, s = alignment.character_start_times_seconds, e = alignment.character_end_times_seconds;
  let a = -1, b = -1;
  for (let k = 0; k < ch.length; k++) if (/[a-z]/i.test(ch[k])) { if (a < 0) a = k; b = k; }
  return a < 0 ? null : { first: Math.floor(s[a] * fps), last: Math.ceil(e[b] * fps) - 1 };
}

// The lip sync partial for a frame: the speech mouth inside the span, nothing outside it (the emotion's mouth shows).
export function speechPartial(mouths, span, frame) {
  return span && frame >= span.first && frame <= span.last && frame < mouths.length ? { mouth: mouths[frame] } : {};
}

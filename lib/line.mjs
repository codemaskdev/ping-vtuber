// One frame of a spoken line (author's prompt #22): liveness, the emotion from the line's tag and lip sync combined.
// Pure; runs in Node and in the browser (relative imports only).
//
// Who owns what (combine() in lib/pose.mjs, partials in this order: liveness, emotion, speech):
//   mouth:  speech, on every frame from the first to the last letter of the line (lib/emotions.mjs speechSpan),
//           whatever the emotion's mouth is; outside that span the emotion's mouth if it has one, else rest.
//           Liveness never sets the mouth.
//   eyes:   "closed" wins: closed if the emotion closes them (sleepy) or liveness is in a blink; open only when
//           neither does. Speech never touches the eyes.
//   brows:  the emotion's (it is the only one that sets them); hidden when the emotion has none (neutral, sleepy).
//   head:   tilt, x and y add up: liveness (breathing, micro drift) plus the emotion's tilt and shift. Speech adds
//           nothing. If the sum left rig.json limits the pose would be rejected, never clamped; a test checks every
//           frame of every state with liveness.
//   cursor: liveness (it blinks; off wins). glow: nobody sets it, so the neutral 1.
// When they disagree: the mouth goes to speech inside the span, the eyes to whichever closes them, the brows to the
// emotion, and the head is the sum.
import { combine } from "./pose.mjs";
import { emotionAt, speechPartial } from "./emotions.mjs";
import { livenessAt } from "./liveness.mjs";
import { neutralPose } from "./rig.mjs";

// line = { seed, marks: [{ frame, state }], mouths: [one per frame of the audio], span: { first, last } | null }
export function linePose(rig, livenessConfig, emotionsConfig, line, frame, fps) {
  return combine(rig, neutralPose(rig), livenessAt(livenessConfig, line.seed, frame, fps), emotionAt(rig, emotionsConfig, line.marks, frame), speechPartial(line.mouths, line.span, frame));
}

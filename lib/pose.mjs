// combine(rig, base pose, ...partial poses) → pose. Lip sync and emotions plug in here later.
//   head: tilt, x and y add up across all poses;
//   eyes: "closed" wins over "open";
//   cursor: off wins over on;
//   brows, mouth, glow: the last partial that sets one wins.
// The result is checked against rig.json limits and rejected (never clamped) if outside. Runs in the browser too.
import { validatePose } from "./rig.mjs";

export function combine(rig, base, ...partials) {
  const out = JSON.parse(JSON.stringify(base));
  for (const p of partials) {
    if (!p) continue;
    for (const k of Object.keys(p)) if (!["head", "eyes", "cursor", "brows", "mouth", "glow"].includes(k)) throw new Error(`pose rejected: unknown field ${k}`);
    if (p.head) for (const k of ["tilt", "x", "y"]) if (p.head[k] !== undefined) out.head[k] += p.head[k];
    if (p.eyes === "closed") out.eyes = "closed";
    if (p.cursor === false) out.cursor = false;
    for (const k of ["brows", "mouth", "glow"]) if (p[k] !== undefined) out[k] = p[k];
  }
  return validatePose(rig, out);
}

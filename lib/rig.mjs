// Ping's rig: pose → draw list. Pure, no imports, so the same file runs in Node and in the browser.
// No trigonometry here (CLAUDE.md rule 5): the renderer turns the rotation into pixels.
//
// pose = {
//   head:   { tilt: degrees around the head pivot, x: px, y: px },
//   eyes:   "open" | "closed",
//   brows:  { dy: px, negative is up, as an offset of the brows layer as drawn } | "hidden",
//   mouth:  "rest" | "small" | "open" | "round" | "wide",
//   cursor: true | false,
//   glow:   opacity 0..1,
// }
// Every field is required; anything outside rig.limits is rejected, never clamped.
//
// Draw list: one item per drawn layer, in z order (equal z keeps rig.json order):
//   { id, file, z, opacity, offset: [dx, dy], rotate: { deg, centre: [x, y] }, translate: [x, y] }
// A layer pixel p lands at  translate + rotate(p + offset, deg, around centre).  offset is the layer's own move
// (a mouth's anchorDy, the brows' dy); rotate and translate come from the head and apply to it and every child.

const EYES = ["open", "closed"];
const MOUTHS = ["rest", "small", "open", "round", "wide"];
const KEYS = ["head", "eyes", "brows", "mouth", "cursor", "glow"];

function fail(msg) {
  throw new Error(`pose rejected: ${msg}`);
}

function inRange(name, v, [lo, hi]) {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`${name} must be a finite number`);
  if (v < lo || v > hi) fail(`${name} ${v} is outside ${lo}..${hi}`);
}

export function validatePose(rig, pose) {
  if (!pose || typeof pose !== "object") fail("not an object");
  for (const k of Object.keys(pose)) if (!KEYS.includes(k)) fail(`unknown field ${k}`);
  for (const k of KEYS) if (!(k in pose)) fail(`missing field ${k}`);
  const L = rig.limits, h = pose.head;
  if (!h || typeof h !== "object") fail("head must be an object");
  for (const k of Object.keys(h)) if (!["tilt", "x", "y"].includes(k)) fail(`unknown field head.${k}`);
  inRange("head.tilt", h.tilt, L.headTiltDeg);
  inRange("head.x", h.x, L.headShiftPx.x);
  inRange("head.y", h.y, L.headShiftPx.y);
  if (!EYES.includes(pose.eyes)) fail(`eyes must be one of ${EYES.join(", ")}`);
  if (pose.brows !== "hidden") {
    if (!pose.brows || typeof pose.brows !== "object") fail('brows must be { dy } or "hidden"');
    for (const k of Object.keys(pose.brows)) if (k !== "dy") fail(`unknown field brows.${k}`);
    inRange("brows.dy", pose.brows.dy, L.browsDy);
  }
  if (!MOUTHS.includes(pose.mouth)) fail(`mouth must be one of ${MOUTHS.join(", ")}`);
  if (typeof pose.cursor !== "boolean") fail("cursor must be true or false");
  inRange("glow", pose.glow, L.glowOpacity);
  return pose;
}

function shown(layer, pose) {
  switch (layer.kind) {
    case "eyes": return layer.value === pose.eyes;
    case "mouth": return layer.value === pose.mouth;
    case "brows": return pose.brows !== "hidden";
    case "cursor": return pose.cursor;
    default: return true;
  }
}

function ownOffset(layer, pose) {
  if (layer.kind === "mouth") return [0, layer.anchorDy];
  if (layer.kind === "brows") return [0, pose.brows.dy];
  return [0, 0];
}

export function drawList(rig, pose) {
  validatePose(rig, pose);
  const byId = new Map(rig.layers.map((l) => [l.id, l]));
  const out = [];
  for (const l of rig.layers) {
    if (!shown(l, pose)) continue;
    // Children move with the head: every layer here is the head or hangs from it, so the head's turn and shift apply.
    let root = l;
    while (root.parent !== null) root = byId.get(root.parent);
    if (root.kind !== "head") throw new Error(`layer ${l.id} does not hang from the head`);
    out.push({
      id: l.id,
      file: l.file,
      z: l.z,
      opacity: l.kind === "glow" ? pose.glow : 1,
      offset: ownOffset(l, pose),
      rotate: { deg: pose.head.tilt, centre: [rig.headPivot[0], rig.headPivot[1]] },
      translate: [pose.head.x, pose.head.y],
    });
  }
  return out;
}

// Debug skeleton for the same pose: pivots, region boxes, parent links and the smile's top edge, in head space,
// to be drawn under the same rotate and translate as the layers. Never part of a final render.
export function skeleton(rig, pose) {
  validatePose(rig, pose);
  const byId = new Map(rig.layers.map((l) => [l.id, l]));
  const items = [];
  for (const l of rig.layers) {
    items.push({ type: "rect", box: l.region, label: l.id });
    items.push({ type: "cross", at: l.pivot, label: l.id });
    if (l.parent !== null) items.push({ type: "line", from: l.pivot, to: byId.get(l.parent).pivot, label: `${l.id} → ${l.parent}` });
  }
  items.push({ type: "line", from: [0, rig.smileTop], to: [rig.canvas.width - 1, rig.smileTop], label: "smile top" });
  return { rotate: { deg: pose.head.tilt, centre: [rig.headPivot[0], rig.headPivot[1]] }, translate: [pose.head.x, pose.head.y], items };
}

export function neutralPose(rig) {
  return JSON.parse(JSON.stringify(rig.neutralPose));
}

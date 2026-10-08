// rig/rig.json: everything lib/rig.mjs needs, written by this script, never by hand.
//   layers, parents, z order  from art/layers.json
//   pivots and regions        from art/regions.json (frozen)
//   each mouth's anchorDy     from art/process-log.json (mouthAnchors)
//   canvas size               from art/regions.json
//   browsRestDy               measured on art/layers/ (rule below)
//   pose limits               chosen values, labelled so, with the check that they keep every layer on the canvas
//
//   npm run rig
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPng } from "../lib/png.mjs";
import { ROOT, loadSpec } from "../lib/spec.mjs";

export function buildRig() {
  const spec = loadSpec();
  const regions = JSON.parse(fs.readFileSync(path.join(ROOT, "art", "regions.json"), "utf8"));
  const log = JSON.parse(fs.readFileSync(path.join(ROOT, "art", "process-log.json"), "utf8"));
  if (!regions.frozen) throw new Error("art/regions.json is not frozen");
  const layerImg = (id) => readPng(path.join(ROOT, "art", "layers", spec.layers.find((l) => l.id === id).file)).img;

  // Rows and runs of a layer, alpha >= 128 counted as drawn (same rule as the mouth anchors' top edge).
  const rows = (img) => {
    let top = null, bottom = null;
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] < 128) continue;
      if (top === null) top = y;
      bottom = y;
    }
    return { top, bottom };
  };
  const alphaBox = (img) => {
    let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      if (!img.data[(y * img.width + x) * 4 + 3]) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
  };

  // Brows at rest. Chosen rule (author's prompt #12): the dark gap between the brows' bottom edge and the eyes' top edge
  // equals one pixel block of the smile. The block is the width of the smile's first raised end block, measured on the
  // row below the mouth_rest layer's top edge.
  const brows = rows(layerImg("brows")), eyes = rows(layerImg("eyes_open"));
  const smile = layerImg("mouth_rest"), smileRows = rows(smile);
  let blockStart = null, blockPx = 0;
  for (let x = 0; x < smile.width; x++) {
    const on = smile.data[((smileRows.top + 1) * smile.width + x) * 4 + 3] >= 128;
    if (on && blockStart === null) blockStart = x;
    if (!on && blockStart !== null) { blockPx = x - blockStart; break; }
  }
  const gapPx = eyes.top - brows.bottom - 1; // empty rows between them
  const browsRestDy = gapPx - blockPx; // negative moves the brows up

  // Pose limits: chosen values (author's prompt #12 asks for them). Brows stay inside their frozen region; head tilt
  // and shift are chosen so that no layer's alpha box can leave the canvas. The check uses a bound that needs no sine:
  // a point at distance r from the pivot moves at most r * theta (the arc) when turned by theta radians, plus the shift.
  const W = regions.canvas.width, H = regions.canvas.height;
  const headPivot = regions.layers.head.pivot;
  const browsBox = alphaBox(layerImg("brows")), browsRegion = regions.layers.brows.region;
  const limits = {
    $comment: "Chosen values, not measurements (author's prompt #12). A pose outside them is rejected, never clamped. headTiltDeg and headShiftPx were chosen so that every layer stays on the canvas (fitCheck); browsDy so that the brows stay inside their frozen region.",
    headTiltDeg: [-4, 4],
    headShiftPx: { x: [-30, 30], y: [-30, 30] },
    browsDy: [browsRegion[1] - browsBox[1], browsRegion[1] + browsRegion[3] - 1 - (browsBox[1] + browsBox[3] - 1)],
    glowOpacity: [0, 1],
  };
  const theta = (Math.max(...limits.headTiltDeg.map(Math.abs)) * Math.PI) / 180;
  const shift = Math.sqrt(limits.headShiftPx.x[1] * limits.headShiftPx.x[1] + limits.headShiftPx.y[1] * limits.headShiftPx.y[1]);
  const fit = [];
  for (const l of spec.layers) {
    const [x, y, w, h] = alphaBox(layerImg(l.id));
    let worst = Infinity;
    for (const [cx, cy] of [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]]) {
      const r = Math.sqrt((cx - headPivot[0]) * (cx - headPivot[0]) + (cy - headPivot[1]) * (cy - headPivot[1]));
      const move = r * theta + shift;
      worst = Math.min(worst, cx - move, cy - move, W - 1 - cx - move, H - 1 - cy - move);
    }
    fit.push({ id: l.id, alphaBox: [x, y, w, h], smallestRoomPx: worst });
  }
  const fitOk = fit.every((f) => f.smallestRoomPx >= 0);
  if (!fitOk) throw new Error(`pose limits let a layer leave the canvas: ${JSON.stringify(fit.filter((f) => f.smallestRoomPx < 0))}`);
  if (browsRestDy < limits.browsDy[0] || browsRestDy > limits.browsDy[1]) throw new Error(`browsRestDy ${browsRestDy} is outside the brows limits`);

  const role = (id) => (id.startsWith("mouth_") ? { kind: "mouth", value: id.slice(6) } : id.startsWith("eyes_") ? { kind: "eyes", value: id.slice(5) } : { kind: id });
  const rig = {
    $comment: "Written by scripts/build-rig.mjs from art/layers.json, art/regions.json, art/process-log.json and art/layers/. Do not edit by hand. Coordinates are canvas pixels.",
    canvas: regions.canvas,
    headPivot,
    smileTop: log.mouthAnchors.smileTop,
    layers: [...spec.layers].sort((a, b) => a.z - b.z).map((l) => ({
      id: l.id, file: `art/layers/${l.file}`, z: l.z, parent: l.parent, ...role(l.id),
      pivot: regions.layers[l.id].pivot, region: regions.layers[l.id].region,
      ...(l.group === "mouth" ? { anchorDy: log.mouthAnchors.mouths[l.id].anchorDy } : {}),
    })),
    browsRest: {
      rule: "Chosen (author's prompt #12): the dark gap between the brows' bottom edge and the eyes' top edge equals one smile block. Edges are the last and first rows with alpha >= 128; the block is the width of the smile's first raised end block.",
      browsBottomRow: brows.bottom, eyesTopRow: eyes.top, gapPx, blockPx, browsRestDy,
    },
    limits,
    fitCheck: { rule: "room = distance from each layer's alpha box corner to the canvas edge minus (r * theta + shift); must be >= 0", thetaRad: theta, shiftPx: shift, layers: fit },
    neutralPose: { head: { tilt: 0, x: 0, y: 0 }, eyes: "open", brows: { dy: browsRestDy }, mouth: "rest", cursor: true, glow: 1 },
  };
  return { rig, brows, eyes, gapPx, blockPx, browsRestDy, limits, fit, W, H, headPivot };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { rig, brows, eyes, gapPx, blockPx, browsRestDy, limits, fit, W, H, headPivot } = buildRig();
  fs.mkdirSync(path.join(ROOT, "rig"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "rig", "rig.json"), JSON.stringify(rig, null, 2) + "\n");
  console.log(`rig/rig.json: canvas ${W}x${H}, head pivot ${headPivot.join(",")}, smile top ${rig.smileTop}`);
  console.log(`brows: bottom row ${brows.bottom}, eyes top row ${eyes.top}, gap ${gapPx} px, block ${blockPx} px → browsRestDy ${browsRestDy}`);
  console.log(`limits: tilt ${limits.headTiltDeg.join("..")} deg, shift x ${limits.headShiftPx.x.join("..")} y ${limits.headShiftPx.y.join("..")} px, browsDy ${limits.browsDy.join("..")}, glow ${limits.glowOpacity.join("..")}`);
  console.log(`fit: smallest room ${Math.min(...fit.map((f) => f.smallestRoomPx))} px (${fit.reduce((a, b) => (a.smallestRoomPx < b.smallestRoomPx ? a : b)).id})`);
}

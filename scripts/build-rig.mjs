// rig/rig.json: everything lib/rig.mjs needs, written by this script, never by hand.
//   layers, parents, z order  from art/layers.json
//   pivots and regions        from art/regions.json (frozen)
//   each mouth's anchorDy     from art/process-log.json (mouthAnchors)
//   canvas size               from art/regions.json (the art's own size)
//   stage                     chosen by the author (prompt #16): 1600 x 1600 with the art centred
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

  // The stage every render and the web page draw on (author's prompt #16): 1600 x 1600, the art centred on it.
  const W = regions.canvas.width, H = regions.canvas.height, SW = 1600, SH = 1600;
  if ((SW - W) % 2 || (SH - H) % 2) throw new Error(`the art ${W}x${H} cannot be centred on ${SW}x${SH} at whole pixels`);
  const stage = {
    $comment: "Chosen by the author (prompt #16): one stage for every render and for the web page, the art centred. artOffset is where the art's top-left pixel lands on the stage.",
    width: SW, height: SH, artOffset: [(SW - W) / 2, (SH - H) / 2],
  };

  // Pose limits: chosen values (author's prompts #12 and #16). Brows stay inside their frozen region; head tilt and
  // shift must keep every layer on the stage. The check uses a bound that needs no sine: a point at distance r from the
  // pivot moves at most r * theta (the arc) when turned by theta radians, plus the shift.
  const headPivot = regions.layers.head.pivot;
  const browsBox = alphaBox(layerImg("brows")), browsRegion = regions.layers.brows.region;
  const limits = {
    $comment: "Chosen values, not measurements (author's prompts #12 and #16). A pose outside them is rejected, never clamped. headTiltDeg (12 degrees, prompt #16; was 4 on the 1254 px canvas) and headShiftPx must keep every layer on the stage (fitCheck); browsDy keeps the brows inside their frozen region.",
    headTiltDeg: [-12, 12],
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
      const move = r * theta + shift, sx = cx + stage.artOffset[0], sy = cy + stage.artOffset[1];
      worst = Math.min(worst, sx - move, sy - move, SW - 1 - sx - move, SH - 1 - sy - move);
    }
    fit.push({ id: l.id, alphaBox: [x, y, w, h], smallestRoomPx: worst });
  }
  const fitOk = fit.every((f) => f.smallestRoomPx >= 0);
  if (!fitOk) throw new Error(`pose limits let a layer leave the stage: ${JSON.stringify(fit.filter((f) => f.smallestRoomPx < 0))}`);
  if (browsRestDy < limits.browsDy[0] || browsRestDy > limits.browsDy[1]) throw new Error(`browsRestDy ${browsRestDy} is outside the brows limits`);

  const role = (id) => (id.startsWith("mouth_") ? { kind: "mouth", value: id.slice(6) } : id.startsWith("eyes_") ? { kind: "eyes", value: id.slice(5) } : { kind: id });
  const rig = {
    $comment: "Written by scripts/build-rig.mjs from art/layers.json, art/regions.json, art/process-log.json and art/layers/. Do not edit by hand. Coordinates are art pixels (the layers' own canvas); the draw list moves them onto the stage by stage.artOffset.",
    canvas: regions.canvas,
    stage,
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
    fitCheck: { rule: "room = distance from each layer's alpha box corner, placed on the stage, to the stage edge minus (r * theta + shift); must be >= 0", stage: [SW, SH], thetaRad: theta, shiftPx: shift, layers: fit },
    neutralPose: { head: { tilt: 0, x: 0, y: 0 }, eyes: "open", brows: "hidden", mouth: "rest", cursor: true, glow: 1 },
    neutralPoseNote: "Brows hidden, like the logo and the master (author's prompt #13); they appear only in emotions, at browsRest.browsRestDy when shown.",
  };
  return { rig, brows, eyes, gapPx, blockPx, browsRestDy, limits, fit, W, H, stage, headPivot };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { rig, brows, eyes, gapPx, blockPx, browsRestDy, limits, fit, W, H, stage, headPivot } = buildRig();
  fs.mkdirSync(path.join(ROOT, "rig"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "rig", "rig.json"), JSON.stringify(rig, null, 2) + "\n");
  console.log(`rig/rig.json: art ${W}x${H} on a ${stage.width}x${stage.height} stage at ${stage.artOffset.join(",")}, head pivot ${headPivot.join(",")}, smile top ${rig.smileTop}`);
  console.log(`brows: bottom row ${brows.bottom}, eyes top row ${eyes.top}, gap ${gapPx} px, block ${blockPx} px → browsRestDy ${browsRestDy}`);
  console.log(`limits: tilt ${limits.headTiltDeg.join("..")} deg, shift x ${limits.headShiftPx.x.join("..")} y ${limits.headShiftPx.y.join("..")} px, browsDy ${limits.browsDy.join("..")}, glow ${limits.glowOpacity.join("..")}`);
  console.log(`fit: smallest room ${Math.min(...fit.map((f) => f.smallestRoomPx))} px (${fit.reduce((a, b) => (a.smallestRoomPx < b.smallestRoomPx ? a : b)).id})`);
}

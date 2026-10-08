// Reconstruction: the HyperFrames render of the neutral pose with brows hidden, over opaque black
// (out/render/reconstruction/frame_000001.png), against the master. Mean and largest channel difference (RGB, 0..255)
// in three areas taken from the master: outside the outline (not in the head silhouette, threshold 48), on the outline
// (silhouette minus the inside of the screen), and inside the screen.
//
//   node scripts/build-preview.mjs reconstruction
//   (cd rig/preview && npx --yes hyperframes@0.8.134 render --format png-sequence -o ../../out/render/reconstruction)
//   node scripts/reconstruction.mjs
import path from "node:path";
import { silhouette } from "../lib/extract.mjs";
import { flattenOnBlack } from "../lib/image.mjs";
import { readPng } from "../lib/png.mjs";
import { screenInterior } from "../lib/regions.mjs";
import { ROOT, loadSpec } from "../lib/spec.mjs";

const P = loadSpec().processing;
const master = flattenOnBlack(readPng(path.join(ROOT, "art", "raw", P.master)).img).img;
const render = readPng(path.join(ROOT, "out", "render", "reconstruction", "frame_000001.png")).img;
if (render.width !== master.width || render.height !== master.height) throw new Error("size mismatch");
const n = master.width * master.height;
const sil = silhouette(master, P.silhouetteThreshold).mask;
const inside = screenInterior(master, sil, P.silhouetteThreshold, 0);
const areas = { "outside the outline": (p) => !sil[p], "on the outline": (p) => sil[p] && !inside[p], "inside the screen": (p) => inside[p] };
let alphaMin = 255;
for (let p = 0; p < n; p++) if (render.data[p * 4 + 3] < alphaMin) alphaMin = render.data[p * 4 + 3];
console.log(`render ${render.width}x${render.height}, smallest alpha ${alphaMin} (255 = opaque)`);
for (const [name, inArea] of Object.entries(areas)) {
  let sum = 0, samples = 0, max = 0, pixels = 0, over16 = 0;
  for (let p = 0; p < n; p++) {
    if (!inArea(p)) continue;
    pixels++;
    let pm = 0;
    for (let c = 0; c < 3; c++) { const d = Math.abs(master.data[p * 4 + c] - render.data[p * 4 + c]); sum += d; samples++; if (d > pm) pm = d; }
    if (pm > max) max = pm;
    if (pm > 16) over16++;
  }
  console.log(`${name}: ${pixels} px; mean ${sum / samples} (${sum}/${samples}); max ${max}; ${over16} px with a channel off by more than 16`);
}

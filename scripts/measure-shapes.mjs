// Measures the shape an attempt draws, uncut by any region: its box, its top edge, and its stroke widths.
// "Lit" = largest channel >= processing.silhouetteThreshold. Search areas come from the frozen art/regions.json:
//   mouths (G5-G8, and the master's smile): x within the mouth region, y from the bottom of the eyes region (so a
//     redrawn eye edge does not count) down to the screen's inside bottom;
//   brows (G3): x within the brows region, y from the cursor's measured bottom to the eyes' measured top, lit in the
//     attempt and not lit in the master (so the chevron and the eyes' corners do not count);
//   closed eyes (G4): within the eyes' measured box.
// Strokes: lit runs along the shape's centre column (top and bottom strokes) and centre row (left and right).
//
//   npm run measure:shapes -- master G3-02 G4-01 G5-01 G6-01 G6-02 G7-02 G8-01
import fs from "node:fs";
import path from "node:path";
import { flattenOnBlack } from "../lib/image.mjs";
import { readPng } from "../lib/png.mjs";
import { ROOT, loadSpec } from "../lib/spec.mjs";

const spec = loadSpec(), T = spec.processing.silhouetteThreshold;
const R = JSON.parse(fs.readFileSync(path.join(ROOT, "art", "regions.json"), "utf8"));
const load = (id) => flattenOnBlack(readPng(id === "master" ? path.join(ROOT, "art", "raw", spec.processing.master) : path.join(ROOT, "art", "raw", "attempts", `${id}.png`)).img).img;
const master = load("master"), W = master.width;
const litIn = (img) => (x, y) => { const i = (y * W + x) * 4; return Math.max(img.data[i], img.data[i + 1], img.data[i + 2]) >= T; };
const mLit = litIn(master);

function box(test, x0, y0, x1, y1) {
  let a = x1, b = y1, c = -1, d = -1, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (test(x, y)) { n++; if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }
  return c < 0 ? null : { box: [a, b, c - a + 1, d - b + 1], pixels: n };
}
const runs = (test, fixed, from, to, vertical) => {
  const out = []; let start = -1;
  for (let t = from; t <= to; t++) {
    const on = t < to && (vertical ? test(fixed, t) : test(t, fixed));
    if (on && start < 0) start = t;
    if (!on && start >= 0) { out.push([start, t - start]); start = -1; }
  }
  return out;
};
const strokes = (test, b) => {
  const [x, y, w, h] = b, cx = x + (w >> 1), cy = y + (h >> 1);
  return { column: { x: cx, runs: runs(test, cx, y, y + h, true) }, row: { y: cy, runs: runs(test, cy, x, x + w, false) } };
};

const interior = R.measured.interior, eyes = R.measured.eyes, cur = R.measured.cursor;
const mouthR = R.layers.mouth_rest.region, browsR = R.layers.brows.region;
for (const id of process.argv.slice(2)) {
  const img = load(id), lit = litIn(img);
  const prompt = id === "master" ? "G1" : id.split("-")[0];
  if (prompt === "G3") {
    const t = (x, y) => lit(x, y) && !mLit(x, y);
    const b = box(t, browsR[0], cur[1] + cur[3], browsR[0] + browsR[2], eyes[1]);
    const left = box(t, browsR[0], cur[1] + cur[3], 627, eyes[1]), right = box(t, 627, cur[1] + cur[3], browsR[0] + browsR[2], eyes[1]);
    console.log(`${id} brows: box ${b ? b.box.join(",") : "none"} (bottom y ${b ? b.box[1] + b.box[3] - 1 : "-"}); brows region ${browsR.join(",")} (bottom y ${browsR[1] + browsR[3] - 1}); left ${left ? left.box.join(",") : "-"}, right ${right ? right.box.join(",") : "-"}; eyes top y ${eyes[1]}, cursor bottom y ${cur[1] + cur[3] - 1}`);
    if (b) for (const [name, s] of [["left", left], ["right", right]]) if (s) console.log(`  ${name} brow strokes: ${JSON.stringify(strokes(t, s.box))}`);
  } else if (prompt === "G4") {
    const t = (x, y) => lit(x, y);
    for (const [name, x0, x1] of [["left", eyes[0], 627], ["right", 627, eyes[0] + eyes[2]]]) {
      const b = box(t, x0, eyes[1], x1, eyes[1] + eyes[3] + 10);
      console.log(`${id} ${name} closed eye: box ${b ? b.box.join(",") : "none"}; strokes ${b ? JSON.stringify(strokes(t, b.box)) : "-"}`);
    }
  } else {
    const t = (x, y) => lit(x, y);
    const eyesR = R.layers.eyes_open.region;
    const b = box(t, mouthR[0], eyesR[1] + eyesR[3], mouthR[0] + mouthR[2], interior[1] + interior[3]);
    console.log(`${id} mouth: box ${b ? b.box.join(",") : "none"}; top edge y ${b ? b.box[1] : "-"} (smile top 788, difference ${b ? b.box[1] - 788 : "-"}); bottom y ${b ? b.box[1] + b.box[3] - 1 : "-"}; mouth region ${mouthR.join(",")}`);
    if (b) console.log(`  strokes ${JSON.stringify(strokes(t, b.box))}`);
  }
}

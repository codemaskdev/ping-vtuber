// Measures the master's mouth geometry: the pixel block size, the smile's top edge and the inner bottom edge of the
// screen outline, so mouth sizes in the prompts can be checked against the room under the smile.
//
//   npm run measure:master            art/raw/01-master.png
//   npm run measure:master -- <file>
import path from "node:path";
import { silhouette } from "../lib/extract.mjs";
import { flattenOnBlack } from "../lib/image.mjs";
import { readPng } from "../lib/png.mjs";
import { ROOT, loadSpec, rel } from "../lib/spec.mjs";

const spec = loadSpec();
const file = path.resolve(process.argv[2] || path.join(ROOT, "art", "raw", spec.processing.master));
const img = flattenOnBlack(readPng(file).img).img;
const { width: W, height: H, data: d } = img;
const T = spec.processing.silhouetteThreshold;
const lit = (x, y) => { const i = (y * W + x) * 4; return Math.max(d[i], d[i + 1], d[i + 2]) >= T; };
const sil = silhouette(img, T).mask;

// Lit 8-connected components fully inside the silhouette but not touching its outline: walk from each lit pixel.
const seen = new Uint8Array(W * H), comps = [];
const outlineTouch = (x, y) => !sil[y * W + x];
for (let s = 0; s < W * H; s++) {
  const sx = s % W, sy = (s - sx) / W;
  if (seen[s] || !sil[s] || !lit(sx, sy)) continue;
  const stack = [s]; seen[s] = 1;
  let n = 0, x0 = W, y0 = H, x1 = -1, y1 = -1, touches = false;
  while (stack.length) {
    const p = stack.pop(), x = p % W, y = (p - x) / W;
    n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const q = ny * W + nx;
      if (outlineTouch(nx, ny)) touches = true;
      if (!seen[q] && sil[q] && lit(nx, ny)) { seen[q] = 1; stack.push(q); }
    }
  }
  comps.push({ box: [x0, y0, x1 - x0 + 1, y1 - y0 + 1], pixels: n, touchesOutside: touches });
}
const inner = comps.filter((c) => !c.touchesOutside && c.pixels > 100);
const smile = [...inner].sort((a, b) => (2 * b.box[1] + b.box[3]) - (2 * a.box[1] + a.box[3]))[0];
const [mx, my, mw, mh] = smile.box;
const runs = (y) => {
  const out = []; let start = -1;
  for (let x = mx; x <= mx + mw; x++) {
    const on = x < mx + mw && lit(x, y);
    if (on && start < 0) start = x;
    if (!on && start >= 0) { out.push([start, x - start]); start = -1; }
  }
  return out;
};
const colRun = (x) => { let y = my; while (y < my + mh && !lit(x, y)) y++; const top = y; while (y < my + mh && lit(x, y)) y++; return [top, y - top]; };
const topRuns = runs(my + 1), bottomRuns = runs(my + mh - 2);
const endBlock = topRuns[0], endCol = colRun(endBlock[0] + (endBlock[1] >> 1));
const barCol = colRun(mx + (mw >> 1));
// Inner bottom edge of the outline below the smile's centre: the first lit pixel going down from the smile.
const cx = mx + (mw >> 1);
let y = my + mh;
while (y < H && !lit(cx, y)) y++;
const innerBottom = y;

console.log(`${rel(file)}  ${W}x${H}, silhouette threshold ${T}`);
console.log(`smile box x,y,w,h: ${smile.box.join(",")}  (${smile.pixels} lit px)`);
console.log(`smile top edge y: ${my}`);
console.log(`top row y=${my + 1} lit runs [x, length]: ${JSON.stringify(topRuns)}  (the two raised end blocks)`);
console.log(`row y=${my + mh - 2} lit runs [x, length]: ${JSON.stringify(bottomRuns)}  (the bar)`);
console.log(`end block column x=${endBlock[0] + (endBlock[1] >> 1)}: lit from y=${endCol[0]}, ${endCol[1]} px tall`);
console.log(`bar column x=${mx + (mw >> 1)}: lit from y=${barCol[0]}, ${barCol[1]} px tall`);
console.log(`block size: end block ${endBlock[1]} px wide, ${endCol[1]} px tall; smile width / 6 = ${mw / 6}, smile height / 2 = ${mh / 2}`);
console.log(`inner bottom edge of the outline below the smile (column x=${cx}): y=${innerBottom}`);
console.log(`room from the smile's top edge to the outline: ${innerBottom - my} px = ${(innerBottom - my) / endBlock[1]} blocks of ${endBlock[1]} px`);

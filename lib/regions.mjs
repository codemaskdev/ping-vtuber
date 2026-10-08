// Measures regions and pivots on the master, following art/layers.json regionRule and pivotRule.
// Boxes are [x, y, w, h] in canvas pixels. Integer arithmetic throughout.
import fs from "node:fs";
import { findOffset, silhouette } from "./extract.mjs";
import { translate } from "./image.mjs";
import { rel } from "./spec.mjs";

const ceilDiv = (a, b) => Math.ceil(a / b);
const grow = (b, m) => [b[0] - m, b[1] - m, b[2] + 2 * m, b[3] + 2 * m];
const bottom = (b) => b[1] + b[3];
const right = (b) => b[0] + b[2];
const centre = (b) => [b[0] + Math.floor(b[2] / 2), b[1] + Math.floor(b[3] / 2)];
const overlap = (a, b) => a[0] < right(b) && b[0] < right(a) && a[1] < bottom(b) && b[1] < bottom(a);
function clamp(b, to) {
  const x0 = Math.max(b[0], to[0]), y0 = Math.max(b[1], to[1]);
  const x1 = Math.min(right(b), right(to)), y1 = Math.min(bottom(b), bottom(to));
  return [x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0)];
}
function union(boxes) {
  const x0 = Math.min(...boxes.map((b) => b[0])), y0 = Math.min(...boxes.map((b) => b[1]));
  return [x0, y0, Math.max(...boxes.map(right)) - x0, Math.max(...boxes.map(bottom)) - y0];
}

export function maskBox(mask, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

// Square dilation by r: a pixel is set if any pixel within r (in x and in y) is set.
export function dilate(mask, w, h, r) {
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  const pre = new Int32Array(Math.max(w, h) + 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) pre[x + 1] = pre[x] + mask[y * w + x];
    for (let x = 0; x < w; x++) if (pre[Math.min(w, x + r + 1)] - pre[Math.max(0, x - r)] > 0) tmp[y * w + x] = 1;
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) pre[y + 1] = pre[y] + tmp[y * w + x];
    for (let y = 0; y < h; y++) if (pre[Math.min(h, y + r + 1)] - pre[Math.max(0, y - r)] > 0) out[y * w + x] = 1;
  }
  return out;
}

// 8-connected components of `joined`; each blob reports the `core` pixels inside it, and how strongly they differ
// (diff: largest channel difference per pixel; hi: the level above which a feature pixel is fully opaque).
export function blobs(core, joined, w, h, isRed, diff, hi) {
  const label = new Int32Array(w * h), stack = new Int32Array(w * h);
  const out = [];
  for (let s = 0; s < w * h; s++) {
    if (!joined[s] || label[s]) continue;
    const id = out.length + 1;
    let sp = 0, count = 0, red = 0, x0 = w, y0 = h, x1 = -1, y1 = -1, dmax = 0, dsum = 0, overHi = 0;
    label[s] = id; stack[sp++] = s;
    while (sp) {
      const p = stack[--sp], x = p % w, y = (p - x) / w;
      if (core[p]) {
        count++;
        if (isRed(p)) red++;
        const v = diff[p];
        dsum += v;
        if (v > dmax) dmax = v;
        if (v > hi) overHi++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (joined[q] && !label[q]) { label[q] = id; stack[sp++] = q; }
        }
      }
    }
    if (count) out.push({ box: [x0, y0, x1 - x0 + 1, y1 - y0 + 1], pixels: count, redPixels: red, diffMax: dmax, diffSum: dsum, pixelsOverFeatureHi: overHi });
  }
  return out;
}

// The inside of the screen: the largest dark area inside the silhouette (the screen's fill) with everything it
// encloses (eyes, mouth, chevron, cursor), shrunk inward by `shrink` pixels so the outline's edges stay out.
export function screenInterior(img, silMask, threshold, shrink) {
  const { width: W, height: H, data: d } = img, n = W * H;
  const dark = new Uint8Array(n);
  for (let p = 0; p < n; p++) if (silMask[p] && Math.max(d[p * 4], d[p * 4 + 1], d[p * 4 + 2]) < threshold) dark[p] = 1;
  const label = new Int32Array(n), stack = new Int32Array(n);
  let best = 0, bestSize = 0, next = 0;
  for (let s = 0; s < n; s++) {
    if (!dark[s] || label[s]) continue;
    next++; let sp = 0, size = 0; label[s] = next; stack[sp++] = s;
    while (sp) {
      const p = stack[--sp], x = p % W; size++;
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p >= W ? p - W : -1, p < n - W ? p + W : -1]) {
        if (q >= 0 && dark[q] && !label[q]) { label[q] = next; stack[sp++] = q; }
      }
    }
    if (size > bestSize) { bestSize = size; best = next; }
  }
  // Everything not reachable from the image border without crossing the screen fill is inside the screen.
  const outside = new Uint8Array(n); let sp = 0;
  const push = (p) => { if (!outside[p] && label[p] !== best) { outside[p] = 1; stack[sp++] = p; } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (sp) {
    const p = stack[--sp], x = p % W;
    if (x > 0) push(p - 1); if (x < W - 1) push(p + 1); if (p >= W) push(p - W); if (p < n - W) push(p + W);
  }
  const grownOutside = dilate(outside, W, H, shrink);
  const inside = new Uint8Array(n);
  for (let p = 0; p < n; p++) if (!grownOutside[p]) inside[p] = 1;
  return inside;
}

// master and base are images of the same size. Returns the content of art/regions.json minus file hashes.
export function deriveRegions(spec, master, base) {
  const P = spec.processing;
  const { width: W, height: H } = master;
  if (base.width !== W || base.height !== H) throw new Error(`${P.base} is ${base.width}x${base.height}, the master is ${W}x${H}`);
  const sil = silhouette(master, P.silhouetteThreshold);
  const screen = maskBox(sil.mask, W, H);
  if (!screen) throw new Error("master: no screen found");
  const margin = ceilDiv(screen[2] * spec.regionRule.marginPercentOfScreenWidth, 100);

  const off = findOffset(master, base, [], P.searchRadiusPx, P.searchStridePx);
  const b = translate(base, off.dx, off.dy);
  // Rule changed after seeing G1-01 and G2-01 (art/layers.json regionRule): only the inside of the screen, shrunk by
  // the margin, is searched; pixels lit in the empty screen (the chevron, the outline) belong to the head; the
  // cursor is the master's red pixels there.
  const inside = screenInterior(master, sil.mask, P.silhouetteThreshold, margin);
  const core = new Uint8Array(W * H), diff = new Uint8Array(W * H), redMask = new Uint8Array(W * H);
  const m = master.data, d = b.data;
  const isRed = (p) => m[p * 4] - Math.max(m[p * 4 + 1], m[p * 4 + 2]) > P.featureLo;
  for (let p = 0; p < W * H; p++) {
    if (!inside[p]) continue;
    if (isRed(p)) { redMask[p] = 1; continue; }
    if (Math.max(d[p * 4], d[p * 4 + 1], d[p * 4 + 2]) >= P.silhouetteThreshold) continue;
    let dm = 0;
    for (let c = 0; c < 3; c++) { const v = m[p * 4 + c] - d[p * 4 + c]; const a = v < 0 ? -v : v; if (a > dm) dm = a; }
    diff[p] = dm;
    if (dm > P.featureLo) core[p] = 1;
  }
  const all = blobs(core, dilate(core, W, H, ceilDiv(margin, 2)), W, H, isRed, diff, P.featureHi);
  const kept = all.filter((x) => x.pixels >= margin * margin);
  const cyan = kept;
  const redBox = maskBox(redMask, W, H);
  const red = redBox ? [{ box: redBox }] : [];
  const problems = [];
  if (!redBox) problems.push("no red cursor pixels inside the screen");
  if (cyan.length !== 3) problems.push(`expected 3 blobs (2 eyes, 1 mouth), found ${cyan.length}`);
  if (problems.length) {
    const list = kept.map((x) => `${x.box.join(",")} ${x.pixels} px, ${x.redPixels} red`).join("; ");
    const err = new Error(`master rejected: ${problems.join("; ")}. Blobs: ${list || "none"}`);
    err.details = { margin, screen, baseOffset: { dx: off.dx, dy: off.dy, atSearchEdge: off.atEdge }, blobs: all, kept, core, inside, redBox };
    throw err;
  }
  // Lowest = largest box centre y (2y + h compares centres without halves); ties keep scan order.
  const byLow = [...cyan].sort((p, q) => (2 * q.box[1] + q.box[3]) - (2 * p.box[1] + p.box[3]));
  const mouthBox = byLow[0].box;
  const eyesBox = union(byLow.slice(1).map((x) => x.box));
  const cursorBox = red[0].box;
  if (bottom(eyesBox) > mouthBox[1]) throw new Error("master rejected: the eyes reach below the top of the mouth");

  const head = clamp(grow(screen, margin), [0, 0, W, H]);
  const cursor = grow(cursorBox, margin);
  let eyes = grow(eyesBox, margin);
  // Changed after seeing the G3, G6 and G7 attempts: brows and eyes share the boundary eyes box top - ceil(margin / 2).
  const browsEyes = eyesBox[1] - ceilDiv(margin, 2);
  eyes = [eyes[0], browsEyes, eyes[2], bottom(eyes) - browsEyes];
  const split = Math.floor((bottom(eyesBox) + mouthBox[1]) / 2);
  if (bottom(eyes) > split) eyes = [eyes[0], eyes[1], eyes[2], split - eyes[1]];
  // Changed after seeing the G3, G6 and G7 attempts: the mouth region starts at the eyes region's bottom edge.
  const mcx = centre(mouthBox)[0];
  const halfW = ceilDiv(3 * mouthBox[2], 4) + margin;
  const depth = Math.max(mouthBox[3], ceilDiv(2 * mouthBox[2], 3)) + margin;
  const mouthTop = bottom(eyes);
  const mouth = [mcx - halfW, mouthTop, 2 * halfW, mouthBox[1] + depth - mouthTop];
  let browsTop = eyes[1] - (ceilDiv(eyesBox[3], 2) + margin);
  if (eyes[0] < right(cursor) && cursor[0] < right(eyes) && browsTop < bottom(cursor) && bottom(cursor) <= eyes[1]) browsTop = bottom(cursor);
  let brows = [eyes[0], browsTop, eyes[2], eyes[1] - browsTop];

  const R = { cursor: clamp(cursor, head), eyes: clamp(eyes, head), brows: clamp(brows, head), mouth: clamp(mouth, head) };
  for (const [k, r] of Object.entries(R)) if (!r[2] || !r[3]) throw new Error(`master rejected: the ${k} region is empty`);
  const names = Object.keys(R);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (overlap(R[names[i]], R[names[j]])) throw new Error(`master rejected: ${names[i]} and ${names[j]} regions overlap`);
    }
  }
  const regionOf = { glow: [0, 0, W, H], head, ...R };
  const pivotOf = {
    glow: centre(screen),
    head: [screen[0] + Math.floor(screen[2] / 2), bottom(screen)],
    cursor: centre(cursorBox),
    eyes: centre(eyesBox),
    brows: centre(R.brows),
    mouth: centre(mouthBox),
  };
  const layers = {};
  for (const l of spec.layers) layers[l.id] = { region: regionOf[l.regionFrom], pivot: pivotOf[l.regionFrom] };
  return {
    canvas: { width: W, height: H },
    margin,
    baseOffset: { dx: off.dx, dy: off.dy, atSearchEdge: off.atEdge },
    measured: { screen, interior: maskBox(inside, W, H), cursor: cursorBox, eyes: eyesBox, mouth: mouthBox, blobs: all },
    layers,
  };
}

// Reads art/regions.json and checks it belongs to this master and covers every layer.
export function loadRegions(spec, file, masterSha256) {
  if (!fs.existsSync(file)) throw new Error(`${rel(file)} does not exist: run npm run regions on the approved master first`);
  const r = JSON.parse(fs.readFileSync(file, "utf8"));
  if (r.master?.sha256 !== masterSha256) throw new Error(`${rel(file)} was measured on another master (sha256 ${r.master?.sha256})`);
  for (const l of spec.layers) {
    const x = r.layers?.[l.id];
    if (!x || !Array.isArray(x.region) || x.region.length !== 4 || !Array.isArray(x.pivot) || x.pivot.length !== 2) {
      throw new Error(`${rel(file)} has no region and pivot for ${l.id}`);
    }
  }
  return r;
}

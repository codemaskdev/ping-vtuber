// Measuring and splitting generator images: offset search, colour drift, head silhouette, glow and feature layers.
// All integer arithmetic except the final per-pixel divisions, which use Math.round on non-negative values.
import { create } from "./image.mjs";

// [x, y, w, h] grown by m on every side.
export function grow(rect, m) {
  return [rect[0] - m, rect[1] - m, rect[2] + 2 * m, rect[3] + 2 * m];
}

export function inRect(rect, x, y) {
  return x >= rect[0] && y >= rect[1] && x < rect[0] + rect[2] && y < rect[1] + rect[3];
}

export function rectInside(box, rect) {
  return box.x >= rect[0] && box.y >= rect[1] && box.x + box.w <= rect[0] + rect[2] && box.y + box.h <= rect[1] + rect[3];
}

function gray(img) {
  const n = img.width * img.height, g = new Uint16Array(n), d = img.data;
  for (let i = 0; i < n; i++) g[i] = d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2];
  return g;
}

// Finds (dx, dy) with variant(x + dx, y + dy) ≈ master(x, y), outside the excluded rects (grown by the radius).
// Exhaustive over [-radius, radius]², on every stride-th pixel; score = mean |gray difference| on the overlap.
// Ties keep the first offset in scan order (dy, then dx, both ascending), so the result is fully determined.
export function findOffset(master, variant, exclude, radius, stride) {
  const { width: w, height: h } = master;
  if (variant.width !== w || variant.height !== h) throw new Error("findOffset: size mismatch");
  const gm = gray(master), gv = gray(variant);
  const ex = exclude.map((r) => grow(r, radius));
  const xs = [], ys = [], vals = [];
  for (let y = 0; y < h; y += stride) {
    for (let x = 0; x < w; x += stride) {
      if (ex.some((r) => inRect(r, x, y))) continue;
      xs.push(x); ys.push(y); vals.push(gm[y * w + x]);
    }
  }
  const X = Int32Array.from(xs), Y = Int32Array.from(ys), V = Int32Array.from(vals), n = X.length;
  let best = null;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      let sum = 0, count = 0;
      for (let i = 0; i < n; i++) {
        const x = X[i] + dx, y = Y[i] + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const diff = gv[y * w + x] - V[i];
        sum += diff < 0 ? -diff : diff;
        count++;
      }
      if (count === 0) continue;
      if (!best || sum * best.count < best.sum * count) best = { dx, dy, sum, count };
    }
  }
  return { dx: best.dx, dy: best.dy, atEdge: Math.abs(best.dx) === radius || Math.abs(best.dy) === radius };
}

// Mean absolute RGB difference between master(x, y) and variant(x + dx, y + dy), outside the excluded rects
// (grown by margin), over every overlapping pixel. sum and samples are exact integers; mean = sum / samples.
export function drift(master, variant, dx, dy, exclude, margin) {
  const { width: w, height: h } = master;
  const ex = exclude.map((r) => grow(r, margin));
  const a = master.data, b = variant.data;
  let sum = 0, samples = 0;
  for (let y = 0; y < h; y++) {
    const vy = y + dy;
    if (vy < 0 || vy >= h) continue;
    for (let x = 0; x < w; x++) {
      const vx = x + dx;
      if (vx < 0 || vx >= w) continue;
      if (ex.length && ex.some((r) => inRect(r, x, y))) continue;
      const i = (y * w + x) * 4, j = (vy * w + vx) * 4;
      for (let c = 0; c < 3; c++) { const d = a[i + c] - b[j + c]; sum += d < 0 ? -d : d; }
      samples += 3;
    }
  }
  return { sum, samples, mean: sum / samples };
}

function maxChannel(d, i) {
  const r = d[i], g = d[i + 1], b = d[i + 2];
  return r > g ? (r > b ? r : b) : (g > b ? g : b);
}

// Head silhouette: background = dark pixels (max channel < threshold) connected to the image border; the head is
// the largest 4-connected component of everything else. Smaller components (specks, stray glow) are not head.
export function silhouette(img, threshold) {
  const { width: w, height: h, data: d } = img;
  const n = w * h;
  const bg = new Uint8Array(n);
  const stack = new Int32Array(n);
  let sp = 0;
  const pushBg = (p) => {
    if (bg[p] || maxChannel(d, p * 4) >= threshold) return;
    bg[p] = 1; stack[sp++] = p;
  };
  for (let x = 0; x < w; x++) { pushBg(x); pushBg((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { pushBg(y * w); pushBg(y * w + w - 1); }
  while (sp) {
    const p = stack[--sp], x = p % w;
    if (x > 0) pushBg(p - 1);
    if (x < w - 1) pushBg(p + 1);
    if (p >= w) pushBg(p - w);
    if (p < n - w) pushBg(p + w);
  }
  // Label the non-background components, keep the largest (first found wins a tie).
  const label = new Int32Array(n);
  let next = 0, bestLabel = 0, bestSize = 0, components = 0;
  for (let s = 0; s < n; s++) {
    if (bg[s] || label[s]) continue;
    next++; components++;
    let size = 0;
    label[s] = next; stack[sp++] = s;
    while (sp) {
      const p = stack[--sp], x = p % w;
      size++;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p >= w ? p - w : -1, p < n - w ? p + w : -1];
      for (const q of nb) {
        if (q < 0 || bg[q] || label[q]) continue;
        label[q] = next; stack[sp++] = q;
      }
    }
    if (size > bestSize) { bestSize = size; bestLabel = next; }
  }
  const mask = new Uint8Array(n);
  for (let p = 0; p < n; p++) if (bestLabel && label[p] === bestLabel) mask[p] = 1;
  return { mask, pixels: bestSize, components };
}

// The head layer: the silhouette pixels, opaque.
export function extractHead(img, mask) {
  const out = create(img.width, img.height);
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    const i = p * 4;
    out.data[i] = img.data[i]; out.data[i + 1] = img.data[i + 1]; out.data[i + 2] = img.data[i + 2]; out.data[i + 3] = 255;
  }
  return out;
}

// The glow layer: everything outside the silhouette, treated as light on black. alpha follows brightness above
// the floor; colour is brightened back so that alpha × colour ≈ the original pixel over black.
export function extractGlow(img, mask, floor) {
  const out = create(img.width, img.height);
  const d = img.data, o = out.data;
  for (let p = 0; p < mask.length; p++) {
    if (mask[p]) continue;
    const i = p * 4, m = maxChannel(d, i);
    if (m <= floor) continue;
    for (let c = 0; c < 3; c++) o[i + c] = Math.min(255, Math.round((d[i + c] * 255) / m));
    o[i + 3] = Math.round(((m - floor) * 255) / (255 - floor));
  }
  return out;
}

// A feature layer: pixels inside rect and inside the head where the variant differs from the empty head (base).
// alpha ramps from 0 at a max-channel difference of lo to 255 at hi; colour is the variant's. With headLit set,
// pixels lit in the base (max channel >= headLit: the chevron, the outline) belong to the head and are skipped.
export function extractFeature(variant, base, mask, rect, lo, hi, headLit = 256) {
  const { width: w, height: h } = variant;
  const out = create(w, h);
  const v = variant.data, b = base.data, o = out.data;
  const x0 = Math.max(0, rect[0]), y0 = Math.max(0, rect[1]);
  const x1 = Math.min(w, rect[0] + rect[2]), y1 = Math.min(h, rect[1] + rect[3]);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = y * w + x;
      if (!mask[p]) continue;
      const i = p * 4;
      if (Math.max(b[i], b[i + 1], b[i + 2]) >= headLit) continue;
      let dm = 0;
      for (let c = 0; c < 3; c++) { const dd = v[i + c] - b[i + c]; const ad = dd < 0 ? -dd : dd; if (ad > dm) dm = ad; }
      if (dm <= lo) continue;
      o[i] = v[i]; o[i + 1] = v[i + 1]; o[i + 2] = v[i + 2];
      o[i + 3] = dm >= hi ? 255 : Math.round(((dm - lo) * 255) / (hi - lo));
    }
  }
  return out;
}

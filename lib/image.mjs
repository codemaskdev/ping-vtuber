// Pixel operations on 8-bit straight-alpha RGBA images { width, height, data }.
// Only + - * /, Math.round and Math.floor on finite values, so results are identical on every engine.

export function create(width, height, rgba = [0, 0, 0, 0]) {
  const data = new Uint8Array(width * height * 4);
  if (rgba[0] || rgba[1] || rgba[2] || rgba[3]) {
    for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  }
  return { width, height, data };
}

export function clone(img) {
  return { width: img.width, height: img.height, data: new Uint8Array(img.data) };
}

// Composites any transparency over opaque black. Returns the image and how many pixels were not opaque.
export function flattenOnBlack(img) {
  const out = clone(img);
  const d = out.data;
  let changed = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 255) continue;
    changed++;
    d[i] = Math.round((d[i] * a) / 255);
    d[i + 1] = Math.round((d[i + 1] * a) / 255);
    d[i + 2] = Math.round((d[i + 2] * a) / 255);
    d[i + 3] = 255;
  }
  return { img: out, changed };
}

// out(x, y) = img(x + dx, y + dy); pixels shifted in from outside are opaque black.
export function translate(img, dx, dy) {
  const { width: w, height: h } = img;
  const out = create(w, h, [0, 0, 0, 255]);
  for (let y = 0; y < h; y++) {
    const sy = y + dy;
    if (sy < 0 || sy >= h) continue;
    const x0 = Math.max(0, -dx), x1 = Math.min(w, w - dx);
    if (x1 <= x0) continue;
    out.data.set(img.data.subarray((sy * w + x0 + dx) * 4, (sy * w + x1 + dx) * 4), (y * w + x0) * 4);
  }
  return out;
}

// Resizes with premultiplied alpha: area average when shrinking, bilinear when growing.
export function resample(img, W, H) {
  if (W === img.width && H === img.height) return clone(img);
  if (W <= img.width && H <= img.height) return resampleArea(img, W, H);
  if (W >= img.width && H >= img.height) return resampleBilinear(img, W, H);
  throw new Error("resample: mixed shrink and grow is not supported");
}

function resampleArea(img, W, H) {
  const { width: w, height: h, data: s } = img;
  const out = create(W, H);
  const sx = w / W, sy = h / H;
  const acc = new Float64Array(4);
  for (let Y = 0; Y < H; Y++) {
    const y0 = Y * sy, y1 = (Y + 1) * sy;
    for (let X = 0; X < W; X++) {
      const x0 = X * sx, x1 = (X + 1) * sx;
      acc[0] = acc[1] = acc[2] = acc[3] = 0;
      let area = 0;
      for (let y = Math.floor(y0); y < y1 && y < h; y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        for (let x = Math.floor(x0); x < x1 && x < w; x++) {
          const wgt = (Math.min(x + 1, x1) - Math.max(x, x0)) * wy;
          const i = (y * w + x) * 4, a = s[i + 3];
          acc[0] += s[i] * a * wgt;
          acc[1] += s[i + 1] * a * wgt;
          acc[2] += s[i + 2] * a * wgt;
          acc[3] += a * wgt;
          area += wgt;
        }
      }
      writePremultiplied(out.data, (Y * W + X) * 4, acc, area);
    }
  }
  return out;
}

function resampleBilinear(img, W, H) {
  const { width: w, height: h, data: s } = img;
  const out = create(W, H);
  const acc = new Float64Array(4);
  for (let Y = 0; Y < H; Y++) {
    let fy = ((Y + 0.5) * h) / H - 0.5;
    if (fy < 0) fy = 0;
    if (fy > h - 1) fy = h - 1;
    const ya = Math.floor(fy), yb = Math.min(h - 1, ya + 1), ty = fy - ya;
    for (let X = 0; X < W; X++) {
      let fx = ((X + 0.5) * w) / W - 0.5;
      if (fx < 0) fx = 0;
      if (fx > w - 1) fx = w - 1;
      const xa = Math.floor(fx), xb = Math.min(w - 1, xa + 1), tx = fx - xa;
      acc[0] = acc[1] = acc[2] = acc[3] = 0;
      const taps = [[xa, ya, (1 - tx) * (1 - ty)], [xb, ya, tx * (1 - ty)], [xa, yb, (1 - tx) * ty], [xb, yb, tx * ty]];
      for (const [x, y, wgt] of taps) {
        const i = (y * w + x) * 4, a = s[i + 3];
        acc[0] += s[i] * a * wgt;
        acc[1] += s[i + 1] * a * wgt;
        acc[2] += s[i + 2] * a * wgt;
        acc[3] += a * wgt;
      }
      writePremultiplied(out.data, (Y * W + X) * 4, acc, 1);
    }
  }
  return out;
}

function writePremultiplied(d, o, acc, area) {
  const a = acc[3] / area;
  const A = Math.round(a);
  if (A === 0) { d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 0; return; }
  for (let c = 0; c < 3; c++) d[o + c] = Math.min(255, Math.round(acc[c] / acc[3]));
  d[o + 3] = A;
}

// Paints src over dst in place (straight alpha), src's top-left at (ox, oy).
export function over(dst, src, ox = 0, oy = 0) {
  const D = dst.data, S = src.data;
  for (let y = 0; y < src.height; y++) {
    const ty = y + oy;
    if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < src.width; x++) {
      const tx = x + ox;
      if (tx < 0 || tx >= dst.width) continue;
      const si = (y * src.width + x) * 4, di = (ty * dst.width + tx) * 4;
      const sa = S[si + 3];
      if (sa === 0) continue;
      const da = D[di + 3];
      if (sa === 255 || da === 0) { D[di] = S[si]; D[di + 1] = S[si + 1]; D[di + 2] = S[si + 2]; D[di + 3] = sa; continue; }
      const outA = sa * 255 + da * (255 - sa); // alpha scaled by 255
      for (let c = 0; c < 3; c++) D[di + c] = Math.round((S[si + c] * sa * 255 + D[di + c] * da * (255 - sa)) / outA);
      D[di + 3] = Math.round(outA / 255);
    }
  }
  return dst;
}

// Smallest box holding every pixel with alpha > 0: { x, y, w, h }, or null for an empty layer.
export function alphaBBox(img) {
  const { width: w, height: h, data: d } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function alphaAt(img, x, y) {
  return img.data[(y * img.width + x) * 4 + 3];
}

export function checkerboard(w, h, cell = 16, a = [58, 58, 66, 255], b = [34, 34, 40, 255]) {
  const out = create(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out.data.set(((Math.floor(x / cell) + Math.floor(y / cell)) & 1) ? a : b, (y * w + x) * 4);
  }
  return out;
}

export function fillRect(img, x, y, w, h, rgba) {
  for (let yy = Math.max(0, y); yy < Math.min(img.height, y + h); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(img.width, x + w); xx++) img.data.set(rgba, (yy * img.width + xx) * 4);
  }
}

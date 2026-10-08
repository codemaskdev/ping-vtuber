// art/raw → art/layers, and the measurements check:layers prints. Shared by the scripts and the tests.
import fs from "node:fs";
import path from "node:path";
import { alphaAt, alphaBBox, flattenOnBlack, resample, translate } from "./image.mjs";
import { drift, extractFeature, extractGlow, extractHead, findOffset, rectInside, silhouette } from "./extract.mjs";
import { FIXTURE_KEY, FIXTURE_VALUE, readPng, writePng } from "./png.mjs";
import { ROOT, changedRects, layer, rel } from "./spec.mjs";

const FIXTURE_DIR = path.join(ROOT, "test", "fixtures");

function under(dir, p) {
  const r = path.relative(dir, path.resolve(p));
  return r === "" || (!r.startsWith("..") && !path.isAbsolute(r));
}

// Fixtures only ever go in and out of test/fixtures/; real runs never accept a fixture file.
export function guardDirs(dirs, fixtures) {
  for (const d of dirs) {
    if (fixtures && !under(FIXTURE_DIR, d)) throw new Error(`fixture mode: ${rel(path.resolve(d))} is outside test/fixtures/`);
    if (!fixtures && under(FIXTURE_DIR, d)) throw new Error(`${rel(path.resolve(d))} is a fixture folder; pass --fixtures`);
  }
}

function guardFile(file, isFix, fixtures) {
  if (isFix && !fixtures) throw new Error(`${rel(file)} is a TEST FIXTURE, not character art; refusing to use it`);
  if (!isFix && fixtures) throw new Error(`${rel(file)} is not a fixture; fixture mode only reads fixtures`);
}

// Reads every raw named in the spec and brings it to the canvas. Each automatic step is recorded.
export function loadRaws(spec, rawDir, { fixtures = false } = {}) {
  const { width: W, height: H } = spec.canvas;
  const missing = spec.raws.filter((r) => !fs.existsSync(path.join(rawDir, r.file))).map((r) => r.file);
  if (missing.length) throw new Error(`missing in ${rel(path.resolve(rawDir))}/: ${missing.join(", ")}`);
  const out = new Map();
  for (const r of spec.raws) {
    const file = path.join(rawDir, r.file);
    const { img, sha256, buf, fixture } = readPng(file);
    guardFile(file, fixture, fixtures);
    const steps = [{ op: "read", file: rel(file), sha256, bytes: buf.length, width: img.width, height: img.height }];
    let cur = img;
    const flat = flattenOnBlack(cur);
    if (flat.changed) {
      cur = flat.img;
      steps.push({ op: "flattenOnBlack", pixelsNotOpaque: flat.changed });
    }
    if (cur.width !== cur.height) throw new Error(`${rel(file)} is ${cur.width}x${cur.height}, not square; rerun the generator for a 1:1 image`);
    if (cur.width !== W || cur.height !== H) {
      steps.push({ op: "resample", from: [cur.width, cur.height], to: [W, H], method: cur.width > W ? "area" : "bilinear" });
      cur = resample(cur, W, H);
    }
    out.set(r.file, { raw: r, img: cur, sha256, steps });
  }
  return out;
}

// Offset and colour drift of every variant against the master, outside the features it is meant to change.
export function measure(spec, raws) {
  const P = spec.processing;
  const master = raws.get(P.master).img;
  const res = new Map();
  for (const [file, r] of raws) {
    if (file === P.master) continue;
    const ex = changedRects(spec, r.raw);
    const off = findOffset(master, r.img, ex, P.searchRadiusPx, P.searchStridePx);
    const d = drift(master, r.img, off.dx, off.dy, ex, P.searchRadiusPx);
    res.set(file, { dx: off.dx, dy: off.dy, atEdge: off.atEdge, drift: d });
  }
  return res;
}

export function processAll(spec, rawDir, outDir, { fixtures = false } = {}) {
  guardDirs([rawDir, outDir], fixtures);
  const P = spec.processing;
  const raws = loadRaws(spec, rawDir, { fixtures });
  const offsets = measure(spec, raws);
  const aligned = new Map();
  for (const [file, r] of raws) {
    const o = offsets.get(file);
    if (o && (o.dx || o.dy)) {
      r.steps.push({ op: "translate", dx: o.dx, dy: o.dy, note: "aligned to the master: out(x, y) = in(x + dx, y + dy)" });
      aligned.set(file, translate(r.img, o.dx, o.dy));
    } else aligned.set(file, r.img);
  }
  const base = aligned.get(P.base);
  const sil = silhouette(base, P.silhouetteThreshold);
  fs.mkdirSync(outDir, { recursive: true });
  const text = fixtures ? { [FIXTURE_KEY]: FIXTURE_VALUE } : {};
  const layers = [];
  for (const l of spec.layers) {
    const src = aligned.get(l.source);
    let img, params;
    if (l.extract === "silhouette") {
      img = extractHead(src, sil.mask);
      params = { silhouetteThreshold: P.silhouetteThreshold };
    } else if (l.extract === "glow") {
      img = extractGlow(src, sil.mask, P.glowFloor);
      params = { silhouetteThreshold: P.silhouetteThreshold, glowFloor: P.glowFloor };
    } else {
      img = extractFeature(src, base, sil.mask, l.region, P.featureLo, P.featureHi);
      params = { base: P.base, region: l.region, featureLo: P.featureLo, featureHi: P.featureHi };
    }
    const file = path.join(outDir, l.file);
    const w = writePng(file, img, text);
    layers.push({ id: l.id, file: rel(file), source: l.source, extract: l.extract, params, alphaBBox: alphaBBox(img), sha256: w.sha256, bytes: w.bytes });
  }
  const log = {
    $comment: "Written by scripts/process.mjs. Every automatic step applied to the generator images, with its parameters and measured values. Do not edit by hand.",
    runtime: { node: process.versions.node, zlib: process.versions.zlib },
    canvas: spec.canvas,
    raws: [...raws.values()].map((r) => {
      const o = offsets.get(r.raw.file);
      return {
        file: r.raw.file,
        prompt: r.raw.prompt,
        steps: r.steps,
        ...(o ? { offset: { dx: o.dx, dy: o.dy, atSearchEdge: o.atEdge }, drift: o.drift } : { role: "master" }),
      };
    }),
    silhouette: { source: P.base, threshold: P.silhouetteThreshold, headPixels: sil.pixels, components: sil.components },
    layers,
  };
  return log;
}

const CORNERS = (w, h) => [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];

// One row per layer: what check:layers prints. ok is false if any row has a problem.
export function checkLayers(spec, rawDir, layersDir, { fixtures = false } = {}) {
  guardDirs([rawDir, layersDir], fixtures);
  const { width: W, height: H } = spec.canvas;
  const C = spec.checks;
  const raws = loadRaws(spec, rawDir, { fixtures });
  const offsets = measure(spec, raws);
  const rows = [];
  for (const l of [...spec.layers].sort((a, b) => a.z - b.z)) {
    const file = path.join(layersDir, l.file);
    const row = { id: l.id, source: l.source, region: l.region, problems: [] };
    rows.push(row);
    if (!fs.existsSync(file)) { row.problems.push("missing"); continue; }
    const { img, fixture } = readPng(file);
    guardFile(file, fixture, fixtures);
    row.canvas = [img.width, img.height];
    if (img.width !== W || img.height !== H) { row.problems.push(`canvas ${img.width}x${img.height}, spec ${W}x${H}`); continue; }
    row.bbox = alphaBBox(img);
    row.inside = !!row.bbox && rectInside(row.bbox, l.region);
    if (!row.bbox) row.problems.push("empty");
    else if (!row.inside) row.problems.push("outside region");
    row.corners = CORNERS(W, H).map(([x, y]) => alphaAt(img, x, y));
    if (row.corners.some((a) => a !== 0)) row.problems.push("corner alpha");
    if (l.extract === "silhouette") {
      row.centreAlpha = alphaAt(img, W >> 1, H >> 1);
      if (row.centreAlpha !== 255) row.problems.push("screen centre not opaque (gap in the outline?)");
    }
    const o = offsets.get(l.source);
    if (o) {
      row.offset = [o.dx, o.dy];
      row.drift = o.drift;
      if (o.atEdge) row.problems.push("offset at search edge");
      if (Math.abs(o.dx) > C.maxOffsetPx || Math.abs(o.dy) > C.maxOffsetPx) row.problems.push(`offset > ${C.maxOffsetPx} px`);
      if (o.drift.mean > C.maxDrift) row.problems.push(`drift > ${C.maxDrift}`);
    }
  }
  return { rows, ok: rows.every((r) => !r.problems.length), limits: C };
}

export function formatTable(result) {
  const head = ["layer", "source", "canvas", "alpha bbox x,y,w,h", "region x,y,w,h", "inside", "corner alpha TL,TR,BL,BR", "offset dx,dy", "drift mean (sum/samples)", "status"];
  const body = result.rows.map((r) => [
    r.id,
    r.source,
    r.canvas ? r.canvas.join("x") : "-",
    r.bbox ? [r.bbox.x, r.bbox.y, r.bbox.w, r.bbox.h].join(",") : "-",
    r.region.join(","),
    r.bbox ? (r.inside ? "yes" : "NO") : "-",
    r.corners ? r.corners.join(",") : "-",
    r.offset ? r.offset.join(",") : "master",
    r.drift ? `${r.drift.mean} (${r.drift.sum}/${r.drift.samples})` : "master",
    r.problems.length ? "FAIL: " + r.problems.join("; ") : "ok",
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const line = (cells) => "| " + cells.map((c, i) => c.padEnd(widths[i])).join(" | ") + " |";
  return [line(head), "|" + widths.map((w) => "-".repeat(w + 2)).join("|") + "|", ...body.map(line)].join("\n");
}

export { layer };

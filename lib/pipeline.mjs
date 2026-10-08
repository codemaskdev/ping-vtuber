// art/raw → art/layers, and the measurements check:layers prints. Shared by the scripts and the tests.
import fs from "node:fs";
import path from "node:path";
import { alphaAt, alphaBBox, flattenOnBlack, translate } from "./image.mjs";
import { drift, extractFeature, extractGlow, extractHead, findOffset, rectInside, silhouette } from "./extract.mjs";
import { FIXTURE_KEY, FIXTURE_VALUE, readPng, sha256, writePng } from "./png.mjs";
import { blobs, dilate, loadRegions, maskBox, screenInterior } from "./regions.mjs";
import { ROOT, changedRects, rel, withRegions } from "./spec.mjs";

const FIXTURE_DIR = path.join(ROOT, "test", "fixtures");

function under(dir, p) {
  const r = path.relative(dir, path.resolve(p));
  return r === "" || (!r.startsWith("..") && !path.isAbsolute(r));
}

// Fixtures only ever go in and out of test/fixtures/; real runs never touch it.
export function guardDirs(paths, fixtures) {
  for (const d of paths) {
    if (fixtures && !under(FIXTURE_DIR, d)) throw new Error(`fixture mode: ${rel(d)} is outside test/fixtures/`);
    if (!fixtures && under(FIXTURE_DIR, d)) throw new Error(`${rel(d)} is a fixture folder; pass --fixtures`);
  }
}

function guardFile(file, isFix, fixtures) {
  if (isFix && !fixtures) throw new Error(`${rel(file)} is a TEST FIXTURE, not character art; refusing to use it`);
  if (!isFix && fixtures) throw new Error(`${rel(file)} is not a fixture; fixture mode only reads fixtures`);
}

// Reads every raw named in the spec. The master's pixel size is the canvas; a raw of any other size fails.
// Nothing is resampled. The only automatic step here is compositing transparency onto black, and it is recorded.
// partial: only the master and the empty screen are required; layers from raws not in yet are skipped.
export function loadRaws(spec, rawDir, { fixtures = false, partial = false } = {}) {
  const required = partial ? spec.raws.filter((r) => [spec.processing.master, spec.processing.base].includes(r.file)) : spec.raws;
  const missing = required.filter((r) => !fs.existsSync(path.join(rawDir, r.file))).map((r) => r.file);
  if (missing.length) throw new Error(`missing in ${rel(rawDir)}/: ${missing.join(", ")}`);
  const out = new Map();
  let W = 0, H = 0;
  for (const r of spec.raws) {
    if (partial && !fs.existsSync(path.join(rawDir, r.file))) continue;
    const file = path.join(rawDir, r.file);
    const { img, sha256: hash, buf, fixture } = readPng(file);
    guardFile(file, fixture, fixtures);
    if (r.file === spec.processing.master) ({ width: W, height: H } = img);
    else if (img.width !== W || img.height !== H) {
      throw new Error(`${rel(file)} is ${img.width}x${img.height}, the master is ${W}x${H}: a raw of another size is a failed generation`);
    }
    const steps = [{ op: "read", file: rel(file), sha256: hash, bytes: buf.length, width: img.width, height: img.height }];
    let cur = img;
    const flat = flattenOnBlack(cur);
    if (flat.changed) {
      cur = flat.img;
      steps.push({ op: "flattenOnBlack", pixelsNotOpaque: flat.changed });
    }
    out.set(r.file, { raw: r, img: cur, sha256: hash, steps });
  }
  return out;
}

// Offset and colour drift of every variant against the master, outside the features it is meant to change.
export function measure(layout, raws) {
  const P = layout.processing;
  const master = raws.get(P.master).img;
  const res = new Map();
  for (const [file, r] of raws) {
    if (file === P.master) continue;
    const ex = changedRects(layout, r.raw);
    const off = findOffset(master, r.img, ex, P.searchRadiusPx, P.searchStridePx);
    const d = drift(master, r.img, off.dx, off.dy, ex, P.searchRadiusPx);
    res.set(file, { dx: off.dx, dy: off.dy, atEdge: off.atEdge, drift: d });
  }
  return res;
}

function layoutFor(spec, raws, regionsFile) {
  const masterSha = raws.get(spec.processing.master).sha256;
  const regions = loadRegions(spec, regionsFile, masterSha);
  const master = raws.get(spec.processing.master).img;
  if (regions.canvas.width !== master.width || regions.canvas.height !== master.height) {
    throw new Error(`${rel(regionsFile)} canvas ${regions.canvas.width}x${regions.canvas.height} is not the master's ${master.width}x${master.height}`);
  }
  return { regions, layout: withRegions(spec, regions) };
}

export function processAll(spec, rawDir, outDir, regionsFile, { fixtures = false, partial = false } = {}) {
  guardDirs([rawDir, outDir, regionsFile], fixtures);
  const P = spec.processing;
  const raws = loadRaws(spec, rawDir, { fixtures, partial });
  const { regions, layout } = layoutFor(spec, raws, regionsFile);
  const offsets = measure(layout, raws);
  // Every variant is shifted by its measured offset before anything is extracted from it.
  const aligned = new Map();
  for (const [file, r] of raws) {
    const o = offsets.get(file);
    if (o && (o.dx || o.dy)) {
      r.steps.push({ op: "translate", dx: o.dx, dy: o.dy, note: "aligned to the master before extraction: out(x, y) = in(x + dx, y + dy)" });
      aligned.set(file, translate(r.img, o.dx, o.dy));
    } else aligned.set(file, r.img);
  }
  const base = aligned.get(P.base);
  const sil = silhouette(base, P.silhouetteThreshold);
  fs.mkdirSync(outDir, { recursive: true });
  const text = fixtures ? { [FIXTURE_KEY]: FIXTURE_VALUE } : {};
  const layers = [], waiting = [];
  for (const l of layout.layers) {
    const src = aligned.get(l.source);
    if (!src) { waiting.push(l.id); continue; }
    let img, params;
    if (l.extract === "silhouette") {
      img = extractHead(src, sil.mask);
      params = { silhouetteThreshold: P.silhouetteThreshold };
    } else if (l.extract === "glow") {
      img = extractGlow(src, sil.mask, P.glowFloor);
      params = { silhouetteThreshold: P.silhouetteThreshold, glowFloor: P.glowFloor };
    } else {
      img = extractFeature(src, base, sil.mask, l.region, P.featureLo, P.featureHi, P.silhouetteThreshold);
      params = { base: P.base, region: l.region, featureLo: P.featureLo, featureHi: P.featureHi, headLitFrom: P.silhouetteThreshold };
    }
    const file = path.join(outDir, l.file);
    const w = writePng(file, img, text);
    layers.push({ id: l.id, file: rel(file), source: l.source, extract: l.extract, params, alphaBBox: alphaBBox(img), sha256: w.sha256, bytes: w.bytes });
  }
  return {
    $comment: "Written by scripts/process.mjs. Every automatic step applied to the generator images, with its parameters and measured values. Do not edit by hand.",
    runtime: { node: process.versions.node, zlib: process.versions.zlib },
    canvas: layout.canvas,
    regions: { file: rel(regionsFile), sha256: sha256(fs.readFileSync(regionsFile)), frozen: regions.frozen === true },
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
    ...(waiting.length ? { waiting } : {}),
  };
}

const CORNERS = (w, h) => [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];

// What a variant really changed: inside the screen (shrunk by the regions' margin, as in the region rule), pixels
// whose largest channel differs from the master by more than featureHi after alignment, joined into blobs the same
// way as the region rule (dilate by ceil(margin / 2), keep blobs of at least margin^2 pixels). Every kept blob must
// lie inside one of the regions of the layers this raw is meant to change. Feature layers are cut to their region,
// so their alpha box alone cannot show a shape that overflows it; this can.
export function changedBlobs(layout, regions, master, variant, offset) {
  const P = layout.processing, { width: W, height: H } = master, m = regions.margin;
  const inside = screenInterior(master, silhouette(master, P.silhouetteThreshold).mask, P.silhouetteThreshold, m);
  const a = translate(variant, offset.dx, offset.dy), core = new Uint8Array(W * H), diff = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) {
    if (!inside[p]) continue;
    let dm = 0;
    for (let c = 0; c < 3; c++) { const v = master.data[p * 4 + c] - a.data[p * 4 + c]; const x = v < 0 ? -v : v; if (x > dm) dm = x; }
    diff[p] = dm;
    if (dm > P.featureHi) core[p] = 1;
  }
  const found = blobs(core, dilate(core, W, H, Math.ceil(m / 2)), W, H, () => false, diff, P.featureHi).filter((b) => b.pixels >= m * m);
  return found.map((b) => ({ box: b.box, pixels: b.pixels }));
}

// One row per layer. Canvas size, inside-region and corner alpha are pass/fail. Offset, drift and screen size are
// "measured" while their limits in art/layers.json checks are null, and pass/fail once a limit is set.
export function checkLayers(spec, rawDir, layersDir, regionsFile, { fixtures = false, partial = false } = {}) {
  guardDirs([rawDir, layersDir, regionsFile], fixtures);
  const C = spec.checks;
  const raws = loadRaws(spec, rawDir, { fixtures, partial });
  const { regions, layout } = layoutFor(spec, raws, regionsFile);
  const { width: W, height: H } = layout.canvas;
  const offsets = measure(layout, raws);
  const screens = new Map();
  for (const [file, r] of raws) screens.set(file, maskBox(silhouette(r.img, spec.processing.silhouetteThreshold).mask, W, H));
  const masterScreen = screens.get(spec.processing.master);
  const masterImg = raws.get(spec.processing.master).img;
  const spill = new Map();
  for (const [file, r] of raws) {
    const o = offsets.get(file);
    if (!o) continue;
    const allowed = changedRects(layout, r.raw);
    const found = changedBlobs(layout, regions, masterImg, r.img, o);
    spill.set(file, { found, outside: found.filter((b) => !allowed.some((g) => rectInside({ x: b.box[0], y: b.box[1], w: b.box[2], h: b.box[3] }, g))) });
  }
  const rows = [];
  for (const l of [...layout.layers].sort((a, b) => a.z - b.z)) {
    const file = path.join(layersDir, l.file);
    const row = { id: l.id, source: l.source, region: l.region, problems: [], notes: [] };
    rows.push(row);
    row.masterScreen = [masterScreen[2], masterScreen[3]];
    if (!raws.has(l.source)) { row.waiting = true; continue; }
    const scr = screens.get(l.source);
    row.screen = scr ? [scr[2], scr[3]] : null;
    row.masterScreen = [masterScreen[2], masterScreen[3]];
    const o = offsets.get(l.source);
    if (o) {
      const sp = spill.get(l.source);
      row.changed = sp.found.length;
      row.changedOutside = sp.outside.map((b) => b.box);
      if (sp.outside.length) row.problems.push(`changed outside its regions: ${sp.outside.map((b) => `[${b.box.join(",")}] ${b.pixels} px`).join(", ")}`);
      row.offset = [o.dx, o.dy];
      row.drift = o.drift;
      row.scaleDelta = scr ? [scr[2] - masterScreen[2], scr[3] - masterScreen[3]] : null;
      row.measured = true;
      if (o.atEdge) row.notes.push("offset at search edge, may be larger");
      if (C.maxOffsetPx !== null && (Math.abs(o.dx) > C.maxOffsetPx || Math.abs(o.dy) > C.maxOffsetPx)) row.problems.push(`offset > ${C.maxOffsetPx} px`);
      if (C.maxDrift !== null && o.drift.mean > C.maxDrift) row.problems.push(`drift > ${C.maxDrift}`);
      if (C.maxScaleDeltaPx !== null && row.scaleDelta && Math.max(Math.abs(row.scaleDelta[0]), Math.abs(row.scaleDelta[1])) > C.maxScaleDeltaPx) {
        row.problems.push(`screen size differs by > ${C.maxScaleDeltaPx} px`);
      }
    }
    if (!fs.existsSync(file)) { row.problems.push("missing"); continue; }
    const { img, fixture } = readPng(file);
    guardFile(file, fixture, fixtures);
    row.canvas = [img.width, img.height];
    if (img.width !== W || img.height !== H) { row.problems.push(`canvas ${img.width}x${img.height}, master ${W}x${H}`); continue; }
    row.bbox = alphaBBox(img);
    row.inside = !!row.bbox && rectInside(row.bbox, l.region);
    if (!row.bbox) row.problems.push("empty");
    else if (!row.inside) row.problems.push("outside region");
    row.corners = CORNERS(W, H).map(([x, y]) => alphaAt(img, x, y));
    if (row.corners.some((a) => a !== 0)) row.problems.push("corner alpha");
  }
  return { rows, ok: rows.every((r) => !r.problems.length), limits: C, regionsFrozen: regions.frozen === true };
}

function status(r) {
  if (r.waiting) return `waiting: ${r.source} not in yet`;
  if (r.problems.length) return "FAIL: " + r.problems.join("; ");
  const s = r.measured ? "measured" : "ok";
  return r.notes.length ? `${s} (${r.notes.join("; ")})` : s;
}

export function formatTable(result) {
  const head = ["layer", "source", "canvas", "alpha bbox x,y,w,h", "region x,y,w,h", "inside", "changed blobs (outside)", "corner alpha TL,TR,BL,BR", "offset dx,dy", "drift mean (sum/samples)", "screen w,h (master w,h)", "status"];
  const body = result.rows.map((r) => [
    r.id,
    r.source,
    r.canvas ? r.canvas.join("x") : "-",
    r.bbox ? [r.bbox.x, r.bbox.y, r.bbox.w, r.bbox.h].join(",") : "-",
    r.region.join(","),
    r.bbox ? (r.inside ? "yes" : "NO") : "-",
    r.changed === undefined ? "master" : `${r.changed} (${r.changedOutside.length})`,
    r.corners ? r.corners.join(",") : "-",
    r.offset ? r.offset.join(",") : "master",
    r.drift ? `${r.drift.mean} (${r.drift.sum}/${r.drift.samples})` : "master",
    `${r.screen ? r.screen.join(",") : "-"} (${r.masterScreen.join(",")})`,
    status(r),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const line = (cells) => "| " + cells.map((c, i) => c.padEnd(widths[i])).join(" | ") + " |";
  return [line(head), "|" + widths.map((w) => "-".repeat(w + 2)).join("|") + "|", ...body.map(line)].join("\n");
}

export function limitsLine(limits) {
  const show = (v, unit = "") => (v === null ? "not set (calibration)" : `<= ${v}${unit}`);
  return `limits (art/layers.json checks): offset ${show(limits.maxOffsetPx, " px")}, drift ${show(limits.maxDrift)}, screen size delta ${show(limits.maxScaleDeltaPx, " px")}`;
}

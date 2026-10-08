// Loads and validates art/layers.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SPEC_FILE = path.join(ROOT, "art", "layers.json");
export const MAX_MOUTHS = 6;

export function loadSpec(file = SPEC_FILE) {
  const spec = JSON.parse(fs.readFileSync(file, "utf8"));
  const errors = validateSpec(spec);
  if (errors.length) throw new Error("art/layers.json is invalid:\n  " + errors.join("\n  "));
  return spec;
}

// Repo-relative path with forward slashes, for logs (never an absolute local path).
export function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join("/");
}

const isInt = (v) => Number.isInteger(v);

export function validateSpec(spec) {
  const e = [];
  const W = spec?.canvas?.width, H = spec?.canvas?.height;
  if (!isInt(W) || !isInt(H) || W <= 0 || H <= 0) return ["canvas.width and canvas.height must be positive integers"];
  if (!Array.isArray(spec.layers) || !spec.layers.length) return ["layers must be a non-empty array"];
  const ids = new Map();
  for (const l of spec.layers) {
    if (typeof l.id !== "string" || !/^[a-z][a-z0-9_]*$/.test(l.id)) e.push(`bad id ${JSON.stringify(l.id)}`);
    if (ids.has(l.id)) e.push(`duplicate id ${l.id}`);
    ids.set(l.id, l);
  }
  const raws = new Map((spec.raws || []).map((r) => [r.file, r]));
  for (const l of spec.layers) {
    const at = `layer ${l.id}:`;
    if (l.file !== `${l.id}.png`) e.push(`${at} file must be ${l.id}.png`);
    if (!isInt(l.z)) e.push(`${at} z must be an integer`);
    const r = l.region;
    if (!Array.isArray(r) || r.length !== 4 || !r.every(isInt)) e.push(`${at} region must be [x, y, w, h] integers`);
    else if (r[0] < 0 || r[1] < 0 || r[2] <= 0 || r[3] <= 0 || r[0] + r[2] > W || r[1] + r[3] > H) e.push(`${at} region outside the canvas`);
    const p = l.pivot;
    if (!Array.isArray(p) || p.length !== 2 || !p.every(isInt)) e.push(`${at} pivot must be [x, y] integers`);
    else if (p[0] < 0 || p[1] < 0 || p[0] >= W || p[1] >= H) e.push(`${at} pivot outside the canvas`);
    if (l.parent !== null && !ids.has(l.parent)) e.push(`${at} unknown parent ${l.parent}`);
    if (!raws.has(l.source)) e.push(`${at} source ${l.source} is not in raws`);
    if (!["silhouette", "glow", "feature"].includes(l.extract)) e.push(`${at} unknown extract ${l.extract}`);
    if (l.extract === "feature" && Array.isArray(r) && Array.isArray(ids.get("head")?.region) && !boxInBox(r, ids.get("head").region)) {
      e.push(`${at} region is not inside the head region`);
    }
  }
  // Parent chains end at a root, no cycles; exactly one root.
  const roots = spec.layers.filter((l) => l.parent === null);
  if (roots.length !== 1) e.push(`exactly one root layer expected, found ${roots.length}`);
  for (const l of spec.layers) {
    const seen = new Set();
    for (let c = l; c && c.parent !== null; c = ids.get(c.parent)) {
      if (seen.has(c.id)) { e.push(`layer ${l.id}: parent cycle`); break; }
      seen.add(c.id);
    }
  }
  const mouths = spec.layers.filter((l) => l.group === "mouth");
  if (!mouths.length || mouths.length > MAX_MOUTHS) e.push(`mouth group must have 1..${MAX_MOUTHS} shapes, has ${mouths.length}`);
  for (const m of mouths) {
    if (typeof m.covers !== "string" || !m.covers) e.push(`layer ${m.id}: mouth needs covers`);
    if (JSON.stringify(m.region) !== JSON.stringify(mouths[0].region)) e.push(`layer ${m.id}: all mouths must share one region`);
    if (JSON.stringify(m.pivot) !== JSON.stringify(mouths[0].pivot)) e.push(`layer ${m.id}: all mouths must share one pivot`);
  }
  const P = spec.processing || {};
  if (!raws.has(P.master)) e.push("processing.master must be one of raws");
  if (!raws.has(P.base)) e.push("processing.base must be one of raws");
  for (const k of ["silhouetteThreshold", "glowFloor", "featureLo", "featureHi", "searchRadiusPx", "searchStridePx"]) {
    if (!isInt(P[k]) || P[k] < 0) e.push(`processing.${k} must be a non-negative integer`);
  }
  if (P.featureHi <= P.featureLo) e.push("processing.featureHi must be above featureLo");
  if (!(P.glowFloor < 255)) e.push("processing.glowFloor must be below 255");
  const C = spec.checks || {};
  if (!isInt(C.maxOffsetPx) || !(typeof C.maxDrift === "number")) e.push("checks.maxOffsetPx and checks.maxDrift are required");
  if (isInt(C.maxOffsetPx) && C.maxOffsetPx >= P.searchRadiusPx) e.push("checks.maxOffsetPx must be below processing.searchRadiusPx");
  for (const r of spec.raws || []) {
    if (!/^\d\d-[a-z0-9_]+\.png$/.test(r.file)) e.push(`raw ${r.file}: name must look like 01-name.png`);
    if (!/^G\d+$/.test(r.prompt)) e.push(`raw ${r.file}: prompt must be a generator prompt id like G1`);
    for (const c of r.changes || []) if (!ids.has(c)) e.push(`raw ${r.file}: changes names unknown layer ${c}`);
    if (r.file !== P.master && !(r.changes || []).length) e.push(`raw ${r.file}: a variant must name the layers it changes`);
  }
  return e;
}

function boxInBox(a, b) {
  return a[0] >= b[0] && a[1] >= b[1] && a[0] + a[2] <= b[0] + b[2] && a[1] + a[3] <= b[1] + b[3];
}

export function layer(spec, id) {
  return spec.layers.find((l) => l.id === id);
}

// Rects of the features a raw image is meant to change (excluded when measuring drift).
export function changedRects(spec, raw) {
  return (raw.changes || []).map((id) => layer(spec, id).region);
}

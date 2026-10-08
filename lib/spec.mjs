// Loads and validates art/layers.json, and joins it with the measured regions (art/regions.json).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SPEC_FILE = path.join(ROOT, "art", "layers.json");
export const MAX_MOUTHS = 6;
export const REGION_KINDS = ["glow", "head", "cursor", "eyes", "brows", "mouth"];

export function loadSpec(file = SPEC_FILE) {
  const spec = JSON.parse(fs.readFileSync(file, "utf8"));
  const errors = validateSpec(spec);
  if (errors.length) throw new Error("art/layers.json is invalid:\n  " + errors.join("\n  "));
  return spec;
}

// Repo-relative path with forward slashes, for logs (never an absolute local path).
export function rel(p) {
  return path.relative(ROOT, path.resolve(p)).split(path.sep).join("/");
}

const isInt = (v) => Number.isInteger(v);
const isLimit = (v) => v === null || (typeof v === "number" && v >= 0);

export function validateSpec(spec) {
  const e = [];
  if (!Array.isArray(spec?.layers) || !spec.layers.length) return ["layers must be a non-empty array"];
  if (!isInt(spec.regionRule?.marginPercentOfScreenWidth) || spec.regionRule.marginPercentOfScreenWidth < 0) e.push("regionRule.marginPercentOfScreenWidth must be a non-negative integer");
  for (const k of REGION_KINDS) if (k !== "glow" && typeof spec.regionRule?.[k] !== "string") e.push(`regionRule.${k} must describe the rule`);
  for (const k of REGION_KINDS) if (typeof spec.pivotRule?.[k] !== "string") e.push(`pivotRule.${k} must describe the rule`);
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
    if (!REGION_KINDS.includes(l.regionFrom)) e.push(`${at} unknown regionFrom ${l.regionFrom}`);
    if ("region" in l || "pivot" in l) e.push(`${at} region and pivot are measured into art/regions.json, not typed here`);
    if (l.parent !== null && !ids.has(l.parent)) e.push(`${at} unknown parent ${l.parent}`);
    if (!raws.has(l.source)) e.push(`${at} source ${l.source} is not in raws`);
    if (!["silhouette", "glow", "feature"].includes(l.extract)) e.push(`${at} unknown extract ${l.extract}`);
  }
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
    if (m.regionFrom !== "mouth") e.push(`layer ${m.id}: mouths take the mouth region`);
  }
  const P = spec.processing || {};
  if (!raws.has(P.master)) e.push("processing.master must be one of raws");
  if (!raws.has(P.base)) e.push("processing.base must be one of raws");
  if (spec.raws?.[0]?.file !== P.master) e.push("the master must be the first raw");
  for (const k of ["silhouetteThreshold", "glowFloor", "featureLo", "featureHi", "searchRadiusPx", "searchStridePx"]) {
    if (!isInt(P[k]) || P[k] < 0) e.push(`processing.${k} must be a non-negative integer`);
  }
  if (P.featureHi <= P.featureLo) e.push("processing.featureHi must be above featureLo");
  if (!(P.glowFloor < 255)) e.push("processing.glowFloor must be below 255");
  const C = spec.checks || {};
  for (const k of ["maxOffsetPx", "maxDrift", "maxScaleDeltaPx"]) if (!(k in C) || !isLimit(C[k])) e.push(`checks.${k} must be null (not set yet) or a non-negative number`);
  for (const r of spec.raws || []) {
    if (!/^\d\d-[a-z0-9_]+\.png$/.test(r.file)) e.push(`raw ${r.file}: name must look like 01-name.png`);
    if (!/^G\d+$/.test(r.prompt)) e.push(`raw ${r.file}: prompt must be a generator prompt id like G1`);
    for (const c of r.changes || []) if (!ids.has(c)) e.push(`raw ${r.file}: changes names unknown layer ${c}`);
    if (r.file !== P.master && !(r.changes || []).length) e.push(`raw ${r.file}: a variant must name the layers it changes`);
  }
  return e;
}

// The spec with each layer's measured region and pivot, and the canvas, from art/regions.json.
export function withRegions(spec, regions) {
  return {
    ...spec,
    canvas: regions.canvas,
    layers: spec.layers.map((l) => ({ ...l, region: regions.layers[l.id].region, pivot: regions.layers[l.id].pivot })),
  };
}

export function layer(spec, id) {
  return spec.layers.find((l) => l.id === id);
}

// Rects of the features a raw image is meant to change (excluded when measuring drift).
export function changedRects(layout, raw) {
  return (raw.changes || []).map((id) => layer(layout, id).region);
}

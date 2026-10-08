// Part D, stage 2 on provisional sources: the approved master (art/raw/01-master.png) plus one attempt per other
// prompt, before the author has chosen between attempts. Nothing is promoted to art/raw/: the chosen attempts are
// copied unmodified into out/stage2/raw/ under the names the pipeline expects. Everything except art/regions.json
// stays in out/ (never committed).
//
//   npm run stage2 -- regions G2-01     measure art/regions.json on the master with G2-01 as the provisional head,
//                                       and draw out/master-review.png (freeze with npm run regions -- --freeze)
//   npm run stage2 -- remeasure G2-02 --label "..."  new rules: old boxes to history, measure again, unfrozen
//   npm run stage2 -- compare-regions G2-02  measure regions again with G2-02 as the base, in memory, and compare
//   npm run stage2 -- calibrate G2-01 G3-01 G4-01 G5-01 G6-01 G7-01 G8-01
//                                       process, check:layers (calibration), contact sheet, full-size composites
import fs from "node:fs";
import path from "node:path";
import { checkLayers, formatTable, guardDirs, limitsLine, processAll } from "../lib/pipeline.mjs";
import { flattenOnBlack } from "../lib/image.mjs";
import { readPng, sha256, writePng } from "../lib/png.mjs";
import { deriveRegions } from "../lib/regions.mjs";
import { ROOT, loadSpec, rel } from "../lib/spec.mjs";
import { buildSheet, writeComposites } from "./contact-sheet.mjs";
import { buildReview } from "./master-review.mjs";
import { measureRegions } from "./regions.mjs";

const [mode, ...ids] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const spec = loadSpec();
const OUT = path.join(ROOT, "out", "stage2");
const RAW = path.join(OUT, "raw");
const REGIONS = path.join(ROOT, "art", "regions.json");
const fail = (m) => { console.error(m); process.exit(1); };

// attempt id → the raw file name its prompt fills, from art/layers.json raws.
function place(idsList) {
  fs.rmSync(RAW, { recursive: true, force: true });
  fs.mkdirSync(RAW, { recursive: true });
  const master = spec.processing.master;
  fs.copyFileSync(path.join(ROOT, "art", "raw", master), path.join(RAW, master));
  console.log(`art/raw/${master} → ${rel(path.join(RAW, master))}`);
  for (const id of idsList) {
    const prompt = id.split("-")[0];
    const r = spec.raws.find((x) => x.prompt === prompt);
    if (!r || r.file === master) fail(`${id}: no raw file for ${prompt}`);
    const from = path.join(ROOT, "art", "raw", "attempts", `${id}.png`), to = path.join(RAW, r.file);
    if (!fs.existsSync(from)) fail(`${rel(from)} does not exist`);
    fs.copyFileSync(from, to);
    const a = sha256(fs.readFileSync(from)), b = sha256(fs.readFileSync(to));
    if (a !== b) fail(`copy of ${id} differs`);
    console.log(`${rel(from)} → ${rel(to)}  sha256 ${b}`);
  }
}

if (mode === "regions") {
  if (ids.length !== 1 || !ids[0].startsWith("G2-")) fail("usage: npm run stage2 -- regions G2-<nn>");
  place(ids);
  let regions;
  try {
    regions = measureRegions(spec, RAW, REGIONS);
  } catch (e) {
    console.log(`regions: ${e.message}`);
    process.exit(1);
  }
  console.log(`\n${rel(REGIONS)}: canvas ${regions.canvas.width}x${regions.canvas.height}, margin ${regions.margin}, screen ${regions.measured.screen.join(",")}, inside ${regions.measured.interior.join(",")}, ${spec.processing.base} offset ${regions.baseOffset.dx},${regions.baseOffset.dy}, frozen ${regions.frozen}`);
  console.log(`measured boxes: cursor ${regions.measured.cursor.join(",")}, eyes ${regions.measured.eyes.join(",")}, mouth ${regions.measured.mouth.join(",")}`);
  regions.measured.blobs.forEach((b, i) => console.log(`  blob ${i + 1}: box ${b.box.join(",")}  ${b.pixels} px, diff max ${b.diffMax}, ${b.pixelsOverFeatureHi} px > featureHi${b.pixels >= regions.margin * regions.margin ? "" : "  (ignored, under margin^2)"}`));
  for (const [id, x] of Object.entries(regions.layers)) console.log(`  ${id.padEnd(12)} region ${x.region.join(",").padEnd(20)} pivot ${x.pivot.join(",")}`);
  const review = buildReview(spec, RAW, REGIONS, path.join(ROOT, "out", "master-review.png"), false);
  console.log(`\nout/master-review.png  ${review.width}x${review.height}  sha256 ${review.sha256}`);
} else if (mode === "compare-regions") {
  // Measures the regions again with another G2 attempt as the base, in memory only, and compares every box and
  // pivot with the frozen art/regions.json.
  if (ids.length !== 1 || !ids[0].startsWith("G2-")) fail("usage: npm run stage2 -- compare-regions G2-<nn>");
  place(ids);
  const frozen = JSON.parse(fs.readFileSync(REGIONS, "utf8"));
  const master = flattenOnBlack(readPng(path.join(RAW, spec.processing.master)).img).img;
  const base = flattenOnBlack(readPng(path.join(RAW, spec.processing.base)).img).img;
  let fresh;
  try { fresh = deriveRegions(spec, master, base); } catch (e) { console.log(`regions with ${ids[0]}: ${e.message}`); process.exit(1); }
  const rows = [["margin", frozen.margin, fresh.margin]];
  for (const k of ["screen", "interior", "cursor", "eyes", "mouth"]) rows.push([`measured.${k}`, frozen.measured[k], fresh.measured[k]]);
  for (const id of Object.keys(frozen.layers)) {
    rows.push([`${id}.region`, frozen.layers[id].region, fresh.layers[id].region]);
    rows.push([`${id}.pivot`, frozen.layers[id].pivot, fresh.layers[id].pivot]);
  }
  let same = 0;
  for (const [k, a, b] of rows) {
    const eq = JSON.stringify(a) === JSON.stringify(b);
    if (eq) same++;
    console.log(`${eq ? "same" : "DIFF"}  ${k.padEnd(20)} frozen ${JSON.stringify(a)}  ${ids[0]} ${JSON.stringify(b)}`);
  }
  console.log(`${same} of ${rows.length} identical; ${ids[0]} offset ${fresh.baseOffset.dx},${fresh.baseOffset.dy}`);
  if (same !== rows.length) process.exitCode = 1;
  else if (process.argv.includes("--record")) {
    // Only the base changes; every region and pivot stays as frozen.
    const prev = frozen.base;
    frozen.baseHistory = [...(frozen.baseHistory || []), { ...prev, replacedBy: ids[0], check: `npm run stage2 -- compare-regions ${ids[0]}: ${same} of ${rows.length} boxes and pivots identical` }];
    frozen.base = { file: spec.processing.base, sha256: sha256(fs.readFileSync(path.join(RAW, spec.processing.base))), fromAttempt: ids[0] };
    frozen.baseOffset = fresh.baseOffset;
    fs.writeFileSync(REGIONS, JSON.stringify(frozen, null, 2) + "\n");
    console.log(`${rel(REGIONS)}: base is now ${ids[0]} (sha256 ${frozen.base.sha256}); regions and pivots unchanged`);
  }
} else if (mode === "remeasure") {
  // After a region rule change the author approved: the frozen boxes move to history, the regions are measured
  // again on the same master and base, and the file is written unfrozen (freeze with npm run regions -- --freeze).
  const label = (() => { const i = process.argv.indexOf("--label"); return i >= 0 ? process.argv[i + 1] : null; })();
  if (ids.length < 1 || !ids[0].startsWith("G2-") || !label) fail('usage: npm run stage2 -- remeasure G2-<nn> --label "<why>"');
  place([ids[0]]);
  const old = JSON.parse(fs.readFileSync(REGIONS, "utf8"));
  const baseSha = sha256(fs.readFileSync(path.join(RAW, spec.processing.base)));
  if (old.base.sha256 !== baseSha) fail(`${ids[0]} is not the recorded base (${old.base.fromAttempt || old.base.sha256})`);
  const master = flattenOnBlack(readPng(path.join(RAW, spec.processing.master)).img).img;
  const base = flattenOnBlack(readPng(path.join(RAW, spec.processing.base)).img).img;
  let fresh;
  try { fresh = deriveRegions(spec, master, base); } catch (e) { console.log(`regions: ${e.message}`); process.exit(1); }
  const next = {
    $comment: old.$comment, frozen: false, master: old.master, base: old.base,
    ...(old.baseHistory ? { baseHistory: old.baseHistory } : {}),
    history: [...(old.history || []), { replacedBecause: label, margin: old.margin, measured: old.measured, layers: old.layers }],
    ...fresh,
  };
  fs.writeFileSync(REGIONS, JSON.stringify(next, null, 2) + "\n");
  for (const id of Object.keys(fresh.layers)) {
    const a = old.layers[id].region, b = fresh.layers[id].region;
    console.log(`${JSON.stringify(a) === JSON.stringify(b) ? "same" : "NEW "}  ${id.padEnd(12)} old ${a.join(",").padEnd(20)} new ${b.join(",").padEnd(20)} pivot ${fresh.layers[id].pivot.join(",")}`);
  }
  console.log(`${rel(REGIONS)} written, not frozen; old boxes in history`);
} else if (mode === "calibrate") {
  if (!ids.length) fail("usage: npm run stage2 -- calibrate <attempt ids>");
  place(ids);
  const layersDir = path.join(OUT, "layers");
  guardDirs([layersDir], false);
  const log = processAll(spec, RAW, layersDir, REGIONS);
  fs.writeFileSync(path.join(OUT, "process-log.json"), JSON.stringify(log, null, 2) + "\n");
  for (const r of log.raws) {
    const extra = r.offset ? `offset ${r.offset.dx},${r.offset.dy}  drift ${r.drift.mean} (${r.drift.sum}/${r.drift.samples})` : "master";
    console.log(`${r.file}  ${r.steps.map((s) => s.op).join(" → ")}  ${extra}`);
  }
  const res = checkLayers(spec, RAW, layersDir, REGIONS);
  console.log("\n" + formatTable(res));
  console.log(limitsLine(res.limits));
  console.log(`regions: ${res.regionsFrozen ? "frozen" : "NOT frozen"}`);
  const cur = res.rows.find((r) => r.id === "cursor");
  console.log(`cursor layer: alpha box ${cur.bbox ? [cur.bbox.x, cur.bbox.y, cur.bbox.w, cur.bbox.h].join(",") : "-"}, non-red pixels ${cur.nonRed}`);
  console.log(`mouth anchors (smile top ${res.anchors.smileTop}; inside of the screen ${res.insideBox.join(",")}, bottom row ${res.insideBox[1] + res.insideBox[3] - 1}):`);
  for (const r of res.rows.filter((x) => x.anchor)) console.log(`  ${r.id.padEnd(12)} top edge ${r.anchor.topEdge}  anchorDy ${r.anchor.anchorDy}  moved lowest row ${r.anchor.movedLowestRow} (inside bottom ${r.anchor.insideBottomRow})  moved pixels outside the screen ${r.anchor.movedPixelsOutsideScreen}`);
  console.log(res.ok ? "no pass/fail check failed" : "SOME LAYERS FAIL");
  for (const c of writeComposites(spec, layersDir, path.join(OUT, "composites"), false)) console.log(`${c.file}  ${c.width}x${c.height}  ${c.layers.join(" + ")}${Object.keys(c.moved).length ? `  moved ${JSON.stringify(c.moved)}` : ""}`);
  const sheet = buildSheet(spec, layersDir, false);
  const w = writePng(path.join(OUT, "contact-sheet.png"), sheet);
  console.log(`out/stage2/contact-sheet.png  ${sheet.width}x${sheet.height}  sha256 ${w.sha256}`);
  if (!res.ok) process.exitCode = 1;
} else fail("usage: npm run stage2 -- regions G2-<nn> | calibrate <attempt ids>");

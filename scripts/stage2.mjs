// Part D, stage 2 on provisional sources: the approved master (art/raw/01-master.png) plus one attempt per other
// prompt, before the author has chosen between attempts. Nothing is promoted to art/raw/: the chosen attempts are
// copied unmodified into out/stage2/raw/ under the names the pipeline expects. Everything except art/regions.json
// stays in out/ (never committed).
//
//   npm run stage2 -- regions G2-01     measure art/regions.json on the master with G2-01 as the provisional head,
//                                       and draw out/master-review.png (freeze with npm run regions -- --freeze)
//   npm run stage2 -- calibrate G2-01 G3-01 G4-01 G5-01 G6-01 G7-01 G8-01
//                                       process, check:layers (calibration), contact sheet, full-size composites
import fs from "node:fs";
import path from "node:path";
import { checkLayers, formatTable, guardDirs, limitsLine, processAll } from "../lib/pipeline.mjs";
import { sha256, writePng } from "../lib/png.mjs";
import { ROOT, loadSpec, rel } from "../lib/spec.mjs";
import { buildSheet, writeComposites } from "./contact-sheet.mjs";
import { buildReview } from "./master-review.mjs";
import { measureRegions } from "./regions.mjs";

const [mode, ...ids] = process.argv.slice(2);
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
  console.log(res.ok ? "no pass/fail check failed" : "SOME LAYERS FAIL");
  for (const c of writeComposites(spec, layersDir, path.join(OUT, "composites"), false)) console.log(`${c.file}  ${c.width}x${c.height}  ${c.layers.join(" + ")}`);
  const sheet = buildSheet(spec, layersDir, false);
  const w = writePng(path.join(OUT, "contact-sheet.png"), sheet);
  console.log(`out/stage2/contact-sheet.png  ${sheet.width}x${sheet.height}  sha256 ${w.sha256}`);
  if (!res.ok) process.exitCode = 1;
} else fail("usage: npm run stage2 -- regions G2-<nn> | calibrate <attempt ids>");

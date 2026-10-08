// Part D, stage 1 review on two attempts, before the author has chosen a master. Nothing goes into art/raw/:
// the attempts are copied unmodified into out/stage1/raw/ under the names the pipeline expects, and everything this
// writes stays in out/ (never committed). Regions are measured but not frozen.
//
//   npm run stage1 -- art/raw/attempts/G1-01.png art/raw/attempts/G2-01.png
import fs from "node:fs";
import path from "node:path";
import { drawText } from "../lib/font.mjs";
import { fillRect, flattenOnBlack } from "../lib/image.mjs";
import { checkLayers, formatTable, limitsLine, processAll } from "../lib/pipeline.mjs";
import { readPng, sha256, writePng } from "../lib/png.mjs";
import { ROOT, loadSpec, rel } from "../lib/spec.mjs";
import { buildReview } from "./master-review.mjs";
import { measureRegions } from "./regions.mjs";

const [masterArg, baseArg] = process.argv.slice(2);
if (!masterArg || !baseArg || ![masterArg, baseArg].every((a) => a.startsWith("art/raw/attempts/"))) {
  console.error("usage: npm run stage1 -- art/raw/attempts/<G1 attempt> art/raw/attempts/<G2 attempt>");
  process.exit(1);
}
const spec = loadSpec();
const out = path.join(ROOT, "out", "stage1");
const raw = path.join(out, "raw");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(raw, { recursive: true });
for (const [src, name] of [[masterArg, spec.processing.master], [baseArg, spec.processing.base]]) {
  const from = path.join(ROOT, src), to = path.join(raw, name);
  fs.copyFileSync(from, to);
  const a = sha256(fs.readFileSync(from)), b = sha256(fs.readFileSync(to));
  if (a !== b) throw new Error(`copy of ${src} differs`);
  console.log(`${src} → ${rel(to)}  sha256 ${b}`);
}
try {
  const regions = measureRegions(spec, raw, path.join(out, "regions.json"));
  console.log(`\n${rel(path.join(out, "regions.json"))}: canvas ${regions.canvas.width}x${regions.canvas.height}, margin ${regions.margin}, screen ${regions.measured.screen.join(",")}, ${spec.processing.base} offset ${regions.baseOffset.dx},${regions.baseOffset.dy}, frozen ${regions.frozen}`);
  for (const [id, x] of Object.entries(regions.layers)) console.log(`  ${id.padEnd(12)} region ${x.region.join(",").padEnd(20)} pivot ${x.pivot.join(",")}`);
} catch (e) {
  console.log(`\nregions: ${e.message}`);
  if (e.details) {
    // Diagnostic view: the master with every pixel that differs from the empty screen in magenta, and every blob's
    // box with its number. A view only, in out/.
    const d = e.details, img = flattenOnBlack(readPng(path.join(raw, spec.processing.master)).img).img;
    for (let p = 0; p < d.core.length; p++) if (d.core[p]) img.data.set([255, 0, 220, 255], p * 4);
    d.blobs.forEach((b, i) => {
      const [x, y, w, h] = b.box, c = b.pixels >= d.margin * d.margin ? [255, 255, 0, 255] : [120, 120, 120, 255];
      fillRect(img, x, y, w, 3, c); fillRect(img, x, y + h - 3, w, 3, c); fillRect(img, x, y, 3, h, c); fillRect(img, x + w - 3, y, 3, h, c);
      drawText(img, `${i + 1}`, x + 6, y + 6, 4, c);
    });
    const file = path.join(ROOT, "out", "stage1", "blobs.png");
    writePng(file, img);
    console.log(`${spec.processing.base} offset ${d.baseOffset.dx},${d.baseOffset.dy}; margin ${d.margin}; screen ${d.screen.join(",")}; blobs kept (>= margin^2 px): ${d.kept.length} of ${d.blobs.length}`);
    d.blobs.forEach((b, i) => console.log(`  blob ${i + 1}: box ${b.box.join(",")}  ${b.pixels} px differing (largest channel > featureLo ${spec.processing.featureLo}), ${b.redPixels} red; diff max ${b.diffMax}, mean ${b.diffSum / b.pixels} (${b.diffSum}/${b.pixels}), ${b.pixelsOverFeatureHi} px > featureHi ${spec.processing.featureHi}${b.pixels >= d.margin * d.margin ? "" : "  (ignored, under margin^2)"}`));
    console.log(`${rel(file)}: differing pixels in magenta, blob boxes numbered (yellow = kept, grey = ignored)`);
  }
  process.exit(1);
}
const log = processAll(spec, raw, path.join(out, "layers"), path.join(out, "regions.json"), { partial: true });
fs.writeFileSync(path.join(out, "process-log.json"), JSON.stringify(log, null, 2) + "\n");
console.log(`\n${rel(path.join(out, "layers"))}: ${log.layers.map((l) => l.id).join(", ")}; waiting: ${(log.waiting || []).join(", ")}`);
const res = checkLayers(spec, raw, path.join(out, "layers"), path.join(out, "regions.json"), { partial: true });
console.log("\n" + formatTable(res));
console.log(limitsLine(res.limits));
console.log(res.ok ? "no pass/fail check failed" : "SOME LAYERS FAIL");
const review = buildReview(spec, raw, path.join(out, "regions.json"), path.join(ROOT, "out", "master-review.png"), false);
console.log(`\nout/master-review.png  ${review.width}x${review.height}  sha256 ${review.sha256}`);
if (!res.ok) process.exitCode = 1;

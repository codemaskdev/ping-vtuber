// Prints the layer table: canvas, alpha bounding box, region check, corner alpha, and each variant's offset and
// colour drift from the master outside the feature it changes. Exit code 1 if any row fails.
//
//   npm run check:layers                 real art
//   npm run check:layers -- --fixtures   test fixtures
import { paths } from "../lib/cli.mjs";
import { checkLayers, formatTable } from "../lib/pipeline.mjs";
import { loadSpec } from "../lib/spec.mjs";

const p = paths();
try {
  const res = checkLayers(loadSpec(), p.raw, p.layers, { fixtures: p.fixtures });
  console.log(formatTable(res));
  console.log(`limits (chosen, art/layers.json checks): offset <= ${res.limits.maxOffsetPx} px, drift <= ${res.limits.maxDrift}`);
  console.log(res.ok ? "all layers ok" : "SOME LAYERS FAIL");
  if (!res.ok) process.exitCode = 1;
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

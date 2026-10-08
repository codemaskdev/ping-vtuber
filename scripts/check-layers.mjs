// Prints the layer table: canvas, alpha bounding box, region check, corner alpha, and each variant's offset, colour
// drift from the master outside the feature it changes, and screen size next to the master's. Exit code 1 if a
// pass/fail check fails; offset, drift and screen size are only measured until their limits are set.
//
//   npm run check:layers                 real art
//   npm run check:layers -- --fixtures   test fixtures
import { paths } from "../lib/cli.mjs";
import { checkLayers, formatTable, limitsLine } from "../lib/pipeline.mjs";
import { loadSpec } from "../lib/spec.mjs";

const p = paths();
try {
  const res = checkLayers(loadSpec(), p.raw, p.layers, p.regions, { fixtures: p.fixtures });
  console.log(formatTable(res));
  console.log(limitsLine(res.limits));
  console.log(`regions: ${res.regionsFrozen ? "frozen" : "NOT frozen (master not approved yet)"}`);
  console.log(res.ok ? "no pass/fail check failed" : "SOME LAYERS FAIL");
  if (!res.ok) process.exitCode = 1;
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

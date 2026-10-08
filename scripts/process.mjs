// art/raw/ → art/layers/: every layer as a transparent PNG on the full canvas, plus art/process-log.json.
//
//   npm run process                 real art
//   npm run process -- --fixtures   test fixtures (test/fixtures/raw → test/fixtures/build)
import fs from "node:fs";
import { paths } from "../lib/cli.mjs";
import { processAll } from "../lib/pipeline.mjs";
import { loadSpec, rel } from "../lib/spec.mjs";

const p = paths();
try {
  const log = processAll(loadSpec(), p.raw, p.layers, p.regions, { fixtures: p.fixtures });
  fs.writeFileSync(p.log, JSON.stringify(log, null, 2) + "\n");
  for (const r of log.raws) {
    const extra = r.offset ? `offset ${r.offset.dx},${r.offset.dy}  drift ${r.drift.mean} (${r.drift.sum}/${r.drift.samples})` : "master";
    console.log(`${r.file}  ${r.steps.map((s) => s.op).join(" → ")}  ${extra}`);
  }
  for (const l of log.layers) console.log(`${l.file}  ${l.bytes} bytes  sha256 ${l.sha256}`);
  console.log(`log: ${rel(p.log)}`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

// art/regions.json: the canvas, every layer's region and pivot, measured on the master with the rules in
// art/layers.json (regionRule, pivotRule). The empty-screen image (02-head.png) is used only to tell the face from
// the screen. Once the author approves the master the file is frozen and this script will not rewrite it.
//
//   npm run regions                  measure (refuses if art/regions.json is frozen)
//   npm run regions -- --freeze      mark the existing file frozen (after the author approved the master)
//   add --fixtures to work on test/fixtures/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { paths } from "../lib/cli.mjs";
import { flattenOnBlack } from "../lib/image.mjs";
import { guardDirs } from "../lib/pipeline.mjs";
import { readPng } from "../lib/png.mjs";
import { deriveRegions } from "../lib/regions.mjs";
import { loadSpec, rel } from "../lib/spec.mjs";

export function measureRegions(spec, rawDir, regionsFile, { fixtures = false } = {}) {
  guardDirs([rawDir, regionsFile], fixtures);
  if (fs.existsSync(regionsFile) && JSON.parse(fs.readFileSync(regionsFile, "utf8")).frozen === true) {
    throw new Error(`${rel(regionsFile)} is frozen: the master was approved. A variant that does not fit is a failed generation.`);
  }
  const P = spec.processing;
  const read = (f) => {
    const file = path.join(rawDir, f);
    if (!fs.existsSync(file)) throw new Error(`missing ${rel(file)}`);
    const r = readPng(file);
    if (r.fixture !== fixtures) throw new Error(`${rel(file)}: ${r.fixture ? "a TEST FIXTURE is not character art" : "fixture mode only reads fixtures"}`);
    return { ...r, img: flattenOnBlack(r.img).img };
  };
  const master = read(P.master), base = read(P.base);
  const derived = deriveRegions(spec, master.img, base.img);
  const out = {
    $comment: "Written by scripts/regions.mjs from the master, with the rules in art/layers.json. Do not edit by hand. frozen: true once the author approved the master; after that the regions do not change.",
    frozen: false,
    master: { file: P.master, sha256: master.sha256 },
    base: { file: P.base, sha256: base.sha256 },
    ...derived,
  };
  fs.mkdirSync(path.dirname(regionsFile), { recursive: true });
  fs.writeFileSync(regionsFile, JSON.stringify(out, null, 2) + "\n");
  return out;
}

export function freezeRegions(spec, rawDir, regionsFile, { fixtures = false } = {}) {
  guardDirs([rawDir, regionsFile], fixtures);
  if (!fs.existsSync(regionsFile)) throw new Error(`${rel(regionsFile)} does not exist`);
  const r = JSON.parse(fs.readFileSync(regionsFile, "utf8"));
  const now = readPng(path.join(rawDir, spec.processing.master)).sha256;
  if (r.master.sha256 !== now) throw new Error(`${rel(regionsFile)} was measured on another master`);
  r.frozen = true;
  fs.writeFileSync(regionsFile, JSON.stringify(r, null, 2) + "\n");
  return r;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const p = paths();
  try {
    const spec = loadSpec();
    if (process.argv.includes("--freeze")) {
      freezeRegions(spec, p.raw, p.regions, { fixtures: p.fixtures });
      console.log(`${rel(p.regions)} frozen`);
    } else {
      const r = measureRegions(spec, p.raw, p.regions, { fixtures: p.fixtures });
      console.log(`${rel(p.regions)}: canvas ${r.canvas.width}x${r.canvas.height}, margin ${r.margin}, screen ${r.measured.screen.join(",")}, ${r.base.file} offset ${r.baseOffset.dx},${r.baseOffset.dy}`);
      for (const [id, x] of Object.entries(r.layers)) console.log(`  ${id.padEnd(12)} region ${x.region.join(",").padEnd(20)} pivot ${x.pivot.join(",")}`);
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

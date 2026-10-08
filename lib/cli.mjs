// Paths shared by the scripts: real art, or the fixtures with --fixtures.
import path from "node:path";
import { ROOT } from "./spec.mjs";

export function paths(argv = process.argv.slice(2)) {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) {
    console.error(`Node ${process.versions.node} is too old: use Node 22 or newer (.nvmrc pins 24.15.0).`);
    process.exit(1);
  }
  const fixtures = argv.includes("--fixtures");
  const base = fixtures ? path.join(ROOT, "test", "fixtures") : null;
  return fixtures
    ? {
        fixtures,
        raw: path.join(base, "raw"),
        layers: path.join(base, "build", "layers"),
        log: path.join(base, "build", "process-log.json"),
        regions: path.join(base, "build", "regions.json"),
        sheet: path.join(base, "build", "contact-sheet.png"),
        composites: path.join(base, "build", "composites"),
        review: path.join(base, "build", "master-review.png"),
      }
    : {
        fixtures,
        raw: path.join(ROOT, "art", "raw"),
        layers: path.join(ROOT, "art", "layers"),
        log: path.join(ROOT, "art", "process-log.json"),
        regions: path.join(ROOT, "art", "regions.json"),
        sheet: path.join(ROOT, "out", "contact-sheet.png"),
        composites: path.join(ROOT, "out", "composites"),
        review: path.join(ROOT, "out", "master-review.png"),
      };
}

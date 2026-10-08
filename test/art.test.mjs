// Checks on the real art. Most are skipped until the generator images are in art/raw/.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { processAll } from "../lib/pipeline.mjs";
import { sha256 } from "../lib/png.mjs";
import { ROOT, loadSpec } from "../lib/spec.mjs";

const spec = loadSpec();
const art = (...a) => path.join(ROOT, "art", ...a);
const has = (f) => fs.existsSync(f);
const allRaws = spec.raws.every((r) => has(art("raw", r.file)));
const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);

// The author gave these prefixes for the reference files.
const REFERENCE = { "logo-5A.svg": "0647760785308e9f", "logo-5A.png": "05bb7b746c89d52a" };

test("reference logos are the files the author named", () => {
  for (const [f, prefix] of Object.entries(REFERENCE)) {
    const file = art("reference", f);
    if (!has(file)) { assert.equal(f, "logo-5A.png", `${f} is missing`); continue; }
    assert.ok(sha256(fs.readFileSync(file)).startsWith(prefix), `${f} sha256 does not start with ${prefix}`);
  }
});

test("no raw file or attempt is committed before its metadata was shown and approved", () => {
  const g = JSON.parse(fs.readFileSync(art("generations.json"), "utf8"));
  for (const f of tracked.filter((t) => t.startsWith("art/raw/") && !t.endsWith(".gitkeep"))) {
    const rec = f.startsWith("art/raw/attempts/") ? g.attempts?.[path.basename(f).replace(/\.[a-z]+$/, "")] : g.images?.[path.basename(f)];
    assert.equal(rec?.metadataApproved, true, `${f} is committed without metadataApproved`);
  }
});

test("reprocessing art/raw gives the same bytes as the committed art/layers", { skip: !allRaws || !has(art("regions.json")) ? "art/raw or art/regions.json not there yet" : false }, () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "ping-layers-"));
  try {
    const log = processAll(spec, art("raw"), out, art("regions.json"));
    for (const l of spec.layers) {
      assert.ok(tracked.includes(`art/layers/${l.file}`), `art/layers/${l.file} is not committed`);
      assert.ok(fs.readFileSync(path.join(out, l.file)).equals(fs.readFileSync(art("layers", l.file))), `${l.file} differs`);
    }
    const committed = JSON.parse(fs.readFileSync(art("process-log.json"), "utf8"));
    const strip = (x) => JSON.stringify({ ...x, layers: x.layers.map((l) => ({ ...l, file: path.basename(l.file) })) });
    assert.equal(strip(log), strip(committed));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

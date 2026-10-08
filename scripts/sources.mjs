// art/SOURCES.json: sha256 of every reference, raw and processed file, with generator, version, date and the exact
// prompt for each generator image. Generator details come from art/generations.json (filled in from the author's
// report of what the generator UI showed).
//
//   npm run sources
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generatorPrompts } from "../lib/prompts.mjs";
import { readPng, sha256 } from "../lib/png.mjs";
import { ROOT, loadSpec } from "../lib/spec.mjs";

const art = (...a) => path.join(ROOT, "art", ...a);
const list = (dir, re) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)).sort() : []);
const fileEntry = (dir, f) => {
  const buf = fs.readFileSync(path.join(dir, f));
  return { buf, entry: { file: path.relative(ROOT, path.join(dir, f)).split(path.sep).join("/"), sha256: sha256(buf), bytes: buf.length } };
};

export function buildSources() {
  const spec = loadSpec();
  const gens = JSON.parse(fs.readFileSync(art("generations.json"), "utf8")).images || {};
  const prompts = new Map(generatorPrompts().map((p) => [p.id, p]));
  const errors = [];

  const reference = list(art("reference"), /\.(png|jpe?g|webp|svg)$/i).map((f) => fileEntry(art("reference"), f).entry);

  const raw = list(art("raw"), /\.png$/i).map((f) => {
    const { entry } = fileEntry(art("raw"), f);
    if (readPng(art("raw", f)).fixture) errors.push(`art/raw/${f} is a TEST FIXTURE`);
    const specRaw = spec.raws.find((r) => r.file === f);
    if (!specRaw) errors.push(`art/raw/${f} is not listed in art/layers.json raws`);
    const g = gens[f];
    if (!g) { errors.push(`art/raw/${f} has no entry in art/generations.json`); return entry; }
    for (const k of ["generator", "version", "date", "prompt"]) if (!g[k]) errors.push(`art/generations.json ${f}: ${k} is empty`);
    if (specRaw && g.prompt !== specRaw.prompt) errors.push(`art/generations.json ${f}: prompt ${g.prompt}, layers.json says ${specRaw.prompt}`);
    const p = prompts.get(g.prompt);
    if (!p) errors.push(`art/generations.json ${f}: unknown prompt ${g.prompt}`);
    return { ...entry, generator: g.generator, version: g.version, date: g.date, prompt: g.prompt, promptText: p ? p.text : null, ...(g.note ? { note: g.note } : {}) };
  });

  const P = spec.processing;
  const layers = list(art("layers"), /\.png$/i).map((f) => {
    const { entry } = fileEntry(art("layers"), f);
    if (readPng(art("layers", f)).fixture) errors.push(`art/layers/${f} is a TEST FIXTURE`);
    const l = spec.layers.find((x) => x.file === f);
    if (!l) { errors.push(`art/layers/${f} is not in art/layers.json`); return entry; }
    const from = [...new Set([l.source, P.base, ...(l.source === P.master ? [] : [P.master])])];
    return { ...entry, layer: l.id, from: from.map((r) => ({ file: `art/raw/${r}`, prompt: spec.raws.find((x) => x.file === r).prompt })) };
  });

  const log = art("process-log.json");
  const processLog = fs.existsSync(log) ? fileEntry(art(), "process-log.json").entry : null;
  return {
    sources: {
      $comment: "Written by scripts/sources.mjs. Do not edit by hand. Prompt texts are copied from art/GENERATOR_PROMPTS.md.",
      reference,
      raw,
      layers,
      processLog,
    },
    errors,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { sources, errors } = buildSources();
  if (errors.length) {
    console.error("art/SOURCES.json not written:\n  " + errors.join("\n  "));
    process.exit(1);
  }
  fs.writeFileSync(art("SOURCES.json"), JSON.stringify(sources, null, 2) + "\n");
  console.log(`art/SOURCES.json: ${sources.reference.length} reference, ${sources.raw.length} raw, ${sources.layers.length} layers`);
}

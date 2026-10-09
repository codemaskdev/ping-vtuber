// The freeze (author's prompt #17): after it, the v1 thresholds, the v2 rules, the filter chain and the voice
// settings do not change. rig/frozen.json holds the sha256 of each; test/freeze.test.mjs fails if one moves.
// The code that applies the rules (lib/lipsync-volume.mjs, lib/lipsync-text.mjs) is frozen with them. The measurement
// method (MEASUREMENT.md, measurement.json, lib/measure.mjs, scripts/measure.mjs) was added to the freeze in the commit
// that wrote it, before any held-out phrase existed. Lip sync v3 (rig/lipsync-v3.json, lib/lipsync-v3.mjs) was added in
// the commit that froze it (author's prompt #18): the last version for this episode, only bugs get fixed.
//
//   node scripts/freeze.mjs            compare with rig/frozen.json
//   node scripts/freeze.mjs --write    write rig/frozen.json (only when the author unfreezes)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "../lib/png.mjs";
import { ROOT } from "../lib/spec.mjs";

export const FROZEN_FILE = path.join(ROOT, "rig", "frozen.json");
const file = (f) => sha256(fs.readFileSync(path.join(ROOT, f)));

export function frozenState() {
  const V = JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "voice.json"), "utf8"));
  const voice = { chosen: V.chosen, modelId: V.modelId, settings: V.settings, outputFormat: V.outputFormat, seed: V.seed };
  const processing = { chain: V.processing.chain, gainRule: V.processing.gainRule, peakCeiling: V.processing.peakCeiling, encode: V.processing.encode };
  return {
    "rig/lipsync-volume.json (v1 thresholds)": file("rig/lipsync-volume.json"),
    "lib/lipsync-volume.mjs (v1)": file("lib/lipsync-volume.mjs"),
    "rig/lipsync-text.json (v2 rules)": file("rig/lipsync-text.json"),
    "lib/lipsync-text.mjs (v2)": file("lib/lipsync-text.mjs"),
    "audio/voice.json chosen, modelId, settings, outputFormat, seed (voice settings)": sha256(Buffer.from(JSON.stringify(voice))),
    "audio/voice.json processing chain, gainRule, peakCeiling, encode (filter chain)": sha256(Buffer.from(JSON.stringify(processing))),
    "MEASUREMENT.md (method)": file("MEASUREMENT.md"),
    "rig/lipsync-v3.json (v3 rules)": file("rig/lipsync-v3.json"),
    "lib/lipsync-v3.mjs (v3)": file("lib/lipsync-v3.mjs"),
    "measurement.json (method parameters)": file("measurement.json"),
    "lib/measure.mjs (method)": file("lib/measure.mjs"),
    "scripts/measure.mjs (method)": file("scripts/measure.mjs"),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const now = frozenState();
  if (process.argv.includes("--write")) {
    fs.writeFileSync(FROZEN_FILE, JSON.stringify({ $comment: "Written by scripts/freeze.mjs. Frozen by the author's prompt #17: these do not change after the commit that wrote this file.", frozenBy: "the author, prompt #17", sha256: now }, null, 2) + "\n");
    console.log("rig/frozen.json written");
  } else {
    const was = JSON.parse(fs.readFileSync(FROZEN_FILE, "utf8")).sha256;
    let ok = true;
    for (const [k, v] of Object.entries(now)) { const same = was[k] === v; ok &&= same; console.log(`${same ? "same   " : "CHANGED"} ${k}`); }
    process.exitCode = ok ? 0 : 1;
  }
}

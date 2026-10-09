// The voice pipeline (author's prompt #16): audio/raw/ untouched, audio/dev/ made from it by one script, repeatably,
// and disclosed.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { crossCorrelationLag, matchRmsGain, peak, rms, scaled } from "../lib/audio-dsp.mjs";
import { sha256 } from "../lib/png.mjs";
import { ROOT } from "../lib/spec.mjs";
import { processFile } from "../scripts/audio-process.mjs";
import { embeddedTags, encoderOnly } from "../scripts/audio-metadata.mjs";

const V = JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "voice.json"), "utf8"));
const S = JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "SOURCES.json"), "utf8"));
const LOG = JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "process-log.json"), "utf8"));
const noise = (n, seed) => { let x = seed >>> 0; return Float32Array.from({ length: n }, () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 2 ** 32 - 0.5; }); };

test("rms, peak and the RMS-matching gain, lowered at the ceiling", () => {
  const a = Float32Array.from([0.5, -0.5, 0.5, -0.5]), b = Float32Array.from([0.05, -0.05, 0.6, -0.05]);
  assert.equal(rms(a), 0.5);
  assert.equal(peak(b), Math.fround(0.6));
  const free = matchRmsGain(a, Float32Array.from([0.25, -0.25, 0.25, -0.25]), 0.95);
  assert.deepEqual([free.gain, free.limitedByCeiling], [2, false]);
  const capped = matchRmsGain(a, b, 0.95);
  assert.ok(capped.limitedByCeiling && peak(scaled(b, capped.gain)) <= 0.95 + 1e-7);
});

test("cross-correlation finds a known delay, in both directions", () => {
  const a = noise(4000, 7);
  for (const d of [0, 1, 37, -12]) {
    const b = new Float32Array(4000);
    for (let i = 0; i < 4000; i++) { const j = i - d; b[i] = j >= 0 && j < 4000 ? a[j] : 0; }
    assert.equal(crossCorrelationLag(a, b, 100).lag, d, `delay ${d}`);
  }
});

test("audio/raw/ is exactly what ElevenLabs returned; the alignment lives with it", () => {
  for (const f of [...S.files, ...S.heldOutFiles, ...(S.lineFiles || [])]) {
    assert.equal(sha256(fs.readFileSync(path.join(ROOT, f.file))), f.sha256, f.file);
    assert.match(f.alignment, /^audio\/raw\/([PH]\d|line-[a-z]+)\.align\.json$/);
  }
  assert.ok(!fs.readdirSync(path.join(ROOT, "audio", "dev")).some((f) => f.endsWith(".align.json")), "no alignment in audio/dev/");
});

test("every audio/dev/ file is disclosed: made from its raw file by the logged chain and gain", () => {
  const lines = (S.lineFiles || []).map((f) => path.basename(f.file, ".mp3")).sort();
  assert.deepEqual(S.processed.map((p) => p.file), [...Object.keys(V.phrases), ...Object.keys(V.heldOut), ...lines].map((p) => `audio/dev/${p}.mp3`));
  for (const p of S.processed) {
    const raw = [...S.files, ...S.heldOutFiles, ...(S.lineFiles || [])].find((f) => f.file === p.from);
    assert.equal(p.fromSha256, raw.sha256, p.file);
    assert.equal(sha256(fs.readFileSync(path.join(ROOT, p.file))), p.sha256, p.file);
    assert.equal(p.chain, V.processing.chain);
    const l = LOG.files.find((e) => e.output === p.file);
    for (const k of ["tool", "chain", "gain"]) assert.ok(l[k] !== undefined, `${p.file}: ${k}`);
    for (const k of ["raw", "result"]) assert.ok(l.rms[k] > 0, `${p.file}: rms.${k}`);
    assert.ok(l.peak.gained <= V.processing.peakCeiling, `${p.file}: peak before encode`);
    assert.equal((l.encode.match(/libmp3lame/g) || []).length, 1, "one encode");
    assert.match(l.encode, /-f f32le .* -i pipe:0/, "the encode starts from floats, not from an mp3");
  }
});

test("processing is repeatable: the same raw file gives the same bytes, and the committed ones", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ping-audio-"));
  try {
    const a = processFile(path.join(ROOT, "audio", "raw", "P1.mp3"), path.join(tmp, "a.mp3"));
    const b = processFile(path.join(ROOT, "audio", "raw", "P1.mp3"), path.join(tmp, "b.mp3"));
    assert.equal(a.outputSha256, b.outputSha256);
    assert.equal(a.outputSha256, S.processed.find((p) => p.file === "audio/dev/P1.mp3").sha256);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("committed audio shows the encoder tag only (the author's rule), in its metadata dump", () => {
  for (const f of V.metadataApproved) {
    const dump = fs.readFileSync(path.join(ROOT, f.replace(/\.mp3$/, ".metadata.txt")), "utf8");
    assert.ok(dump.includes(sha256(fs.readFileSync(path.join(ROOT, f)))), `${f}: the dump is of this file`);
    assert.match(dump, /--- encoder tag only: yes/, f);
  }
  assert.ok(encoderOnly(embeddedTags("[ID3v2_4]       EncoderSettings                 : Lavf62.12.101")));
  assert.ok(!encoderOnly(embeddedTags("[ID3v2_4]       EncoderSettings                 : Lavf62.12.101\n[ID3v2_4]       Title  : x")));
});

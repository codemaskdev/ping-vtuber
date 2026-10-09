// Ping's sound (author's prompt #16): what ElevenLabs returned (audio/raw/, untouched) → audio/dev/, the files every
// render uses. Per file, once: decode (ffmpeg → mono float), the filter chain (audio/voice.json processing.chain,
// float in, float out), one gain that brings the RMS back to the raw file's RMS without going above
// processing.peakCeiling, and one mp3 encode from the floats. Never mp3 → mp3 twice.
// Logged per file: tool version, chain, gain, the RMS of the raw, filtered, gained and decoded-result samples, peaks,
// sample counts, sha256 of input and output, and how far the chain shifts the sound in time (cross-correlation of the
// raw samples with the filtered floats, and with the decoded result; reported, not corrected).
//
//   npm run audio:process                           audio/raw/P*.mp3 and H*.mp3 → audio/dev/, log audio/process-log.json
//   npm run audio:process -- <in.mp3> <out.mp3>     one file; the log goes next to the output as <out>.process.json
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decode, decoderVersion } from "../lib/audio.mjs";
import { crossCorrelationLag, matchRmsGain, peak, rms, scaled } from "../lib/audio-dsp.mjs";
import { sha256 } from "../lib/png.mjs";
import { ROOT, rel } from "../lib/spec.mjs";

const V = JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "voice.json"), "utf8"));
const P = V.processing;
export const MAX_LAG = 2205; // chosen: ±50 ms at 44100 Hz, far more than any filter in the chain could delay

const asBytes = (f32) => Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
const asFloats = (buf) => Float32Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
const floatIn = (sampleRate) => ["-f", "f32le", "-ar", String(sampleRate), "-ac", "1", "-i", "pipe:0"];

export function processFile(input, output) {
  const raw = decode(input);
  const sr = raw.sampleRate;
  const filterArgs = ["-v", "error", ...floatIn(sr), "-af", P.chain, "-f", "f32le", "pipe:1"];
  const filtered = asFloats(execFileSync("ffmpeg", filterArgs, { input: asBytes(raw.samples), maxBuffer: 1 << 30 }));
  const g = matchRmsGain(raw.samples, filtered, P.peakCeiling);
  const gained = scaled(filtered, g.gain);
  const encodeArgs = ["-v", "error", "-y", ...floatIn(sr), ...P.encode, output];
  fs.mkdirSync(path.dirname(output), { recursive: true });
  execFileSync("ffmpeg", encodeArgs, { input: asBytes(gained), maxBuffer: 1 << 30 });
  const result = decode(output);
  const lagFilter = crossCorrelationLag(raw.samples, filtered, MAX_LAG);
  const lagResult = crossCorrelationLag(raw.samples, result.samples, MAX_LAG);
  const show = (args) => ["ffmpeg", ...args.map((a) => (a === output ? rel(output) : a))].join(" ");
  return {
    input: rel(input), inputSha256: sha256(fs.readFileSync(input)), output: rel(output), outputSha256: sha256(fs.readFileSync(output)), outputBytes: fs.statSync(output).size,
    tool: decoderVersion(), decode: raw.command, filter: show(filterArgs), encode: show(encodeArgs), chain: P.chain,
    sampleRate: sr, samples: { raw: raw.samples.length, filtered: filtered.length, result: result.samples.length },
    rms: { raw: rms(raw.samples), filtered: rms(filtered), gained: rms(gained), result: rms(result.samples) },
    peak: { raw: peak(raw.samples), filtered: peak(filtered), gained: peak(gained), result: peak(result.samples) },
    gain: g.gain, gainWanted: g.wanted, gainLimitedByCeiling: g.limitedByCeiling, peakCeiling: P.peakCeiling,
    lagSamples: { method: `normalised cross-correlation, lags -${MAX_LAG}..${MAX_LAG} samples; positive = processed later than raw`, chainOnly: lagFilter, afterEncode: lagResult },
  };
}

const say = (e) => {
  console.log(`${e.input} → ${e.output}  sha256 ${e.outputSha256}`);
  console.log(`  RMS raw ${e.rms.raw}, filtered ${e.rms.filtered}, gained ${e.rms.gained}, result ${e.rms.result}`);
  console.log(`  gain ${e.gain}${e.gainLimitedByCeiling ? ` (wanted ${e.gainWanted}, limited by the ceiling ${e.peakCeiling})` : ""}; peak filtered ${e.peak.filtered}, gained ${e.peak.gained}, result ${e.peak.result}`);
  console.log(`  samples raw ${e.samples.raw}, filtered ${e.samples.filtered}, result ${e.samples.result}`);
  console.log(`  lag: chain only ${e.lagSamples.chainOnly.lag} samples (r ${e.lagSamples.chainOnly.r}, r at 0 ${e.lagSamples.chainOnly.rAtZero}); after encode ${e.lagSamples.afterEncode.lag} samples (r ${e.lagSamples.afterEncode.r}, r at 0 ${e.lagSamples.afterEncode.rAtZero})`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 2) {
    const e = processFile(path.resolve(args[0]), path.resolve(args[1]));
    say(e);
    fs.writeFileSync(path.resolve(args[1]).replace(/\.mp3$/, ".process.json"), JSON.stringify(e, null, 2) + "\n");
  } else if (args.length === 0) {
    const files = [];
    const lines = fs.readdirSync(path.join(ROOT, "audio", "raw")).filter((f) => /^line-[a-z]+\.mp3$/.test(f)).sort().map((f) => f.slice(0, -4));
    for (const p of [...Object.keys(V.phrases), ...Object.keys(V.heldOut || {}).filter((h) => fs.existsSync(path.join(ROOT, "audio", "raw", `${h}.mp3`))), ...lines]) {
      const e = processFile(path.join(ROOT, "audio", "raw", `${p}.mp3`), path.join(ROOT, "audio", "dev", `${p}.mp3`));
      say(e);
      files.push(e);
    }
    fs.writeFileSync(path.join(ROOT, "audio", "process-log.json"), JSON.stringify({ $comment: "Written by scripts/audio-process.mjs (npm run audio:process).", files }, null, 2) + "\n");
    // Disclosure: how each processed file was made, next to the raw files in audio/SOURCES.json.
    const sourcesFile = path.join(ROOT, "audio", "SOURCES.json");
    const sources = JSON.parse(fs.readFileSync(sourcesFile, "utf8"));
    sources.processed = files.map((e) => ({
      file: e.output, sha256: e.outputSha256, from: e.input, fromSha256: e.inputSha256, tool: e.tool, chain: e.chain, gain: e.gain,
      gainRule: P.gainRule, rmsRaw: e.rms.raw, rmsResult: e.rms.result, encode: e.encode, log: "audio/process-log.json",
    }));
    fs.writeFileSync(sourcesFile, JSON.stringify(sources, null, 2) + "\n");
    console.log("audio/process-log.json, audio/SOURCES.json");
  } else {
    console.error("usage: npm run audio:process [-- <in.mp3> <out.mp3>]");
    process.exit(1);
  }
}

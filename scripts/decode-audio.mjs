// Decodes audio files to samples and logs how: decoder and version, command, sample rate, sample count, and the
// sha256 of the samples (as little-endian float32). Writes audio/decode-log.json; prints the same.
//
//   npm run decode -- audio/dev/P1.mp3 audio/dev/P2.mp3 ...
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { decode } from "../lib/audio.mjs";
import { ROOT, rel } from "../lib/spec.mjs";

const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const log = { $comment: "Written by scripts/decode-audio.mjs.", files: [] };
for (const f of files) {
  const d = decode(path.resolve(f));
  const hash = crypto.createHash("sha256").update(Buffer.from(d.samples.buffer)).digest("hex");
  let peak = 0;
  for (const s of d.samples) if (Math.abs(s) > peak) peak = Math.abs(s);
  const e = { file: rel(path.resolve(f)), decoder: d.decoder, command: d.command, sampleRate: d.sampleRate, samples: d.samples.length, durationS: d.samples.length / d.sampleRate, peak, samplesSha256: hash };
  log.files.push(e);
  console.log(`${e.file}: ${e.samples} samples at ${e.sampleRate} Hz (${e.durationS} s), peak ${peak}, samples sha256 ${hash}`);
}
console.log(`decoder: ${log.files[0]?.decoder}`);
if (!process.argv.includes("--no-log")) fs.writeFileSync(path.join(ROOT, "audio", "decode-log.json"), JSON.stringify(log, null, 2) + "\n");

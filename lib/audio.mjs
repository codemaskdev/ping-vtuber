// Decoding audio to samples, Node only: ffmpeg → mono 32-bit float at the file's own sample rate. The decoder and its
// version are returned with the samples so every caller can log them.
import { execFileSync } from "node:child_process";

export function decoderVersion() {
  return execFileSync("ffmpeg", ["-version"]).toString().split("\n")[0];
}

export function sampleRateOf(file) {
  return Number(execFileSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate", "-of", "csv=p=0", file]).toString().trim());
}

export function decode(file) {
  const sampleRate = sampleRateOf(file);
  const args = ["-v", "error", "-i", file, "-ac", "1", "-ar", String(sampleRate), "-f", "f32le", "-"];
  const buf = execFileSync("ffmpeg", args, { maxBuffer: 1 << 30 });
  const samples = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  return { samples: Float32Array.from(samples), sampleRate, decoder: decoderVersion(), command: ["ffmpeg", ...args.map((a) => (a === file ? "<file>" : a))].join(" ") };
}

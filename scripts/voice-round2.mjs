// Voice candidates, round 2 (author's prompt #15): six versions of the candidate line in out/voice-candidates/round-2/
// (not committed), with candidates.txt. ElevenLabs is called four times at most: two library voices with
// /with-timestamps, two voice-design previews (never saved to the account). The two processed versions use no call:
// they filter the round 1 River file (the most neutral voice) with ffmpeg; the filter chains are below and in the log.
//
//   npm run voice:round2
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { designPreviews, ttsWithTimestamps } from "../lib/elevenlabs.mjs";
import { sha256 } from "../lib/png.mjs";
import { ROOT, rel } from "../lib/spec.mjs";

const V = JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "voice.json"), "utf8"));
const R2 = V.round2;
const OUT = path.join(ROOT, "out", "voice-candidates", "round-2");
fs.mkdirSync(OUT, { recursive: true });
const probe = (file) => {
  const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=sample_rate,codec_name:format=duration", "-of", "json", file]).toString());
  return { durationS: Number(j.format.duration), sampleRate: Number(j.streams[0].sample_rate), codec: j.streams[0].codec_name };
};
const lines = [`Round 2 candidates (author's prompt #15). Line: ${V.candidateLine}`, ""];
const add = (n, title, fields) => { lines.push(`${n}. ${title}`, ...Object.entries(fields).map(([k, v]) => `   ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`), ""); };
let n = 0;

// 1. Library voices.
for (const voice of R2.library) {
  n++;
  const base = path.join(OUT, `${n}-library-${voice.name.split(" - ")[0].toLowerCase()}`);
  const r = await ttsWithTimestamps({ voiceId: voice.id, modelId: V.modelId, settings: V.settings, outputFormat: V.outputFormat, seed: V.seed, text: V.candidateLine });
  fs.writeFileSync(`${base}.mp3`, r.audio);
  fs.writeFileSync(`${base}.align.json`, JSON.stringify({ text: V.candidateLine, alignment: r.alignment }, null, 2) + "\n");
  add(n, `library: ${voice.name}`, { "voice id": voice.id, why: voice.why, model: V.modelId, settings: V.settings, seed: V.seed, "output format": V.outputFormat, file: rel(`${base}.mp3`), sha256: sha256(r.audio), ...probe(`${base}.mp3`), "server date": r.serverDate, "credits reported": Object.keys(r.costHeaders).length ? r.costHeaders : "not reported" });
  console.log(`${rel(base)}.mp3`);
}

// 2. Voice design: one preview kept from each description. The endpoint wants 100 to 1000 characters of text, so the
// line is said three times (decided without asking: the same words, nothing else added).
const designText = [V.candidateLine, V.candidateLine, V.candidateLine].join(" ");
for (const d of R2.design) {
  n++;
  const base = path.join(OUT, `${n}-design-${d.key}`);
  try {
    const r = await designPreviews({ description: d.description, text: designText });
    const p = r.previews[0];
    if (!p) throw new Error("no preview returned");
    const audio = Buffer.from(p.audio_base_64 || p.audio_base64, "base64");
    fs.writeFileSync(`${base}.mp3`, audio);
    add(n, `voice design: ${d.key}`, { description: d.description, "text said": designText, model: p.model_id || r.model_id || "not reported", "previews returned": r.previews.length, "kept": "the first preview", "saved to the account": "no", file: rel(`${base}.mp3`), sha256: sha256(audio), ...probe(`${base}.mp3`), "server date": r.serverDate, "credits reported": Object.keys(r.costHeaders).length ? r.costHeaders : "not reported" });
    console.log(`${rel(base)}.mp3`);
  } catch (e) {
    add(n, `voice design: ${d.key} FAILED`, { description: d.description, error: e.message });
    console.log(`design ${d.key} failed: ${e.message}`);
  }
}

// 3. Processed: the round 1 River file through two ffmpeg chains.
const ffmpeg = execFileSync("ffmpeg", ["-version"]).toString().split("\n")[0];
for (const p of R2.processed) {
  n++;
  const src = path.join(ROOT, R2.processedSource), dest = path.join(OUT, `${n}-processed-${p.key}.mp3`);
  const args = ["-v", "error", "-y", "-i", rel(src), "-af", p.chain, "-c:a", "libmp3lame", "-b:a", "128k", rel(dest)];
  execFileSync("ffmpeg", args, { cwd: ROOT });
  add(n, `processed: ${p.key}`, { source: `${R2.processedSource} (round 1, River - Relaxed, Neutral, Informative, SAz9YHcvj6GT2YYXdXww)`, "filter chain": p.chain, why: p.why, command: `ffmpeg ${args.join(" ")}`, tool: ffmpeg, file: rel(dest), sha256: sha256(fs.readFileSync(dest)), ...probe(dest), "credits": "none (no ElevenLabs call)" });
  console.log(rel(dest));
}
fs.writeFileSync(path.join(OUT, "candidates.txt"), lines.join("\n"));
console.log("out/voice-candidates/round-2/candidates.txt");

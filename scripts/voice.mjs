// Ping's voice through ElevenLabs (lib/elevenlabs.mjs; the key is never printed or written).
//
//   npm run voice -- candidates          the candidate line with every candidate → out/voice-candidates/ (not committed)
//   npm run voice -- phrases             P1-P3, one take each, with the chosen voice → audio/raw/ (exactly what ElevenLabs
//                                        returned); writes audio/SOURCES.json. npm run audio:process makes audio/dev/.
//   npm run voice -- held-out H5 H6      the named held-out phrases, once each (refuses if a file exists) → audio/raw/;
//                                        adds them to SOURCES.json
//   npm run voice -- final-check         the candidate line once with the chosen voice → out/voice-final-check.raw.mp3,
//                                        then through the same processing → out/voice-final-check.mp3 (not committed)
// Every file gets its alignment (character timestamps) next to it as <name>.align.json. The alignment belongs to the
// raw audio (author's prompt #16).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ttsWithTimestamps } from "../lib/elevenlabs.mjs";
import { processFile } from "./audio-process.mjs";
import { sha256 } from "../lib/png.mjs";
import { ROOT, rel } from "../lib/spec.mjs";

const V = JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "voice.json"), "utf8"));
const probe = (file) => {
  const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=sample_rate,channels,codec_name:format=duration", "-of", "json", file]).toString());
  return { durationS: Number(j.format.duration), sampleRate: Number(j.streams[0].sample_rate), channels: j.streams[0].channels, codec: j.streams[0].codec_name };
};
const ffprobeVersion = () => execFileSync("ffprobe", ["-version"]).toString().split("\n")[0];

async function synth(voice, text, base) {
  const r = await ttsWithTimestamps({ voiceId: voice.id, modelId: V.modelId, settings: V.settings, outputFormat: V.outputFormat, seed: V.seed, text });
  fs.mkdirSync(path.dirname(base), { recursive: true });
  fs.writeFileSync(`${base}.mp3`, r.audio);
  fs.writeFileSync(`${base}.align.json`, JSON.stringify({ text, alignment: r.alignment, normalizedAlignment: r.normalizedAlignment }, null, 2) + "\n");
  if (r.alignment.characters.join("") !== text) throw new Error(`${rel(base)}: the alignment does not spell the text sent`);
  return {
    file: rel(`${base}.mp3`), alignment: rel(`${base}.align.json`), voiceName: voice.name, voiceId: voice.id, modelId: V.modelId,
    settings: V.settings, outputFormat: V.outputFormat, seed: V.seed, serverDate: r.serverDate, text,
    creditsReported: Object.keys(r.costHeaders || {}).length ? r.costHeaders : "not reported", sha256: sha256(r.audio), bytes: r.audio.length, ...probe(`${base}.mp3`), probedWith: ffprobeVersion(),
  };
}

const mode = process.argv[2];
if (mode === "candidates") {
  const lines = [`Candidate line: ${V.candidateLine}`, `model ${V.modelId}, settings ${JSON.stringify(V.settings)}, output ${V.outputFormat}, seed ${V.seed}`, ""];
  for (const [i, c] of V.candidates.entries()) {
    const slug = c.name.split(" - ")[0].toLowerCase().replace(/[^a-z]+/g, "-");
    const r = await synth(c, V.candidateLine, path.join(ROOT, "out", "voice-candidates", `${i + 1}-${slug}`));
    lines.push(`${i + 1}. ${c.name}`, `   voice id ${c.id}; model ${r.modelId}; settings ${JSON.stringify(r.settings)}; seed ${r.seed}`, `   ${r.file} (${r.durationS} s, ${r.sampleRate} Hz, sha256 ${r.sha256}); why: ${c.why}`, "");
    console.log(`${r.file}  ${r.durationS} s  ${r.sampleRate} Hz  ${c.name}`);
  }
  fs.writeFileSync(path.join(ROOT, "out", "voice-candidates", "candidates.txt"), lines.join("\n"));
  console.log("out/voice-candidates/candidates.txt");
} else if (mode === "phrases") {
  if (!V.chosen) throw new Error("no voice chosen in audio/voice.json");
  const voice = V.candidates.find((c) => c.id === V.chosen);
  const entries = [];
  for (const [p, text] of Object.entries(V.phrases)) {
    entries.push(await synth(voice, text, path.join(ROOT, "audio", "raw", p)));
    console.log(`${entries.at(-1).file}  ${entries.at(-1).durationS} s  sha256 ${entries.at(-1).sha256}`);
  }
  const sourcesFile = path.join(ROOT, "audio", "SOURCES.json");
  const before = fs.existsSync(sourcesFile) ? JSON.parse(fs.readFileSync(sourcesFile, "utf8")) : {};
  fs.writeFileSync(sourcesFile, JSON.stringify({
    $comment: "Written by scripts/voice.mjs (raw files) and scripts/audio-process.mjs (processed). Per raw file: what ElevenLabs returned, untouched: voice, model, settings, the server's date, the exact text, sha256, duration and sample rate (ffprobe), its alignment. Per processed file: how it was made from the raw one. Audio files are committed only after their metadata was approved.",
    voiceStatus: "chosen",
    chosenBy: V.chosenBy,
    files: entries,
    processed: [],
    repeatabilityEarlier: before.repeatability ? { ...before.repeatability, note: "measured in step 4 (prompt #14) with the provisional voice, P1 twice; not measured again: prompt #16 asks for one take per phrase" } : before.repeatabilityEarlier,
  }, null, 2) + "\n");
  console.log("audio/SOURCES.json");
} else if (mode === "held-out") {
  // The held-out phrases (author's prompt #17), once each, after the measurement method was committed.
  if (!V.chosen) throw new Error("no voice chosen in audio/voice.json");
  const voice = V.candidates.find((c) => c.id === V.chosen);
  const sourcesFile = path.join(ROOT, "audio", "SOURCES.json");
  const sources = JSON.parse(fs.readFileSync(sourcesFile, "utf8"));
  sources.heldOutFiles ||= [];
  const asked = process.argv.slice(3).filter((a) => /^H\d+$/.test(a));
  if (!asked.length) throw new Error("name the held-out phrases to synthesise, e.g. H5 H6");
  for (const [p, text] of Object.entries(V.heldOut).filter(([h]) => asked.includes(h))) {
    if (fs.existsSync(path.join(ROOT, "audio", "raw", `${p}.mp3`))) throw new Error(`audio/raw/${p}.mp3 exists: held-out phrases are synthesised once`);
    sources.heldOutFiles.push(await synth(voice, text, path.join(ROOT, "audio", "raw", p)));
    console.log(`${sources.heldOutFiles.at(-1).file}  ${sources.heldOutFiles.at(-1).durationS} s  sha256 ${sources.heldOutFiles.at(-1).sha256}`);
  }
  fs.writeFileSync(sourcesFile, JSON.stringify(sources, null, 2) + "\n");
  console.log("audio/SOURCES.json");
} else if (mode === "final-check") {
  if (!V.chosen) throw new Error("no voice chosen in audio/voice.json");
  const voice = V.candidates.find((c) => c.id === V.chosen);
  const r = await synth(voice, V.candidateLine, path.join(ROOT, "out", "voice-final-check.raw"));
  const e = processFile(path.join(ROOT, "out", "voice-final-check.raw.mp3"), path.join(ROOT, "out", "voice-final-check.mp3"));
  fs.writeFileSync(path.join(ROOT, "out", "voice-final-check.txt"), JSON.stringify({ raw: r, processing: e }, null, 2) + "\n");
  console.log(`${r.file} ${r.durationS} s → ${e.output}; RMS raw ${e.rms.raw}, result ${e.rms.result}; gain ${e.gain}; out/voice-final-check.txt`);
} else {
  console.error("usage: npm run voice -- candidates | phrases | held-out | final-check");
  process.exit(1);
}

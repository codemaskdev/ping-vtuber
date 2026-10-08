// Ping's voice through ElevenLabs (lib/elevenlabs.mjs; the key is never printed or written).
//
//   npm run voice -- candidates          the candidate line with every candidate → out/voice-candidates/ (not committed)
//   npm run voice -- phrases             P1-P3 with the provisional (or chosen) voice → audio/dev/, plus a second take of
//                                        P1 in out/voice-repeat/ to see whether the call repeats; updates audio/SOURCES.json
// Every file gets its alignment (character timestamps) next to it as <name>.align.json.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ttsWithTimestamps } from "../lib/elevenlabs.mjs";
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
    sha256: sha256(r.audio), bytes: r.audio.length, ...probe(`${base}.mp3`), probedWith: ffprobeVersion(),
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
  const id = V.chosen || V.provisional;
  const voice = V.candidates.find((c) => c.id === id);
  const entries = [];
  for (const [p, text] of Object.entries(V.phrases)) {
    entries.push(await synth(voice, text, path.join(ROOT, "audio", "dev", p)));
    console.log(`${entries.at(-1).file}  ${entries.at(-1).durationS} s  sha256 ${entries.at(-1).sha256}`);
  }
  const again = await synth(voice, V.phrases.P1, path.join(ROOT, "out", "voice-repeat", "P1-take2"));
  const same = again.sha256 === entries[0].sha256;
  console.log(`P1 twice: ${same ? "identical bytes" : "different bytes"} (${entries[0].sha256} vs ${again.sha256}; ${entries[0].bytes} vs ${again.bytes} bytes)`);
  fs.writeFileSync(path.join(ROOT, "audio", "SOURCES.json"), JSON.stringify({
    $comment: "Written by scripts/voice.mjs. Per audio file: voice, model, settings, the server's date, the exact text, sha256, duration and sample rate (ffprobe). Audio files are committed only after the author approved their metadata.",
    voiceStatus: V.chosen ? "chosen" : "provisional",
    files: entries,
    repeatability: { text: V.phrases.P1, take1: { sha256: entries[0].sha256, bytes: entries[0].bytes }, take2: { file: again.file, sha256: again.sha256, bytes: again.bytes }, identical: same },
  }, null, 2) + "\n");
  console.log("audio/SOURCES.json");
} else {
  console.error("usage: npm run voice -- candidates | phrases");
  process.exit(1);
}

// Lip sync v1 clips: for each development phrase, the mouths from lib/lipsync-volume.mjs, a HyperFrames render
// (mp4, video only) of neutral + liveness (seed in the log) + mouth, then the phrase's audio muxed in with ffmpeg,
// stream copy (no re-encoding of the audio or the video).
//
//   npm run lipsync:clips -- --seed 1 [P1 P2 P3]
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { decode } from "../lib/audio.mjs";
import { lipsyncVolume } from "../lib/lipsync-volume.mjs";
import { ROOT, rel } from "../lib/spec.mjs";
import { buildPreview, lipsyncSequence } from "./build-preview.mjs";

const args = process.argv.slice(2);
const i = args.indexOf("--seed"), seed = i >= 0 ? Number(args[i + 1]) : 1;
const phrases = args.filter((a) => /^P\d+$/.test(a));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "lipsync-volume.json"), "utf8"));
const out = path.join(ROOT, "out", "lipsync-v1");
fs.mkdirSync(out, { recursive: true });
const ffmpeg = execFileSync("ffmpeg", ["-version"]).toString().split("\n")[0];
for (const p of phrases.length ? phrases : ["P1", "P2", "P3"]) {
  const audio = path.join(ROOT, "audio", "dev", `${p}.mp3`);
  const d = decode(audio);
  const { mouths } = lipsyncVolume(d.samples, d.sampleRate, 30, cfg);
  const b = buildPreview("lipsync", seed, lipsyncSequence(p, seed, mouths));
  const video = path.join(out, `${p}.video.mp4`), final = path.join(out, `${p}.mp4`), log = path.join(out, `${p}.log`);
  const lines = [`lip sync v1, phrase ${p}, liveness seed ${seed}, ${b.frames} frames at 30 fps (${mouths.length} with audio + 15 at rest)`, `decoder: ${d.decoder}`, `thresholds: restBelow ${cfg.restBelow}, openFrom ${cfg.openFrom}`];
  const r = spawnSync("bash", ["-c", `time npx --yes hyperframes@0.8.134 render -o ${JSON.stringify(path.relative(path.join(ROOT, "rig", "preview"), video))}`], { cwd: path.join(ROOT, "rig", "preview"), encoding: "utf8" });
  lines.push(`render exit ${r.status}`, ...(r.stdout + r.stderr).split("\n").filter((l) => /rendered in|capture ·|real|total$/.test(l)).map((l) => l.trim()));
  const mux = ["-v", "error", "-y", "-i", rel(video), "-i", rel(audio), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "copy", rel(final)];
  execFileSync("ffmpeg", mux, { cwd: ROOT });
  lines.push(`mux: ${ffmpeg}`, `mux command: ffmpeg ${mux.join(" ")}`);
  fs.writeFileSync(log, lines.join("\n") + "\n");
  console.log(lines.join("\n") + "\n");
}

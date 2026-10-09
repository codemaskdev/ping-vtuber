// Side-by-side clips of two lip sync versions (author's prompt #18: v1 | v3 and v2 | v3): left and right renders
// stacked with ffmpeg hstack, a label strip drawn by code, the phrase's audio stream-copied.
//
//   npm run side-by-side -- --left v1 --right v3 H5 H6 H7 H8     out/lipsync-<right>/<phrase>-<left>-<right>.mp4
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { drawText } from "../lib/font.mjs";
import { create } from "../lib/image.mjs";
import { writePng } from "../lib/png.mjs";
import { ROOT, rel } from "../lib/spec.mjs";

const args = process.argv.slice(2), arg = (k) => args[args.indexOf(k) + 1];
const left = arg("--left"), right = arg("--right"), phrases = args.filter((a) => /^[PH]\d+$/.test(a));
const W = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "rig.json"), "utf8")).stage.width;
const out = path.join(ROOT, "out", `lipsync-${right}`);
console.log(execFileSync("ffmpeg", ["-version"]).toString().split("\n")[0]);
for (const p of phrases) {
  const label = create(2 * W, 90, [0, 0, 0, 0]);
  drawText(label, `${left.toUpperCase()} - ${p}`, 30, 25, 6, [255, 255, 255, 255]);
  drawText(label, `${right.toUpperCase()} - ${p}`, W + 30, 25, 6, [255, 255, 255, 255]);
  const labelFile = path.join(out, `${p}-${left}-${right}-label.png`);
  writePng(labelFile, label);
  const dest = path.join(out, `${p}-${left}-${right}.mp4`);
  const a = ["-v", "error", "-y", "-i", rel(path.join(ROOT, "out", `lipsync-${left}`, `${p}.video.mp4`)), "-i", rel(path.join(out, `${p}.video.mp4`)), "-i", rel(labelFile), "-i", `audio/dev/${p}.mp3`,
    "-filter_complex", "[0:v][1:v]hstack=inputs=2[s];[s][2:v]overlay=0:0[v]", "-map", "[v]", "-map", "3:a:0", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", rel(dest)];
  execFileSync("ffmpeg", a, { cwd: ROOT });
  console.log(`${rel(dest)}: ffmpeg ${a.join(" ")}`);
}

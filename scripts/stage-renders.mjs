// Every render that depends on the stage (rig.json stage; author's prompt #16), made again in one go and logged to
// out/stage-renders.txt: the pose sheet, the step 2 test clip twice (frame hashes), the reconstruction, the liveness
// clip twice (frame hashes, blink strip), the emotions sheet, the emotions walk-through twice (frame hashes, an mp4
// for viewing) and the synthetic face stream clip. The lip sync clips are made by lipsync:clips and lipsync:compare.
//
//   npm run stage:renders
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, rel } from "../lib/spec.mjs";
import { PREVIEW, buildPreview, posesSequence, rig } from "./build-preview.mjs";
import { playStream, syntheticStream } from "./face-stream.mjs";

const log = [];
const say = (s) => { log.push(s); console.log(s); };
const node = (script, ...args) => execFileSync(process.execPath, [path.join(ROOT, "scripts", script), ...args], { cwd: ROOT, encoding: "utf8" }).trimEnd();
const ffmpegVersion = execFileSync("ffmpeg", ["-version"]).toString().split("\n")[0];

// One HyperFrames render of whatever rig/preview holds now, as a PNG sequence (or an mp4 with --format mp4 left out).
function render(outDir, format = "png-sequence") {
  fs.rmSync(outDir, { recursive: true, force: true });
  const args = format === "png-sequence" ? `--format png-sequence -o ${JSON.stringify(path.relative(PREVIEW, outDir))}` : `-o ${JSON.stringify(path.relative(PREVIEW, outDir))}`;
  const r = spawnSync("bash", ["-c", `time npx --yes hyperframes@0.8.134 render ${args}`], { cwd: PREVIEW, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`render failed (${r.status}): ${(r.stdout + r.stderr).slice(-2000)}`);
  const lines = (r.stdout + r.stderr).split("\n").filter((l) => /rendered in|real/.test(l)).map((l) => l.trim());
  say(`  ${rel(outDir)}: ${lines.join("; ")}`);
}
const mp4 = (framesDir, dest) => {
  const args = ["-v", "error", "-y", "-framerate", "30", "-i", `${rel(framesDir)}/frame_%06d.png`, "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", rel(dest)];
  execFileSync("ffmpeg", args, { cwd: ROOT });
  say(`  ${rel(dest)}: ffmpeg ${args.join(" ")}`);
};
const R = (name) => path.join(ROOT, "out", "render", name);

say(`stage ${rig.stage.width}x${rig.stage.height}, art at ${rig.stage.artOffset.join(",")}, tilt limit ${rig.limits.headTiltDeg.join("..")} deg; hyperframes@0.8.134; ${ffmpegVersion}`);

say("pose sheet");
buildPreview("pose-sheet");
render(R("pose-sheet"));
say(`  ${node("pose-sheet.mjs")}`);

say("step 2 test clip, twice");
for (const run of [1, 2]) { buildPreview("clip"); render(R(`clip-${run}`)); }
say(`  ${node("frame-hashes.mjs", "out/render/clip-1", "out/render/clip-2").split("\n")[0]}`);

say("reconstruction");
buildPreview("reconstruction");
render(R("reconstruction"));
for (const l of node("reconstruction.mjs").split("\n")) say(`  ${l}`);

say("liveness, seed 1, twice");
for (const run of [1, 2]) { buildPreview("liveness", 1); render(R(`liveness-seed-1-run-${run}`)); }
say(`  ${node("frame-hashes.mjs", "out/render/liveness-seed-1-run-1", "out/render/liveness-seed-1-run-2").split("\n")[0]}`);
say(`  ${node("liveness-strip.mjs", "--seed", "1", "--render", "out/render/liveness-seed-1-run-1")}`);

say("emotions sheet");
buildPreview("emotions-sheet");
render(R("emotions-sheet"));
say(`  ${node("emotions-sheet.mjs")}`);

say("emotions walk-through, seed 1, twice");
for (const run of [1, 2]) { buildPreview("emotions", 1); render(R(`emotions-seed-1-run-${run}`)); }
say(`  ${node("frame-hashes.mjs", "out/render/emotions-seed-1-run-1", "out/render/emotions-seed-1-run-2").split("\n")[0]}`);
mp4(R("emotions-seed-1-run-1"), path.join(ROOT, "out", "emotions-seed-1.mp4"));

say("synthetic face stream, seed 1 (SYNTHETIC, not a real face)");
const faceCfg = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "face.json"), "utf8"));
const { poses, saturated } = playStream(rig, faceCfg, syntheticStream(1));
say(`  ${poses.length} poses, largest |tilt| ${Math.max(...poses.map((p) => Math.abs(p.head.tilt)))}, tilt saturated in ${saturated.filter((s) => s.includes("tilt")).length} frames (tiltGain ${faceCfg.head.tiltGain})`);
buildPreview("poses", undefined, posesSequence(poses, "face-synthetic-seed-1"));
render(path.join(ROOT, "out", "face-synthetic-seed-1.mp4"), "mp4");

fs.writeFileSync(path.join(ROOT, "out", "stage-renders.txt"), log.join("\n") + "\n");
console.log("out/stage-renders.txt");

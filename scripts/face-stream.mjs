// A recorded face stream made by code (author's prompt #15: no real face exists in this run). SYNTHETIC: numbers only,
// shaped like MediaPipe's output (blendshape scores and a column-major 4x4 matrix), from a seed, no trigonometry.
// Played through lib/face-to-pose.mjs it gives one pose per frame for tests and for a rendered clip.
//
//   npm run face:stream -- --seed 1      writes out/face-stream-synthetic.json and out/face-poses-synthetic.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { faceToPose } from "../lib/face-to-pose.mjs";
import { mulberry32 } from "../lib/rng.mjs";
import { ROOT } from "../lib/spec.mjs";

const smootherstep = (x) => x * x * x * (x * (x * 6 - 15) + 10);

// Eased random walk: a new target every [lo, hi] frames, eased with smootherstep.
function walk(rng, frames, range, [lo, hi]) {
  const out = new Array(frames);
  let from = 0, to = (rng() * 2 - 1) * range, start = 0, len = lo + Math.floor(rng() * (hi - lo));
  for (let f = 0; f < frames; f++) {
    if (f - start >= len) { from = to; to = (rng() * 2 - 1) * range; start = f; len = lo + Math.floor(rng() * (hi - lo)); }
    out[f] = from + (to - from) * smootherstep((f - start) / len);
  }
  return out;
}

export function syntheticStream(seed, frames = 300) {
  const rng = mulberry32(seed >>> 0);
  const roll = walk(rng, frames, 0.45, [30, 60]), tx = walk(rng, frames, 6, [30, 75]), ty = walk(rng, frames, 4, [30, 75]);
  const out = [];
  let nextBlink = 40 + Math.floor(rng() * 60), mouthMode = 0, mouthUntil = 0, browMode = 0, browUntil = 30;
  for (let f = 0; f < frames; f++) {
    const b = {};
    // Blinks: 4 frames closed, every 75 to 120 frames.
    const k = f - nextBlink;
    const blink = k >= 0 && k < 6 ? [0.3, 0.9, 0.95, 0.95, 0.9, 0.3][k] : 0.05;
    if (k >= 6) nextBlink = f + 75 + Math.floor(rng() * 45);
    b.eyeBlinkLeft = blink; b.eyeBlinkRight = blink;
    // Mouth modes: 0 rest, 1 talking (jaw going up and down), 2 pucker, 3 smile, each for 20 to 50 frames.
    if (f >= mouthUntil) { mouthMode = Math.floor(rng() * 4); mouthUntil = f + 20 + Math.floor(rng() * 30); }
    b.jawOpen = mouthMode === 1 ? [0.05, 0.2, 0.5, 0.3, 0.12][f % 5] : 0.03;
    b.mouthPucker = mouthMode === 2 ? 0.6 : 0.02;
    b.mouthSmileLeft = b.mouthSmileRight = mouthMode === 3 ? 0.7 : 0.05;
    // Brows: 0 still, 1 raised, 2 lowered, each for 30 to 70 frames.
    if (f >= browUntil) { browMode = Math.floor(rng() * 3); browUntil = f + 30 + Math.floor(rng() * 40); }
    b.browInnerUp = browMode === 1 ? 0.7 : 0.05;
    b.browDownLeft = b.browDownRight = browMode === 2 ? 0.6 : 0.05;
    const s = roll[f], c = Math.sqrt(1 - s * s);
    out.push({ blendshapes: b, matrix: [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, tx[f], ty[f], -40, 1] });
  }
  return out;
}

export function playStream(rig, config, stream) {
  const poses = [], saturated = [];
  let state = null;
  for (const face of stream) {
    const r = faceToPose(rig, config, face, state);
    state = r.state;
    poses.push(r.pose);
    saturated.push(r.state.saturated);
  }
  return { poses, saturated };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--seed"), seed = i >= 0 ? Number(process.argv[i + 1]) : 1;
  const rig = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "rig.json"), "utf8"));
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "face.json"), "utf8"));
  const stream = syntheticStream(seed);
  const { poses, saturated } = playStream(rig, cfg, stream);
  fs.mkdirSync(path.join(ROOT, "out"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "out", "face-stream-synthetic.json"), JSON.stringify({ $comment: "SYNTHETIC face stream made by scripts/face-stream.mjs; not a real face", seed, fps: 30, frames: stream }) + "\n");
  fs.writeFileSync(path.join(ROOT, "out", "face-poses-synthetic.json"), JSON.stringify({ seed, poses }) + "\n");
  const count = (fn) => poses.filter(fn).length;
  console.log(`seed ${seed}: ${poses.length} frames; eyes closed ${count((p) => p.eyes === "closed")}; brows shown ${count((p) => p.brows !== "hidden")}; mouths ${["rest", "small", "open", "round", "wide"].map((m) => `${m} ${count((p) => p.mouth === m)}`).join(", ")}`);
  console.log(`largest |tilt| ${Math.max(...poses.map((p) => Math.abs(p.head.tilt)))}, |x| ${Math.max(...poses.map((p) => Math.abs(p.head.x)))}, |y| ${Math.max(...poses.map((p) => Math.abs(p.head.y)))}; frames saturated: tilt ${saturated.filter((s) => s.includes("tilt")).length}, x ${saturated.filter((s) => s.includes("x")).length}, y ${saturated.filter((s) => s.includes("y")).length}`);
}

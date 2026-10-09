// Writes the HyperFrames project in rig/preview/ for one sequence of fixed poses, the way the CodeMask host avatar's
// preview does it (its preview/sync.mjs): copies of the drawing code and the layers, a data.js, and an index.html with
// one canvas and one paused GSAP timeline whose proxy tween draws the pose for the current time. No easing: each
// pose holds for its whole step.
//
//   node scripts/build-preview.mjs pose-sheet | clip | reconstruction
//   node scripts/build-preview.mjs liveness --seed 1     10 s at 30 fps of the neutral pose plus liveness
//
// Sequences (rigSequences below): every entry is { label, pose, skeleton }. "clip" is a final render: it refuses
// any entry with the debug skeleton on.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { combine } from "../lib/pose.mjs";
import { neutralPose, validatePose } from "../lib/rig.mjs";
import { ROOT, rel } from "../lib/spec.mjs";

export const PREVIEW = path.join(ROOT, "rig", "preview");
export const rig = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "rig.json"), "utf8"));
export const livenessConfig = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "liveness.json"), "utf8"));
export const emotionsConfig = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "emotions.json"), "utf8"));

const pose = (change) => { const p = neutralPose(rig); change(p); return p; };
const L = rig.limits;

export function rigSequences() {
  return {
    "pose-sheet": {
      fps: 1, framesPerEntry: 1, final: false,
      entries: [
        { label: "neutral", pose: pose(() => {}) },
        { label: "eyes closed", pose: pose((p) => { p.eyes = "closed"; }) },
        ...["rest", "small", "open", "round", "wide"].map((m) => ({ label: `mouth ${m}`, pose: pose((p) => { p.mouth = m; }) })),
        { label: "brows as drawn (dy 0)", pose: pose((p) => { p.brows = { dy: 0 }; }) },
        { label: `brows at browsRestDy (${rig.browsRest.browsRestDy})`, pose: pose((p) => { p.brows = { dy: rig.browsRest.browsRestDy }; }) },
        { label: `brows raised (dy ${L.browsDy[0]})`, pose: pose((p) => { p.brows = { dy: L.browsDy[0] }; }) },
        { label: `head tilt ${L.headTiltDeg[0]} deg`, pose: pose((p) => { p.head.tilt = L.headTiltDeg[0]; }) },
        { label: `head tilt ${L.headTiltDeg[1]} deg`, pose: pose((p) => { p.head.tilt = L.headTiltDeg[1]; }) },
        { label: `head shift ${L.headShiftPx.x[1]},${L.headShiftPx.y[0]}`, pose: pose((p) => { p.head.x = L.headShiftPx.x[1]; p.head.y = L.headShiftPx.y[0]; }) },
        { label: "cursor off", pose: pose((p) => { p.cursor = false; }) },
        { label: "neutral + skeleton", pose: pose(() => {}), skeleton: true },
      ],
    },
    "emotions-sheet": {
      fps: 1, framesPerEntry: 1, final: false,
      entries: [
        { label: "neutral", pose: pose(() => {}) },
        ...Object.keys(emotionsConfig.states).map((s) => ({ label: s, pose: combine(rig, neutralPose(rig), emotionsConfig.states[s].partial) })),
      ],
    },
    reconstruction: {
      fps: 1, framesPerEntry: 1, final: false,
      entries: [{ label: "neutral, brows hidden, over black", pose: pose((p) => { p.brows = "hidden"; }) }],
    },
    clip: {
      fps: 30, framesPerEntry: 15, final: true,
      entries: [
        { label: "neutral", pose: pose(() => {}) },
        { label: "mouth open", pose: pose((p) => { p.mouth = "open"; }) },
        { label: "mouth round", pose: pose((p) => { p.mouth = "round"; }) },
        { label: "eyes closed", pose: pose((p) => { p.eyes = "closed"; }) },
        { label: "tilt left", pose: pose((p) => { p.head.tilt = L.headTiltDeg[0]; }) },
        { label: "tilt right, mouth wide", pose: pose((p) => { p.head.tilt = L.headTiltDeg[1]; p.mouth = "wide"; }) },
        { label: "shift, brows raised", pose: pose((p) => { p.head.x = L.headShiftPx.x[0]; p.head.y = L.headShiftPx.y[1]; p.brows = { dy: L.browsDy[0] }; }) },
        { label: "cursor off, mouth small, glow 0.5", pose: pose((p) => { p.cursor = false; p.mouth = "small"; p.glow = 0.5; }) },
      ],
    },
  };
}

// Every pose must pass the rig's limits; a final render never carries the debug skeleton.
export function checkSequence(name, seq) {
  for (const e of seq.entries) {
    validatePose(rig, e.pose);
    if (seq.final && e.skeleton) throw new Error(`${name} is a final render: the debug skeleton is not allowed (${e.label})`);
  }
}

// A liveness clip: the neutral pose plus lib/liveness.mjs for the seed, computed per frame in the browser.
export function livenessSequence(seed, seconds = 10, fps = 30) {
  if (!Number.isInteger(seed) || seed < 0) throw new Error("seed must be a non-negative integer");
  return { kind: "liveness", seed, fps, frames: seconds * fps, final: true, entries: [] };
}

// A lip sync clip: one mouth per frame from lib/lipsync-volume.mjs on the phrase's decoded audio, then 15 frames at
// rest, with liveness for the seed on top. The audio itself is muxed in afterwards (scripts/lipsync-clips.mjs).
export function lipsyncSequence(phrase, seed, mouths, fps = 30) {
  if (!/^[PH]\d+$/.test(phrase)) throw new Error("phrase must look like P1");
  return { kind: "lipsync", phrase, seed, fps, frames: mouths.length + 15, mouths, final: true, entries: [] };
}

// The emotions walk-through: rig/emotions.json demoMarks over 10 s at 30 fps, with liveness for the seed.
export function emotionsSequence(seed) {
  if (!Number.isInteger(seed) || seed < 0) throw new Error("seed must be a non-negative integer");
  return { kind: "emotions", seed, fps: 30, frames: 300, marks: emotionsConfig.demoMarks, final: true, entries: [] };
}

// A clip of ready-made poses, one per frame (e.g. a face stream played through lib/face-to-pose.mjs).
export function posesSequence(poses, label, fps = 30) {
  return { kind: "poses", label, fps, frames: poses.length, poses, final: true, entries: [] };
}

export function buildPreview(name, seed, extra) {
  const seq = name === "liveness" ? livenessSequence(seed) : name === "lipsync" || name === "poses" ? extra : name === "emotions" ? emotionsSequence(seed) : rigSequences()[name];
  if (!seq) throw new Error(`unknown sequence ${name}`);
  checkSequence(name, seq);
  if (seq.kind === "poses") for (const p of seq.poses) validatePose(rig, p);
  const frames = seq.kind ? seq.frames : seq.entries.length * seq.framesPerEntry;
  const duration = frames / seq.fps;
  for (const d of ["layers"]) fs.rmSync(path.join(PREVIEW, d), { recursive: true, force: true });
  fs.mkdirSync(path.join(PREVIEW, "art", "layers"), { recursive: true });
  for (const l of rig.layers) fs.copyFileSync(path.join(ROOT, l.file), path.join(PREVIEW, l.file));
  for (const f of ["rig.mjs", "rng.mjs", "liveness.mjs", "pose.mjs", "emotions.mjs"]) fs.copyFileSync(path.join(ROOT, "lib", f), path.join(PREVIEW, f));
  fs.copyFileSync(path.join(ROOT, "rig", "adapter.js"), path.join(PREVIEW, "adapter.js"));
  fs.writeFileSync(path.join(PREVIEW, "data.js"),
    "// Written by scripts/build-preview.mjs. Do not edit by hand.\nwindow.PING_RIG = " + JSON.stringify(rig) +
    ";\nwindow.PING_LIVENESS = " + JSON.stringify(livenessConfig) +
    ";\nwindow.PING_EMOTIONS = " + JSON.stringify(emotionsConfig) +
    ";\nwindow.PING_SEQUENCE = " + JSON.stringify({ name, ...seq, frames, duration }) + ";\n");
  const W = rig.stage.width, H = rig.stage.height;
  const imgs = rig.layers.map((l, i) => `      <img id="layer-${i}" data-file="${l.file}" src="${l.file}" alt="" />`).join("\n");
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <!-- Written by scripts/build-preview.mjs (sequence "${name}"${seq.seed !== undefined ? `, seed ${seq.seed}` : ""}${seq.phrase ? `, phrase ${seq.phrase}` : ""}). Do not edit by hand. -->
    <script src="vendor/gsap.min.js"></script>
    <script src="adapter.js"></script>
    <script src="data.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
      #root { position: relative; width: 100%; height: 100%; background: #000; }
      #rig { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
      #preload { display: none; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-fps="${seq.fps}" data-width="${W}" data-height="${H}">
      <canvas id="rig" class="clip" width="${W}" height="${H}" data-start="0" data-duration="${duration}" data-track-index="0"></canvas>
    </div>
    <div id="preload">
${imgs}
    </div>
    <script type="module">
      import { drawList, neutralPose, skeleton } from "./rig.mjs";
      import { livenessAt } from "./liveness.mjs";
      import { combine } from "./pose.mjs";
      import { emotionAt } from "./emotions.mjs";
      const R = window.PING_RIG, S = window.PING_SEQUENCE, LC = window.PING_LIVENESS, EC = window.PING_EMOTIONS;
      const images = {};
      for (const img of document.querySelectorAll("#preload img")) images[img.dataset.file] = img;
      await Promise.all(Object.values(images).map((img) => img.decode()));
      const ctx = document.getElementById("rig").getContext("2d");
      // Pose for a time: the frame number is exact (t * fps rounds to an integer), each entry holds framesPerEntry frames.
      function show(t) {
        const frame = Math.min(S.frames - 1, Math.round(t * S.fps));
        if (S.kind === "liveness") {
          PingAdapter.draw(ctx, images, drawList(R, combine(R, neutralPose(R), livenessAt(LC, S.seed, frame, S.fps))));
          return;
        }
        if (S.kind === "poses") {
          PingAdapter.draw(ctx, images, drawList(R, S.poses[frame]));
          return;
        }
        if (S.kind === "emotions") {
          PingAdapter.draw(ctx, images, drawList(R, combine(R, neutralPose(R), livenessAt(LC, S.seed, frame, S.fps), emotionAt(R, EC, S.marks, frame))));
          return;
        }
        if (S.kind === "lipsync") {
          const mouth = frame < S.mouths.length ? S.mouths[frame] : "rest";
          PingAdapter.draw(ctx, images, drawList(R, combine(R, neutralPose(R), livenessAt(LC, S.seed, frame, S.fps), { mouth })));
          return;
        }
        const e = S.entries[Math.min(S.entries.length - 1, Math.floor(frame / S.framesPerEntry))];
        PingAdapter.draw(ctx, images, drawList(R, e.pose));
        if (e.skeleton) PingAdapter.drawSkeleton(ctx, skeleton(R, e.pose));
      }
      // A proxy tween drives the canvas, so the HyperFrames runtime can seek any frame (as in the host avatar preview).
      const state = { t: 0 };
      const tl = gsap.timeline({ paused: true });
      tl.to(state, { t: S.duration, duration: S.duration, ease: "none", onUpdate: () => show(state.t) }, 0);
      window.__timelines["main"] = tl;
      tl.seek(0);
      show(0);
    </script>
  </body>
</html>
`;
  fs.writeFileSync(path.join(PREVIEW, "index.html"), html);
  return { name, frames, duration, fps: seq.fps, seed: seq.seed, marks: seq.marks, entries: seq.entries.map((e) => e.label) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--seed");
  const r = buildPreview(process.argv[2], i >= 0 ? Number(process.argv[i + 1]) : undefined);
  if (r.marks) console.log(`marks: ${JSON.stringify(r.marks)}`);
  console.log(`${rel(PREVIEW)}: sequence ${r.name}${r.seed !== undefined ? `, seed ${r.seed}` : ""}, ${r.frames} frames at ${r.fps} fps (${r.duration} s)${r.entries.length ? ": " + r.entries.join(" | ") : ""}`);
}

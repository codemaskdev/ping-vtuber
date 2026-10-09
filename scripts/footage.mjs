// Footage for the episode (author's prompt #22): one folder per shot, out/footage/<id>/<id>.mp4 and shot.json (id, the
// script scene and line, frames, fps, size, seconds, what it was made from, checks with actual and expected values).
// Only mp4 files are kept; every intermediate frame or image is deleted after encoding.
//
//   npm run footage                  every shot
//   npm run footage -- v3-H2 lines   only the named shots (or groups: wrap, lines)
//   npm run footage -- sheet         out/footage/contact-sheet.png from the shots there
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "../lib/audio.mjs";
import { speechSpan } from "../lib/emotions.mjs";
import { drawText, textWidth } from "../lib/font.mjs";
import { alphaBBox, create, fillRect, over, resample } from "../lib/image.mjs";
import { linePose } from "../lib/line.mjs";
import { lipsyncText } from "../lib/lipsync-text.mjs";
import { lipsyncV3 } from "../lib/lipsync-v3.mjs";
import { frameCount, lipsyncVolume } from "../lib/lipsync-volume.mjs";
import { livenessAt } from "../lib/liveness.mjs";
import { closureScore, wordsOf } from "../lib/measure.mjs";
import { readPng, sha256, writePng } from "../lib/png.mjs";
import { combine } from "../lib/pose.mjs";
import { neutralPose } from "../lib/rig.mjs";
import { marksFromAlignment } from "../lib/script-tags.mjs";
import { ROOT, rel } from "../lib/spec.mjs";
import { PREVIEW, buildPreview, cutoutSequence, lineSequence, posesSequence, rig } from "./build-preview.mjs";
import { M, WINDOW, readClip, templates } from "./measure.mjs";

const OUT = path.join(ROOT, "out", "footage");
const FPS = 30, SW = rig.stage.width, SH = rig.stage.height, [AX, AY] = rig.stage.artOffset;
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
const gitJson = (commit, f) => JSON.parse(execFileSync("git", ["show", `${commit}:${f}`], { cwd: ROOT, encoding: "utf8" }));
const LC = read("rig/liveness.json"), EC = read("rig/emotions.json"), V2 = read("rig/lipsync-text.json"), V3 = read("rig/lipsync-v3.json");
const HEAD = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
const CLEAN = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim() === "";
const shaFile = (f) => sha256(fs.readFileSync(f));
const ffmpeg = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { cwd: ROOT, maxBuffer: 1 << 30 });
const X264 = ["-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p"];

function probe(file) {
  const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames,duration", "-of", "json", file]).toString());
  const v = j.streams.find((s) => s.codec_type === "video"), a = j.streams.find((s) => s.codec_type === "audio");
  const [n, d] = v.r_frame_rate.split("/").map(Number);
  return { width: v.width, height: v.height, fps: n / d, frames: Number(v.nb_read_frames), seconds: Number(v.nb_read_frames) / (n / d), audio: a ? { seconds: Number(a.duration) } : null };
}
const check = (name, actual, expected) => ({ name, actual, expected, ok: JSON.stringify(actual) === JSON.stringify(expected) });

// Writes shot.json next to the mp4 and prints one line. info = { scene, line, made, checks, expectFrames, size }.
function finish(id, info) {
  const mp4 = path.join(OUT, id, `${id}.mp4`), p = probe(mp4);
  const checks = [
    check("fps", p.fps, FPS),
    ...(info.size ? [check("size", [p.width, p.height], info.size)] : []),
    ...(info.expectFrames !== undefined ? [check("frames", p.frames, info.expectFrames)] : []),
    ...(info.checks || []),
  ];
  const shot = { id, scene: info.scene, scriptLines: info.line, frames: p.frames, fps: p.fps, size: [p.width, p.height], seconds: p.seconds, audio: p.audio, file: rel(mp4), bytes: fs.statSync(mp4).size, sha256: shaFile(mp4), madeFrom: { commit: HEAD, worktreeClean: CLEAN, ...info.made }, checks, allChecksOk: checks.every((c) => c.ok) };
  fs.writeFileSync(path.join(OUT, id, "shot.json"), JSON.stringify(shot, null, 2) + "\n");
  console.log(`${id}: ${p.seconds} s, ${p.width}x${p.height}, ${shot.bytes} bytes, sha256 ${shot.sha256.slice(0, 16)}, checks ${checks.filter((c) => c.ok).length}/${checks.length}${shot.allChecksOk ? "" : " FAILED: " + checks.filter((c) => !c.ok).map((c) => c.name).join(", ")}`);
  return shot;
}
const dirOf = (id) => { const d = path.join(OUT, id); fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); return d; };
const tmpDir = (id) => { const d = path.join(ROOT, "out", "footage-tmp", id); fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); return d; };
const dropTmp = (id) => fs.rmSync(path.join(ROOT, "out", "footage-tmp", id), { recursive: true, force: true });

function render(outPath, format) {
  const args = format === "png" ? `--format png-sequence -o ${JSON.stringify(path.relative(PREVIEW, outPath))}` : `-o ${JSON.stringify(path.relative(PREVIEW, outPath))}`;
  const r = spawnSync("bash", ["-c", `npx --yes hyperframes@0.8.134 render ${args}`], { cwd: PREVIEW, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`render failed: ${(r.stdout + r.stderr).slice(-1500)}`);
  return ((r.stdout + r.stderr).match(/rendered in [^\n]*/) || [""])[0].trim();
}
const hold = (png, mp4, seconds) => ffmpeg(["-loop", "1", "-framerate", String(FPS), "-i", png, "-t", String(seconds), "-r", String(FPS), ...X264, mp4]);

// Mouths read from the pixels of an mp4 (the frozen measuring code) against the mouths it should show.
function pixelMouthCheck(mp4, expected) {
  const frames = readClip(mp4, templates()).frames, got = frames.map((f) => f.mouth);
  const disagree = expected.map((m, k) => (m !== got[k] ? k : null)).filter((k) => k !== null);
  return [check("pixel mouths that disagree with the expected mouths", disagree.length, 0), check("frames read", got.length, expected.length)];
}

// Eyes and cursor read from pixels. Eyes: the bright pixels (green >= 128) in the eyes region, widened 80 px each side
// for head tilt: open eyes have 56315 such pixels in the art and closed eyes 17670, so above 36992 (the midpoint) is
// open; a count does not change when the head turns. Cursor: on when its region (widened 120 px for tilt) holds more
// than 500 red pixels (red >= 180, green < 140); nothing else on the face is red.
function readEyesCursor(mp4, offset = [0, 0]) {
  const eyes = rig.layers.find((l) => l.id === "eyes_open").region, cur = rig.layers.find((l) => l.id === "cursor").region;
  const even = (v) => v - (v % 2);
  const rd = (reg, px, py) => {
    // Even offsets and sizes: ffmpeg rounds odd crops of yuv420p video, which would shift every frame after the first.
    const x = even(reg[0] + AX - px + offset[0]), y = even(reg[1] + AY - py + offset[1]), w = even(reg[2] + 2 * px + 1), h = even(reg[3] + 2 * py + 1);
    const buf = execFileSync("ffmpeg", ["-v", "error", "-i", mp4, "-map", "0:v:0", "-fps_mode", "passthrough", "-vf", `crop=${w}:${h}:${x}:${y}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 30 });
    return { buf, w, h, n: buf.length / (w * h * 3) };
  };
  const E = rd(eyes, 80, 12), C = rd(cur, 120, 120), out = [];
  for (let k = 0; k < E.n; k++) {
    let bright = 0, red = 0;
    for (let q = 0; q < E.w * E.h; q++) if (E.buf[(k * E.w * E.h + q) * 3 + 1] >= 128) bright++;
    for (let q = 0; q < C.w * C.h; q++) { const o = (k * C.w * C.h + q) * 3; if (C.buf[o] >= 180 && C.buf[o + 1] < 140) red++; }
    out.push({ eyes: bright > 36992 ? "open" : "closed", cursor: red > 500, bright, red });
  }
  return out;
}

// Mouths read from pixels when the head is turned (the lines tilt up to 6 degrees for happy; the frozen measuring
// window assumes an upright head): every bright pixel (green >= 128) near the mouth is turned back by the frame's pose
// (head tilt about the pivot, head shift, the stage offset) into art pixels; those inside the mouth region give the
// bright box, classified against the same templates and distance as the measurement. Checks only; the measurement
// method (5332a8c) is unchanged.
// Sine and cosine as Taylor polynomials, plain arithmetic like lib/face-to-pose.mjs asinPoly (CLAUDE.md rule 5): for
// the |angle| <= 12 degrees (0.21 rad) the rig allows the error is under 1e-9, far below a pixel.
const sinPoly = (x) => { const x2 = x * x; return x * (1 - (x2 / 6) * (1 - (x2 / 20) * (1 - x2 / 42))); };
const cosPoly = (x) => { const x2 = x * x; return 1 - (x2 / 2) * (1 - (x2 / 12) * (1 - x2 / 30)); };
function readMouthsAtPoses(mp4, poses) {
  const [rx, ry, rw, rh] = rig.layers.find((l) => l.kind === "mouth").region, PAD = 100;
  const cx = rx + AX - PAD, cy = ry + AY - PAD, cw = rw + 2 * PAD, chh = rh + 2 * PAD;
  const buf = execFileSync("ffmpeg", ["-v", "error", "-i", mp4, "-map", "0:v:0", "-fps_mode", "passthrough", "-vf", `crop=${cw}:${chh}:${cx}:${cy}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 30 });
  const n = buf.length / (cw * chh * 3), tpl = templates(), [px, py] = rig.headPivot, out = [];
  if (!Number.isInteger(n)) throw new Error("the crop did not give whole frames");
  for (let k = 0; k < n; k++) {
    const h = poses[k].head, th = (-h.tilt * Math.PI) / 180, co = cosPoly(th), si = sinPoly(th);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, cnt = 0;
    for (let j = 0; j < chh; j++) for (let i = 0; i < cw; i++) {
      if (buf[((k * chh + j) * cw + i) * 3 + 1] < M.mouthPixels.greenAtLeast) continue;
      const sx = cx + i - AX - h.x - px, sy = cy + j - AY - h.y - py;
      const ax = Math.round(px + sx * co - sy * si), ay = Math.round(py + sx * si + sy * co);
      if (ax < rx || ay < ry || ax >= rx + rw || ay >= ry + rh) continue;
      cnt++; if (ax < x0) x0 = ax; if (ax > x1) x1 = ax; if (ay < y0) y0 = ay; if (ay > y1) y1 = ay;
    }
    const f = cnt ? { w: x1 - x0 + 1, h: y1 - y0 + 1, n: cnt } : { w: 0, h: 0, n: 0 };
    let best = null, dist = Infinity;
    for (const [m, t] of Object.entries(tpl)) { const d = Math.abs(f.w - t.w) + Math.abs(f.h - t.h); if (d < dist) { dist = d; best = m; } }
    out.push({ mouth: dist <= M.mouthPixels.maxDistance ? best : "unread", distance: dist, features: f });
  }
  return out;
}

// ---------------------------------------------------------------- A: wrap shots that exist
const WRAPS = {
  "v1-P2": { src: "out/lipsync-v1/P2.mp4", scene: "voice-and-lipsync-v1", line: [96, 97, 108], mouths: () => built("P2", "v1"), made: { version: "lip sync v1 (rig/lipsync-volume.json, frozen 3df3c97)", audio: "audio/dev/P2.mp3", seed: 1 } },
  "v1-v2-P2": { src: "out/lipsync-v2/P2-side-by-side.mp4", scene: "lipsync-v2", line: [115], size: [2 * SW, SH], made: { version: "v1 left, v2 right (frozen 3df3c97), labels drawn by code", audio: "audio/dev/P2.mp3", seed: 1 } },
  "v2-H2": { src: "out/lipsync-v2/H2.mp4", scene: "exam", line: [143, 144], mouths: () => built("H2", "v2"), made: { version: "lip sync v2 (frozen 3df3c97)", audio: "audio/dev/H2.mp3", seed: 1 } },
  "v3-H7": { src: "out/lipsync-v3/H7.mp4", scene: "fix", line: [180, 181], mouths: () => built("H7", "v3"), made: { version: "lip sync v3 (frozen 40ae504)", audio: "audio/dev/H7.mp3", seed: 1 } },
  "emotions-walkthrough": { src: "out/emotions-seed-1.mp4", scene: "emotions", line: [195], frames: 300, made: { version: "rig/emotions.json as of f4a3f98 (focused removed, happy tilt 6), demoMarks", seed: 1, from: "out/render/emotions-seed-1-run-1 (300 of 300 frames identical to run 2, DEVLOG prompt #20)" } },
};
function built(p, v) {
  const d = decode(path.join(ROOT, "audio", "dev", `${p}.mp3`)), n = frameCount(d.samples.length, d.sampleRate, FPS);
  const al = read(`audio/raw/${p}.align.json`).alignment;
  const m = v === "v1" ? lipsyncVolume(d.samples, d.sampleRate, FPS, read("rig/lipsync-volume.json")).mouths : v === "v2" ? lipsyncText(al, FPS, V2, n).mouths : lipsyncV3(al, FPS, V3, n).mouths;
  return [...m, ...new Array(15).fill("rest")];
}
function wrap(id) {
  const w = WRAPS[id], src = path.join(ROOT, w.src), d = dirOf(id), dst = path.join(d, `${id}.mp4`);
  fs.copyFileSync(src, dst);
  const mouths = w.mouths ? w.mouths() : null;
  return finish(id, { scene: w.scene, line: w.line, size: w.size || [SW, SH], expectFrames: mouths ? mouths.length : w.frames, made: { files: [w.src], copiedUnchanged: true, ...w.made },
    checks: [check("sha256 equals the source", shaFile(dst), shaFile(src)), ...(mouths ? pixelMouthCheck(dst, mouths) : [])] });
}

// The two 300-frame liveness renders (out/render/liveness-seed-1-run-N, prompt #16): side by side, alone, and next to
// the still neutral pose. Their frames are deleted afterwards (the per-frame sha256 lists stay).
function livenessShots() {
  const r1 = "out/render/liveness-seed-1-run-1", r2 = "out/render/liveness-seed-1-run-2";
  if (!fs.existsSync(path.join(ROOT, r1, "frame_000001.png"))) throw new Error(`${r1} has no frames`);
  const shaList = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(".png")).sort().map((f) => shaFile(path.join(ROOT, dir, f)));
  const s1 = shaList(r1), s2 = shaList(r2), same = s1.filter((h, i) => h === s2[i]).length;
  const made = { files: [r1, r2], seed: 1, version: "rig/liveness.json, rendered at e2a7f56 (prompt #16 stage renders)" };
  const shots = [];
  let d = dirOf("liveness-two-renders");
  ffmpeg(["-framerate", String(FPS), "-i", `${r1}/frame_%06d.png`, "-framerate", String(FPS), "-i", `${r2}/frame_%06d.png`, "-filter_complex", "[0:v][1:v]hstack=inputs=2[v]", "-map", "[v]", ...X264, rel(path.join(d, "liveness-two-renders.mp4"))]);
  shots.push(finish("liveness-two-renders", { scene: "alive", line: [85, 86], size: [2 * SW, SH], expectFrames: 300, made: { ...made, layout: "run 1 left, run 2 right" }, checks: [check("frames identical by sha256 between the two renders", same, 300), check("frames per render", [s1.length, s2.length], [300, 300])] }));
  d = dirOf("liveness");
  ffmpeg(["-framerate", String(FPS), "-i", `${r1}/frame_%06d.png`, ...X264, rel(path.join(d, "liveness.mp4"))]);
  shots.push(finish("liveness", { scene: "hook, alive", line: [10, 13, 78], size: [SW, SH], expectFrames: 300, made }));
  d = dirOf("still-alive-split");
  const still = "out/render/reconstruction/frame_000001.png";
  ffmpeg(["-loop", "1", "-framerate", String(FPS), "-i", still, "-framerate", String(FPS), "-i", `${r1}/frame_%06d.png`, "-filter_complex", "[0:v][1:v]hstack=inputs=2:shortest=1[v]", "-map", "[v]", "-frames:v", "300", ...X264, rel(path.join(d, "still-alive-split.mp4"))]);
  const eyes = readEyesCursor(path.join(d, "still-alive-split.mp4"), [SW, 0]), eyesL = readEyesCursor(path.join(d, "still-alive-split.mp4"));
  const expect = Array.from({ length: 300 }, (_, f) => livenessAt(LC, 1, f, FPS).eyes === "closed" ? "closed" : "open");
  shots.push(finish("still-alive-split", { scene: "alive, hook", line: [10, 78, 79], size: [2 * SW, SH], expectFrames: 300, made: { ...made, still: `${still} (neutral pose, brows hidden: the step 2 reconstruction render at e2a7f56)`, layout: "still left, alive right, silent, 10 s" },
    checks: [check("left eyes open on every frame (pixels)", eyesL.filter((e) => e.eyes === "open").length, 300), check("right eyes from pixels that disagree with the liveness schedule", eyes.filter((e, k) => e.eyes !== expect[k]).length, 0)] }));
  for (const r of [r1, r2]) fs.rmSync(path.join(ROOT, r), { recursive: true, force: true });
  return shots;
}

// ---------------------------------------------------------------- B1: v3 on H2, v2 | v3 on H2
function v3H2() {
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "lipsync-clips.mjs"), "--seed", "1", "--method", "v3", "H2"], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  const s = spawnSync(process.execPath, [path.join(ROOT, "scripts", "side-by-side.mjs"), "--left", "v2", "--right", "v3", "H2"], { cwd: ROOT, encoding: "utf8" });
  if (s.status !== 0) throw new Error(s.stderr);
  const out = [];
  let d = dirOf("v3-H2");
  fs.copyFileSync(path.join(ROOT, "out", "lipsync-v3", "H2.mp4"), path.join(d, "v3-H2.mp4"));
  const al = read("audio/raw/H2.align.json").alignment, m = built("H2", "v3");
  const frames = readClip(path.join(d, "v3-H2.mp4"), templates()).frames.map((f) => ({ t: f.t, mouth: f.mouth }));
  const c = closureScore(al, frames, FPS);
  out.push(finish("v3-H2", { scene: "fix", line: [170, 174], size: [SW, SH], expectFrames: m.length, made: { version: "lip sync v3 (frozen 40ae504)", audio: "audio/dev/H2.mp3", alignment: "audio/raw/H2.align.json", seed: 1, command: "npm run lipsync:clips -- --seed 1 --method v3 H2" },
    checks: [...pixelMouthCheck(path.join(d, "v3-H2.mp4"), m), check("closures from the pixels (m, b, p with a rest frame in the letter's span)", `${c.hits} of ${c.of}`, "11 of 11")] }));
  d = dirOf("v2-v3-H2");
  fs.copyFileSync(path.join(ROOT, "out", "lipsync-v3", "H2-v2-v3.mp4"), path.join(d, "v2-v3-H2.mp4"));
  out.push(finish("v2-v3-H2", { scene: "fix", line: [170], size: [2 * SW, SH], expectFrames: m.length, made: { version: "v2 left (frozen 3df3c97), v3 right (frozen 40ae504), labels drawn by code", audio: "audio/dev/H2.mp3", seed: 1, command: "npm run side-by-side -- --left v2 --right v3 H2" } }));
  return out;
}

// ---------------------------------------------------------------- B3: a frame with the measured mouth region
function mouthRegion() {
  const src = path.join(ROOT, "out", "lipsync-v2", "H2.mp4"), frames = readClip(src, templates()).frames;
  const k = frames.findIndex((f) => f.mouth === "round");
  const tmp = tmpDir("mouth-region"), png = path.join(tmp, "frame.png");
  ffmpeg(["-i", rel(src), "-vf", `select=eq(n\\,${k}),drawbox=x=${WINDOW.x}:y=${WINDOW.y}:w=${WINDOW.w}:h=${WINDOW.h}:color=0xffe000:t=6`, "-frames:v", "1", rel(png)]);
  const d = dirOf("mouth-region");
  hold(png, path.join(d, "mouth-region.mp4"), 5);
  dropTmp("mouth-region");
  return finish("mouth-region", { scene: "exam, retro", line: [151, 152, 245], size: [SW, SH], expectFrames: 150, made: { files: ["out/lipsync-v2/H2.mp4"], frame: k, frameRule: "the first frame of v2-H2 whose mouth reads as round", outline: `the measuring window (MEASUREMENT.md 2, scripts/measure.mjs WINDOW) x ${WINDOW.x}, y ${WINDOW.y}, ${WINDOW.w} x ${WINDOW.h}, drawn 6 px wide in yellow`, holdSeconds: 5 },
    checks: [check("mouth read at that frame", frames[k].mouth, "round"), check("draw list's mouth at that frame", built("H2", "v2")[k], "round"), check("window", [WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h], [550, 892, 500, 294])] });
}

// ---------------------------------------------------------------- B4: word strips
const mouthLayerCache = {};
function mouthCrop(mouth) {
  if (mouthLayerCache[mouth]) return mouthLayerCache[mouth];
  const head = readPng(path.join(ROOT, rig.layers.find((l) => l.kind === "head").file)).img, l = rig.layers.find((x) => x.kind === "mouth" && x.value === mouth);
  const img = create(head.width, head.height, [0, 0, 0, 255]);
  over(img, head, 0, 0);
  over(img, readPng(path.join(ROOT, l.file)).img, 0, l.anchorDy);
  const [rx, ry, rw, rh] = l.region, crop = create(rw, rh, [0, 0, 0, 255]);
  for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) for (let c = 0; c < 4; c++) crop.data[(j * rw + i) * 4 + c] = img.data[((ry + j) * img.width + rx + i) * 4 + c];
  return (mouthLayerCache[mouth] = crop);
}
// One strip: rows = [{ label, mouths }] for frames f0..f1 of the phrase, letters from the alignment under each row.
function strip(id, phrase, word0, word1, rows, info) {
  const al = read(`audio/raw/${phrase}.align.json`).alignment, words = wordsOf(al);
  const a = words.findIndex((w) => w.word === word0), b = words.findIndex((w, i) => i >= a && w.word === word1);
  const t0 = words[a].start, t1 = words[b].end, f0 = Math.floor(t0 * FPS), f1 = Math.ceil(t1 * FPS) - 1, n = f1 - f0 + 1;
  const W = 1920, H = 1080, L = 40, cell = Math.min(220, Math.floor((W - 2 * L) / n)), ch = Math.round((cell * 294) / 500);
  const img = create(W, H, [0, 0, 0, 255]), INK = [230, 230, 236, 255], DIM = [140, 140, 150, 255], RED = [255, 60, 80, 255];
  drawText(img, `${info.title} - ${phrase}, FRAMES ${f0} TO ${f1} AT 30 FPS`, L, 30, 3, INK);
  const rowH = Math.floor((H - 90) / rows.length), checks = [];
  rows.forEach((r, ri) => {
    const y = 90 + ri * rowH;
    drawText(img, r.label, L, y, 2, INK);
    for (let f = f0; f <= f1; f++) {
      const x = L + (f - f0) * cell;
      over(img, resample(mouthCrop(r.mouths[f]), cell - 4, ch - 2), x + 2, y + 24);
      drawText(img, String(f), x + 2, y + 28 + ch, cell >= 60 ? 2 : 1, DIM);
    }
    // Letters under the row, each as a bar over its aligned span, staggered in three lines.
    const ly = y + 52 + ch;
    al.characters.forEach((c, k) => {
      const s = al.character_start_times_seconds[k], e = al.character_end_times_seconds[k];
      if (s < t0 - 1e-9 || e > t1 + 1e-9 || c === " ") return;
      const xa = L + Math.round((s * FPS - f0) * cell), xb = L + Math.round((e * FPS - f0) * cell), lane = k % 3;
      fillRect(img, xa, ly + lane * 34, Math.max(2, xb - xa - 2), 3, INK);
      drawText(img, `${c} ${s.toFixed(3)}`, xa, ly + 6 + lane * 34, cell >= 60 ? 2 : 1, INK);
    });
    if (r.markMissed) {
      const missed = closureScore(al, r.mouths.map((mouth, f) => ({ t: f / FPS, mouth })), FPS).letters.filter((x) => !x.hit && x.start >= t0 - 1e-9 && x.end <= t1 + 1e-9);
      for (const m of missed) {
        const fa = Math.floor(m.start * FPS), fb = Math.ceil(m.end * FPS) - 1;
        for (let f = Math.max(f0, fa); f <= Math.min(f1, fb); f++) {
          const x = L + (f - f0) * cell;
          for (const [rx, ry, rw, rh] of [[x, y + 20, cell, 4], [x, y + 24 + ch, cell, 4], [x, y + 20, 4, ch + 8], [x + cell - 4, y + 20, 4, ch + 8]]) fillRect(img, rx, ry, rw, rh, RED);
        }
        drawText(img, `MISSED ${m.letter.toUpperCase()}`, L + (Math.floor(m.start * FPS) - f0) * cell, y + ch + 152, 2, RED);
      }
      checks.push(check(`missed closures marked in "${r.label}"`, missed.length, r.expectMissed));
    }
  });
  const tmp = tmpDir(id), png = path.join(tmp, "strip.png");
  writePng(png, img);
  const d = dirOf(id);
  hold(png, path.join(d, `${id}.mp4`), 6);
  dropTmp(id);
  return finish(id, { scene: info.scene, line: info.line, size: [W, H], expectFrames: 180, checks, made: { phrase, audio: `audio/dev/${phrase}.mp3`, alignment: `audio/raw/${phrase}.align.json`, words: `${word0} .. ${word1}`, frames: [f0, f1], rows: rows.map((r) => ({ label: r.label, rules: r.rules, mouths: r.mouths.slice(f0, f1 + 1).join(" ") })), layers: "head with each mouth layer at its anchorDy, the mouth region cut out and scaled to the cell (art pixels, no redrawing)", holdSeconds: 6, note: "on the River audio the video uses; the author first saw these words in prompts #16-#17" } });
}
function strips() {
  const P2 = read("audio/raw/P2.align.json").alignment, H2 = read("audio/raw/H2.align.json").alignment;
  const nOf = (p) => { const d = decode(path.join(ROOT, "audio", "dev", `${p}.mp3`)); return frameCount(d.samples.length, d.sampleRate, FPS); };
  const v2With = (commit, al, n) => lipsyncText(al, FPS, gitJson(commit, "rig/lipsync-text.json"), n).mouths;
  const nP2 = nOf("P2"), nH2 = nOf("H2");
  return [
    strip("strip-moves", "P2", "moves", "moves", [
      { label: "V2 BEFORE THE MAJORITY RULE (RULES OF E2A7F56)", rules: "git show e2a7f56:rig/lipsync-text.json", mouths: v2With("e2a7f56", P2, nP2) },
      { label: "V2 AFTER (FROZEN 3DF3C97)", rules: "rig/lipsync-text.json (frozen 3df3c97)", mouths: lipsyncText(P2, FPS, V2, nP2).mouths },
    ], { title: "MOVES", scene: "lipsync-v2", line: [134, 135, 136, 137] }),
    strip("strip-My", "P2", "My", "My", [
      { label: "BEFORE THE PROMPT 16 RULES (RULES OF 0B9EFEF)", rules: "git show 0b9efef:rig/lipsync-text.json", mouths: v2With("0b9efef", P2, nP2) },
      { label: "AFTER (RULES OF E2A7F56)", rules: "git show e2a7f56:rig/lipsync-text.json", mouths: v2With("e2a7f56", P2, nP2) },
    ], { title: "MY", scene: "lipsync-v2", line: [130, 131] }),
    strip("strip-loud", "P2", "loud", "loud", [
      { label: "BEFORE THE PROMPT 16 RULES (RULES OF 0B9EFEF)", rules: "git show 0b9efef:rig/lipsync-text.json", mouths: v2With("0b9efef", P2, nP2) },
      { label: "AFTER (RULES OF E2A7F56)", rules: "git show e2a7f56:rig/lipsync-text.json", mouths: v2With("e2a7f56", P2, nP2) },
    ], { title: "LOUD", scene: "lipsync-v2", line: [132, 133] }),
    strip("strip-bob", "H2", "Bob", "big", [
      { label: "V2 (FROZEN 3DF3C97)", rules: "rig/lipsync-text.json", mouths: lipsyncText(H2, FPS, V2, nH2).mouths, markMissed: true, expectMissed: 3 },
      { label: "V3 (FROZEN 40AE504)", rules: "rig/lipsync-v3.json", mouths: lipsyncV3(H2, FPS, V3, nH2).mouths, markMissed: true, expectMissed: 0 },
    ], { title: "BOB BROUGHT A BIG", scene: "exam, fix", line: [157, 158, 173, 174] }),
  ];
}

// ---------------------------------------------------------------- B5, B6: still sheets rendered through the rig
function renderPoses(id, poses) {
  const tmp = tmpDir(id);
  buildPreview("poses", undefined, posesSequence(poses, id, 1));
  render(path.join(tmp, "frames"), "png");
  return poses.map((_, i) => readPng(path.join(tmp, "frames", `frame_${String(i + 1).padStart(6, "0")}.png`)).img);
}
function sheet(id, imgs, labels, info) {
  const W = 1920, H = 1080, GAP = 16, cell = Math.floor((W - GAP * (imgs.length + 1)) / imgs.length), img = create(W, H, [0, 0, 0, 255]);
  const y = Math.floor((H - cell - (labels ? 40 : 0)) / 2);
  imgs.forEach((im, i) => {
    over(img, resample(im, cell, cell), GAP + i * (cell + GAP), y);
    if (labels) drawText(img, labels[i], GAP + i * (cell + GAP) + Math.floor((cell - textWidth(labels[i], 3)) / 2), y + cell + 12, 3, [230, 230, 236, 255]);
  });
  const png = path.join(ROOT, "out", "footage-tmp", id, "sheet.png");
  writePng(png, img);
  const d = dirOf(id);
  hold(png, path.join(d, `${id}.mp4`), 5);
  dropTmp(id);
  return finish(id, { ...info, size: [W, H], expectFrames: 150 });
}
function oldEmotionsSheet() {
  const old = gitJson("9f9b04d", "rig/emotions.json"), names = ["neutral", ...Object.keys(old.states)];
  const poses = names.map((s) => (s === "neutral" ? neutralPose(rig) : combine(rig, neutralPose(rig), old.states[s].partial)));
  return sheet("emotions-sheet-focused", renderPoses("emotions-sheet-focused", poses), names.map((s) => s.toUpperCase()), { scene: "emotions", line: [203, 204],
    checks: [check("states", names, ["neutral", "happy", "surprised", "focused", "sleepy"]), check("focused as it was is what rig/emotions.json keeps in removedByEye", old.states.focused.partial, EC.removedByEye.focused.partial), check("happy's tilt as it was", old.states.happy.partial.head.tilt, 2)],
    made: { files: ["git show 9f9b04d:rig/emotions.json (before focused was removed in f4a3f98)"], note: "restored into out/footage only; rig/emotions.json untouched", holdSeconds: 5 } });
}
function mouthsRow() {
  const order = ["rest", "small", "open", "round", "wide"], poses = order.map((m) => ({ ...neutralPose(rig), mouth: m }));
  return sheet("mouths-row", renderPoses("mouths-row", poses), null, { scene: "two-words", line: [38, 39], checks: [check("order, left to right", order, ["rest", "small", "open", "round", "wide"])], made: { poses: "the neutral pose with each mouth", note: "no labels (the edit adds them)", holdSeconds: 5 } });
}

// ---------------------------------------------------------------- C1: Ping's six lines
function lines() {
  const L = read("rig/lines.json"), S = read("audio/SOURCES.json"), out = [];
  for (const [id, line] of Object.entries(L.lines)) {
    const src = S.lineFiles.find((f) => f.id === id), al = read(`audio/raw/line-${id}.align.json`).alignment;
    const d0 = decode(path.join(ROOT, "audio", "dev", `line-${id}.mp3`)), n = frameCount(d0.samples.length, d0.sampleRate, FPS);
    const mouths = lipsyncV3(al, FPS, V3, n).mouths, span = speechSpan(al, FPS), marks = marksFromAlignment(src.tags, al, FPS);
    const tail = line.tailSeconds ? line.tailSeconds * FPS : L.tailFrames, frames = n + tail, spec = { seed: L.livenessSeed, marks, mouths, span };
    const sid = `line-${id}`, d = dirOf(sid), video = path.join(ROOT, "out", "footage-tmp", sid, "video.mp4");
    tmpDir(sid);
    buildPreview("line", undefined, lineSequence(id, spec, frames));
    const took = render(video, "mp4");
    const mp4 = path.join(d, `${sid}.mp4`);
    ffmpeg(["-i", rel(video), "-i", `audio/dev/line-${id}.mp3`, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "copy", rel(mp4)]);
    dropTmp(sid);
    const poses = Array.from({ length: frames }, (_, f) => linePose(rig, LC, EC, spec, f, FPS));
    const ec = readEyesCursor(mp4);
    const seen = readMouthsAtPoses(mp4, poses), dis = seen.map((r, f) => (r.mouth !== poses[f].mouth ? f : null)).filter((f) => f !== null);
    const checks = [check("pixel mouths (turned back by the pose) that disagree with the pose", dis.length, 0), check("largest distance to the chosen template (px)", Math.max(...seen.map((r) => r.distance)) <= M.mouthPixels.maxDistance, true), check("eyes from pixels that disagree with the pose", ec.filter((e, f) => e.eyes !== poses[f].eyes).length, 0), check("cursor from pixels that disagrees with the pose", ec.filter((e, f) => e.cursor !== poses[f].cursor).length, 0)];
    const c = closureScore(al, seen.map((r, f) => ({ t: f / FPS, mouth: r.mouth })), FPS);
    if (c.of) checks.push(check("closures from the pixels", `${c.hits} of ${c.of}`, `${c.of} of ${c.of}`));
    if (id === "outro") {
      const tailF = ec.slice(n);
      checks.push(check("outro tail: frames with the eyes shut (pixels)", tailF.filter((e) => e.eyes === "closed").length, tail), check("outro tail: the cursor both on and off (pixels)", [tailF.some((e) => e.cursor), tailF.some((e) => !e.cursor)], [true, true]));
    }
    out.push(finish(sid, { scene: { hook: "hook", alive: "alive", fix: "fix", emotions: "emotions", webcam: "webcam", outro: "outro" }[id], line: [line.scriptLine], size: [SW, SH], expectFrames: frames, checks,
      made: { text: line.text, sent: src.text, audio: `audio/dev/line-${id}.mp3`, raw: src.file, alignment: `audio/raw/line-${id}.align.json`, voice: `${src.voiceName} (${src.voiceId})`, lipSync: "v3 (frozen 40ae504)", combine: "lib/line.mjs (committed 198255c before rendering)", emotion: marks, seed: L.livenessSeed, audioFrames: n, tailFrames: tail, render: took } }));
  }
  return out;
}

// ---------------------------------------------------------------- C2: blink comparison
function blinkCompare() {
  const N = 600, steady = Array.from({ length: N }, (_, f) => (f >= 60 && (f - 60) % 120 < 4 ? "closed" : "open"));
  const real = Array.from({ length: N }, (_, f) => (livenessAt(LC, 1, f, FPS).eyes === "closed" ? "closed" : "open"));
  const starts = (e) => e.map((x, f) => (x === "closed" && (f === 0 || e[f - 1] !== "closed") ? f : null)).filter((f) => f !== null);
  const tmp = tmpDir("blink-compare");
  const vids = [["left", steady], ["right", real]].map(([side, eyes]) => {
    buildPreview("poses", undefined, posesSequence(eyes.map((e) => ({ ...neutralPose(rig), eyes: e })), `blink-${side}`, FPS));
    const v = path.join(tmp, `${side}.mp4`);
    render(v, "mp4");
    return v;
  });
  // The ruler: 0 to 20 s under each Ping, a tick every second, a red mark at each blink start; a white playhead moves.
  const ruler = create(2 * SW, SH, [0, 0, 0, 0]), RX = 100, RW = 1400, RY = 1440, INK = [200, 200, 210, 255], RED = [255, 60, 80, 255];
  for (const [side, eyes] of [[0, steady], [1, real]]) {
    const ox = side * SW;
    fillRect(ruler, ox + RX, RY, RW, 3, INK);
    for (let s = 0; s <= 20; s++) { const x = ox + RX + Math.round((s / 20) * RW); fillRect(ruler, x, RY - (s % 5 ? 8 : 16), 2, s % 5 ? 8 : 16, INK); if (s % 5 === 0) drawText(ruler, `${s}S`, x - 8, RY + 14, 3, INK); }
    for (const f of starts(eyes)) fillRect(ruler, ox + RX + Math.round((f / N) * RW) - 3, RY - 40, 6, 36, RED);
  }
  writePng(path.join(tmp, "ruler.png"), ruler);
  writePng(path.join(tmp, "playhead.png"), create(4, 70, [255, 255, 255, 255]));
  const d = dirOf("blink-compare"), mp4 = path.join(d, "blink-compare.mp4"), px = (ox) => `${ox + RX}+t/20*${RW}-2`;
  ffmpeg(["-i", rel(vids[0]), "-i", rel(vids[1]), "-i", rel(path.join(tmp, "ruler.png")), "-loop", "1", "-i", rel(path.join(tmp, "playhead.png")),
    "-filter_complex", `[0:v][1:v]hstack=inputs=2[s];[s][2:v]overlay=0:0[r];[r][3:v]overlay=x='${px(0)}':y=${RY - 50}:shortest=1[p];[p][3:v]overlay=x='${px(SW)}':y=${RY - 50}:shortest=1[v]`,
    "-map", "[v]", "-frames:v", String(N), ...X264, rel(mp4)]);
  dropTmp("blink-compare");
  const eL = readEyesCursor(mp4), eR = readEyesCursor(mp4, [SW, 0]);
  return finish("blink-compare", { scene: "alive", line: [82, 83], size: [2 * SW, SH], expectFrames: N,
    checks: [check("left blinks (starts)", starts(steady), [60, 180, 300, 420, 540]), check("left eyes from pixels that disagree", eL.filter((e, f) => e.eyes !== steady[f]).length, 0), check("right eyes from pixels that disagree with seed 1", eR.filter((e, f) => e.eyes !== real[f]).length, 0)],
    made: { left: "a blink every 4 s: eyes shut for 4 frames (0.133 s, inside the rule's 0.10-0.15 s) from frame 60, every 120 frames (chosen)", right: "rig/liveness.json blinks for seed 1, eyes only (no breathing, drift or cursor blink on either side, so the two differ only in blink timing; chosen)", rightBlinkStarts: starts(real), ruler: "drawn by code: 0-20 s, a tick each second, a red mark at each blink start, a moving white playhead", seed: 1 } });
}

// ---------------------------------------------------------------- C3: the skeleton while the head sways
function skeletonSway() {
  const N = 180, ss = (x) => x * x * x * (x * (x * 6 - 15) + 10);
  const keys = [[0, 0], [45, 8], [135, -8], [179, 0]];
  const tiltAt = (f) => { for (let i = 1; i < keys.length; i++) if (f <= keys[i][0]) { const [fa, a] = keys[i - 1], [fb, b] = keys[i]; return a + (b - a) * ss((f - fa) / (fb - fa)); } return 0; };
  const poses = Array.from({ length: N }, (_, f) => ({ ...neutralPose(rig), head: { tilt: tiltAt(f), x: 0, y: 0 } }));
  const d = dirOf("skeleton-sway");
  buildPreview("poses", undefined, posesSequence(poses, "skeleton-sway", FPS, { skeleton: true }));
  render(path.join(d, "skeleton-sway.mp4"), "mp4");
  return finish("skeleton-sway", { scene: "layers-and-rig, hook", line: [15, 68, 74], size: [SW, SH], expectFrames: N, checks: [check("largest |tilt| (degrees) inside the 12 degree limit", Math.max(...poses.map((p) => Math.abs(p.head.tilt))), 8)],
    made: { poses: "neutral; head tilt 0 → 8 → −8 → 0 degrees over 6 s, smootherstep between keys at frames 0, 45, 135, 179 (chosen)", skeleton: "rig/adapter.js drawSkeleton: region boxes, pivots, lines to parents, the smile line" } });
}

// ---------------------------------------------------------------- C4: layers apart and back
function layersApart() {
  const N = 180, ss = (x) => x * x * x * (x * (x * 6 - 15) + 10);
  const neutral = new Set(["glow", "head", "cursor", "eyes_open", "mouth_rest"]), PAD = 10;
  const ownDy = (l) => (l.kind === "mouth" ? l.anchorDy : l.kind === "brows" ? rig.browsRest.browsRestDy : 0);
  const boxes = Object.fromEntries(rig.layers.map((l) => { const b = alphaBBox(readPng(path.join(ROOT, l.file)).img); return [l.id, [b.x + AX, b.y + AY + ownDy(l), b.w, b.h]]; }));
  // Where each box goes (stage pixels, the box's top-left; chosen so that every checkerboard stays outside the glow's
  // box and inside the stage): features above, mouths below, the round mouth right, the cursor left.
  const target = { eyes_open: [40, 40], eyes_closed: [660, 40], brows: [660, 140], cursor: [100, 700], mouth_round: [1340, 700], mouth_rest: [48, 1400], mouth_small: [390, 1400], mouth_open: [734, 1400], mouth_wide: [1064, 1400] };
  const plan = Array.from({ length: N }, (_, f) => {
    const p = f < 15 ? 0 : f < 60 ? ss((f - 15) / 45) : f < 120 ? 1 : f < 165 ? 1 - ss((f - 120) / 45) : 0;
    const fade = f < 15 || f >= 165 ? 0 : f < 24 ? (f - 15) / 9 : f >= 156 ? (165 - f) / 9 : 1;
    return rig.layers.map((l) => {
      const [bx, by, bw, bh] = boxes[l.id], t = target[l.id];
      const dx = t ? Math.round((t[0] - bx) * p) : 0, dy = t ? Math.round((t[1] - by) * p) : 0;
      const opacity = neutral.has(l.id) ? 1 : fade;
      return { id: l.id, file: l.file, x: AX + dx, y: AY + ownDy(l) + dy, opacity, checker: l.kind === "glow" ? null : [bx + dx - PAD, by + dy - PAD, bw + 2 * PAD, bh + 2 * PAD, 16], checkerAlpha: p };
    });
  });
  const apart = plan[90].filter((it) => it.checker), inStage = apart.every((it) => it.checker[0] >= 0 && it.checker[1] >= 0 && it.checker[0] + it.checker[2] <= SW && it.checker[1] + it.checker[3] <= SH);
  const overlap = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
  const pairs = []; for (let i = 0; i < apart.length; i++) for (let j = i + 1; j < apart.length; j++) if (overlap(apart[i].checker, apart[j].checker)) pairs.push(`${apart[i].id}/${apart[j].id}`);
  const d = dirOf("layers-apart");
  buildPreview("cutout", undefined, cutoutSequence("layers-apart", plan, FPS));
  render(path.join(d, "layers-apart.mp4"), "mp4");
  const ec = readEyesCursor(path.join(d, "layers-apart.mp4"));
  return finish("layers-apart", { scene: "layers-and-rig, retro", line: [50, 55, 241], size: [SW, SH], expectFrames: N,
    checks: [check("checkerboards inside the stage when apart", inStage, true), check("checkerboards that overlap when apart", pairs, []), check("every move is whole pixels", plan.every((fr) => fr.every((it) => Number.isInteger(it.x) && Number.isInteger(it.y))), true), check("first and last frame: the neutral face (eyes open from pixels)", [ec[0].eyes, ec[N - 1].eyes], ["open", "open"])],
    made: { layers: "art/layers/*.png, drawn unscaled at whole-pixel positions; only moved", timeline: "together 0.5 s, apart 1.5 s (smootherstep), held 2 s, back 1.5 s, together 0.5 s; the layers not in the neutral face fade in and out over 9 frames while moving (chosen)", targets: target, checkerboard: `behind every layer but the glow while apart, ${PAD} px around its alpha box, 16 px cells, opacity following the move`, headAndGlow: "stay in place" } });
}

// ---------------------------------------------------------------- the contact sheet
function contactSheet() {
  const ids = fs.readdirSync(OUT).filter((d) => fs.existsSync(path.join(OUT, d, "shot.json"))).sort();
  const CH = 180, GAP = 10, LABEL = 300, rows = [];
  const tmp = tmpDir("contact-sheet");
  for (const id of ids) {
    const s = JSON.parse(fs.readFileSync(path.join(OUT, id, "shot.json"), "utf8")), cw = Math.round((CH * s.size[0]) / s.size[1]);
    const cells = [0, Math.floor((s.frames - 1) / 2), s.frames - 1].map((k, i) => {
      const png = path.join(tmp, `${id}-${i}.png`);
      ffmpeg(["-i", s.file, "-vf", `select=eq(n\\,${k}),scale=${cw}:${CH}`, "-frames:v", "1", rel(png)]);
      return { k, img: readPng(png).img };
    });
    rows.push({ id, s, cells, cw });
  }
  const W = LABEL + Math.max(...rows.map((r) => 3 * (r.cw + GAP))) + GAP, H = rows.length * (CH + GAP + 24) + 60;
  const img = create(W, H, [16, 16, 20, 255]), INK = [230, 230, 236, 255];
  drawText(img, "PING FOOTAGE - FIRST, MIDDLE AND LAST FRAME OF EVERY SHOT", GAP, 18, 3, INK);
  rows.forEach((r, i) => {
    const y = 60 + i * (CH + GAP + 24);
    drawText(img, r.id, GAP, y + 10, 2, INK);
    drawText(img, `${r.s.seconds.toFixed(2)} S ${r.s.size[0]}X${r.s.size[1]}`, GAP, y + 40, 2, INK);
    drawText(img, r.s.allChecksOk ? "CHECKS OK" : "CHECKS FAILED", GAP, y + 70, 2, r.s.allChecksOk ? [120, 220, 140, 255] : [255, 60, 80, 255]);
    r.cells.forEach((c, j) => { const x = LABEL + j * (r.cw + GAP); over(img, c.img, x, y); drawText(img, `FRAME ${c.k}`, x, y + CH + 4, 2, INK); });
  });
  const w = writePng(path.join(OUT, "contact-sheet.png"), img);
  dropTmp("contact-sheet");
  console.log(`out/footage/contact-sheet.png ${W}x${H} sha256 ${w.sha256}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const want = process.argv.slice(2), all = !want.length, on = (k) => all || want.includes(k);
  fs.mkdirSync(OUT, { recursive: true });
  for (const id of Object.keys(WRAPS)) if (on("wrap") || on(id)) wrap(id);
  if (on("liveness")) livenessShots();
  if (on("v3-H2")) v3H2();
  if (on("mouth-region")) mouthRegion();
  if (on("strips")) strips();
  if (on("emotions-sheet-focused")) oldEmotionsSheet();
  if (on("mouths-row")) mouthsRow();
  if (on("lines")) lines();
  if (on("blink-compare")) blinkCompare();
  if (on("skeleton-sway")) skeletonSway();
  if (on("layers-apart")) layersApart();
  if (on("sheet") || all) contactSheet();
  fs.rmSync(path.join(ROOT, "out", "footage-tmp"), { recursive: true, force: true });
}

// The measurement (MEASUREMENT.md, author's prompt #17), on the finished mp4 of each clip: its video frames and its
// audio track are both decoded from that one file. Mouth per frame from the pixels of the mouth region; acoustic onsets
// and ends from the loudness of the mp4's own audio; onset and end offsets, closure score, changes per second.
// With --check-drawlist (P1-P3) each frame's pixel mouth is compared with the mouth the clip was built from.
//
//   npm run measure -- P1 P2 P3 --check-drawlist      out/measure/<phrase>-<v1|v2>.json and out/measure/report.txt
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "../lib/audio.mjs";
import { create, over } from "../lib/image.mjs";
import { lipsyncText } from "../lib/lipsync-text.mjs";
import { frameCount, lipsyncVolume } from "../lib/lipsync-volume.mjs";
import { brightFeatures, changesTable, classifyMouth, closureScore, offsets, soundSegments, summary, wordsOf } from "../lib/measure.mjs";
import { readPng, sha256 } from "../lib/png.mjs";
import { ROOT, rel } from "../lib/spec.mjs";

export const M = JSON.parse(fs.readFileSync(path.join(ROOT, "measurement.json"), "utf8"));
const rig = JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "rig.json"), "utf8"));
const MOUTHS = rig.layers.filter((l) => l.kind === "mouth");
const [rx, ry, rw, rh] = MOUTHS[0].region;
if (MOUTHS.some((l) => l.region.join() !== MOUTHS[0].region.join())) throw new Error("the mouths do not share one region");
export const WINDOW = { x: rx + rig.stage.artOffset[0], y: ry + rig.stage.artOffset[1], w: rw, h: rh };

const rgbOf = (img, x, y, w, h) => {
  const out = new Uint8Array(w * h * 3);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) for (let c = 0; c < 3; c++) out[(j * w + i) * 3 + c] = img.data[((y + j) * img.width + x + i) * 4 + c];
  return out;
};

// Templates from the art itself (not from the draw list): the head layer with one mouth layer over it, moved by its
// anchorDy, flattened on black, the mouth window cut out.
export function templates() {
  const head = readPng(path.join(ROOT, rig.layers.find((l) => l.kind === "head").file)).img, out = {};
  for (const l of MOUTHS) {
    const img = create(head.width, head.height, [0, 0, 0, 255]);
    over(img, head, 0, 0);
    over(img, readPng(path.join(ROOT, l.file)).img, 0, l.anchorDy);
    out[l.value] = brightFeatures(rgbOf(img, rx, ry, rw, rh), rw, rh, M.mouthPixels.greenAtLeast);
  }
  return out;
}

const probe = (file, args) => JSON.parse(execFileSync("ffprobe", ["-v", "error", ...args, "-of", "json", file], { maxBuffer: 1 << 28 }).toString());

export function readClip(file, tpl) {
  const streams = probe(file, ["-show_entries", "stream=index,codec_type,start_time,sample_rate"]).streams;
  const v = streams.find((s) => s.codec_type === "video"), a = streams.find((s) => s.codec_type === "audio");
  const times = probe(file, ["-select_streams", "v:0", "-show_entries", "frame=best_effort_timestamp_time"]).frames.map((f) => Number(f.best_effort_timestamp_time));
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-map", "0:v:0", "-fps_mode", "passthrough", "-vf", `crop=${WINDOW.w}:${WINDOW.h}:${WINDOW.x}:${WINDOW.y}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 30 });
  const size = WINDOW.w * WINDOW.h * 3;
  if (raw.length !== size * times.length) throw new Error(`${rel(file)}: ${raw.length / size} decoded frames, ${times.length} frame times`);
  const frames = times.map((t, k) => {
    const f = brightFeatures(raw.subarray(k * size, (k + 1) * size), WINDOW.w, WINDOW.h, M.mouthPixels.greenAtLeast);
    return { t: t - Number(a.start_time), features: f, ...classifyMouth(f, tpl, M.mouthPixels.maxDistance) };
  });
  const sr = Number(a.sample_rate);
  const buf = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-map", "0:a:0", "-ac", "1", "-ar", String(sr), "-f", "f32le", "-"], { maxBuffer: 1 << 30 });
  const samples = Float32Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4));
  return { file: rel(file), sha256: sha256(fs.readFileSync(file)), videoStart: Number(v.start_time), audioStart: Number(a.start_time), sampleRate: sr, samples, frames };
}

// The mouths the clip was built from, made again with the same (frozen) code: the draw list's mouth per frame.
export function builtMouths(phrase, version, audioDir = "dev") {
  const d = decode(path.join(ROOT, "audio", audioDir, `${phrase}.mp3`));
  const n = frameCount(d.samples.length, d.sampleRate, M.fps);
  const mouths = version === "v1"
    ? lipsyncVolume(d.samples, d.sampleRate, M.fps, JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "lipsync-volume.json"), "utf8"))).mouths
    : lipsyncText(JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "raw", `${phrase}.align.json`), "utf8")).alignment, M.fps, JSON.parse(fs.readFileSync(path.join(ROOT, "rig", "lipsync-text.json"), "utf8")), n).mouths;
  return [...mouths, ...new Array(15).fill("rest")];
}

export function measureClip(phrase, version, { checkDrawList = false } = {}) {
  const tpl = templates();
  const clip = readClip(path.join(ROOT, "out", `lipsync-${version}`, `${phrase}.mp4`), tpl);
  const align = JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "raw", `${phrase}.align.json`), "utf8")).alignment;
  const ref = soundSegments(clip.samples, clip.sampleRate, M.reference);
  const frames = clip.frames.map((f) => ({ t: f.t, mouth: f.mouth }));
  const off = offsets(ref, frames, wordsOf(align), M.fps);
  const audioFrames = frames.filter((f) => f.t < ref.duration - 1e-9);
  const out = {
    phrase, version, clip: clip.file, clipSha256: clip.sha256, sampleRate: clip.sampleRate, videoStartS: clip.videoStart, audioStartS: clip.audioStart,
    audioDurationS: ref.duration, frames: clip.frames.length, unread: clip.frames.filter((f) => f.mouth === "unread").map((f, k) => k),
    largestTemplateDistance: Math.max(...clip.frames.map((f) => f.distance)),
    segments: ref.segments, pauses: ref.pauses, onsets: off.onsets, ends: off.ends,
    closure: closureScore(align, frames, M.fps), table: changesTable(audioFrames.map((f) => f.mouth), M.fps),
    mouths: clip.frames.map((f) => f.mouth),
  };
  if (checkDrawList) {
    const built = builtMouths(phrase, version);
    out.drawList = { frames: built.length, disagree: built.map((m, k) => (m !== out.mouths[k] ? { frame: k, drawList: m, pixels: out.mouths[k], features: clip.frames[k]?.features } : null)).filter(Boolean) };
    if (built.length !== out.mouths.length) out.drawList.lengthMismatch = [built.length, out.mouths.length];
  }
  return out;
}

const ms = (x) => (typeof x === "number" ? `${x} ms` : "—");
export function reportLines(results) {
  const L = [];
  for (const r of results) {
    L.push(`${r.phrase} ${r.version}: ${r.clip} (sha256 ${r.clipSha256}), ${r.frames} frames, audio ${r.audioDurationS} s at ${r.sampleRate} Hz, video start ${r.videoStartS}, audio start ${r.audioStartS}`);
    L.push(`  sound: ${r.segments.map((s) => `${s.start}..${s.end}`).join(", ")}; unread frames: ${r.unread.length ? r.unread.join(", ") : "none"}; largest template distance ${r.largestTemplateDistance}`);
    for (const o of r.onsets) L.push(`  onset  "${o.word}" at ${o.onsetS} s: ${o.skipped ? `not measured (${o.skipped})` : `frame ${o.frame} (${o.frameS} s, ${o.mouth}) → ${ms(o.ms)}${o.note ? ` (${o.note})` : ""}`}`);
    for (const e of r.ends) L.push(`  end    "${e.word}" at ${e.endS} s: ${e.skipped ? `not measured (${e.skipped})` : `frame ${e.frame} (${e.frameS} s) → ${ms(e.ms)}${e.note ? ` (${e.note})` : ""}`}`);
    L.push(`  closure ${r.closure.hits} of ${r.closure.of} (${r.closure.letters.map((x) => `${x.letter}@${x.start}${x.hit ? " rest" : " NOT rest"}`).join(", ")})`);
    const t = r.table;
    L.push(`  table: ${t.frames} frames, changes ${t.changes} = ${t.perSecond} per second; ${Object.entries(t.perShape).map(([k, v]) => `${k} ${v}`).join(", ")}; shortest ${t.shortest}, median ${t.median}, 1-frame runs ${t.oneFrame}`);
    if (r.drawList) L.push(`  pixels against the draw list: ${r.drawList.frames} frames, ${r.drawList.disagree.length} disagree${r.drawList.disagree.length ? ": " + r.drawList.disagree.map((d) => `${d.frame} ${d.drawList}→${d.pixels}`).join(", ") : ""}${r.drawList.lengthMismatch ? `; LENGTH ${r.drawList.lengthMismatch.join(" vs ")}` : ""}`);
  }
  for (const v of ["v1", "v2"]) {
    const rs = results.filter((r) => r.version === v);
    if (!rs.length) continue;
    for (const kind of ["onsets", "ends"]) {
      const s = summary(rs.flatMap((r) => r[kind].map((x) => x.ms)));
      L.push(`${v} ${kind}: count ${s.count}, median ${s.median} ms, largest |x| ${s.largestAbs} ms, within one frame ${s.withinOneFrame}, within 45 late / 125 early ${s.within45Late125Early}; not measured ${rs.flatMap((r) => r[kind].filter((x) => x.skipped)).length}`);
    }
    L.push(`${v} closure: ${rs.reduce((a, r) => a + r.closure.hits, 0)} of ${rs.reduce((a, r) => a + r.closure.of, 0)}`);
  }
  return L;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), phrases = args.filter((a) => /^[PH]\d+$/.test(a)), check = args.includes("--check-drawlist");
  const oi = args.indexOf("--out"), outName = oi >= 0 ? args[oi + 1] : "report";
  const dir = path.join(ROOT, "out", "measure");
  fs.mkdirSync(dir, { recursive: true });
  const results = [];
  for (const p of phrases) for (const v of ["v1", "v2"]) {
    const r = measureClip(p, v, { checkDrawList: check });
    fs.writeFileSync(path.join(dir, `${p}-${v}.json`), JSON.stringify(r, null, 2) + "\n");
    results.push(r);
  }
  const lines = [`templates (bright box w x h, count, from the art): ${Object.entries(templates()).map(([k, t]) => `${k} ${t.w}x${t.h} n ${t.n}`).join("; ")}`, `window on the stage: ${JSON.stringify(WINDOW)}`, `reference: ${JSON.stringify(M.reference)}`, ...reportLines(results)];
  fs.writeFileSync(path.join(dir, `${outName}.txt`), lines.join("\n") + "\n");
  console.log(lines.join("\n"));
  console.log(`out/measure/${outName}.txt`);
}

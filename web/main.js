// The webcam page: Ping drawn from the face, and the landmark points on a second canvas. The video element is created
// but never attached and never drawn; frames reach the detector only through privacy.js handOff().
// NOT VERIFIED WITH A REAL CAMERA.
import { drawList } from "/lib/rig.mjs";
import { faceToPose } from "/lib/face-to-pose.mjs";

const P = window.__pingPrivacy;
const rig = await (await fetch("/rig/rig.json")).json();
const faceConfig = await (await fetch("/rig/face.json")).json();
const images = {};
await Promise.all(rig.layers.map(async (l) => {
  const img = new Image();
  img.src = "/" + l.file;
  await img.decode();
  images[l.file] = img;
}));
const worker = new Worker("/web/detector-worker.js", { type: "module" });
await new Promise((resolve, reject) => {
  worker.onmessage = (e) => (e.data.type === "ready" ? resolve() : null);
  worker.onerror = (e) => reject(new Error(`detector worker: ${e.message}`));
});

const pingCanvas = document.getElementById("ping");
// The stage from rig.json (1600 x 1600, the art centred), the same as every render.
pingCanvas.width = rig.stage.width;
pingCanvas.height = rig.stage.height;
const pingCtx = pingCanvas.getContext("2d");
const pointsCanvas = document.getElementById("points"), pointsCtx = pointsCanvas.getContext("2d");
let state = null, frame = 0, busy = false, video = null, lastSentMs = -1;
window.__pingFrames = 0;
// Detector timestamps (author's prompt #17): the video's own frame times through requestVideoFrameCallback
// (mediaTime), so a frame skipped while the detector is busy does not slow the detector's clock and no frame is sent
// twice. Fallback for browsers without it: one per animation tick, frame count / 30 (the page says which is in use).
const useVideoTimes = typeof HTMLVideoElement.prototype.requestVideoFrameCallback === "function";
window.__pingTimestamps = useVideoTimes ? "video" : "count";
// Counters for the real-camera check: frames (or ticks) with a playable video, those skipped because the detector
// was busy, and (video times only) those skipped because their time was not later than the last one sent.
window.__pingTicks = 0;
window.__pingBusySkips = 0;
window.__pingRepeatSkips = 0;
document.getElementById("timing").textContent = useVideoTimes
  ? "Detector timestamps: the video's own frame times (requestVideoFrameCallback)."
  : "Detector timestamps: frame count / 30 (this browser has no requestVideoFrameCallback).";

function show(face, points) {
  const r = faceToPose(rig, faceConfig, face, state);
  state = r.state;
  window.PingAdapter.draw(pingCtx, images, drawList(rig, r.pose));
  pointsCtx.clearRect(0, 0, pointsCanvas.width, pointsCanvas.height);
  pointsCtx.fillStyle = "#2fe6ff";
  for (const [x, y] of points) pointsCtx.fillRect(x * pointsCanvas.width - 1, y * pointsCanvas.height - 1, 2, 2);
  window.__pingFrames++;
  window.__pingLastPose = r.pose;
}
show(null, []);

worker.onmessage = (e) => {
  if (e.data.type !== "result") return;
  busy = false;
  show(e.data.face, e.data.points);
};

async function send(timestampMs) {
  busy = true;
  lastSentMs = timestampMs;
  const bitmap = await P.handOff(video);
  worker.postMessage({ type: "frame", bitmap, timestampMs }, [bitmap]);
}

function onVideoFrame(now, meta) {
  window.__pingTicks++;
  const ms = meta.mediaTime * 1000;
  if (busy) window.__pingBusySkips++;
  else if (!(ms > lastSentMs)) window.__pingRepeatSkips++;
  else send(ms);
  video.requestVideoFrameCallback(onVideoFrame);
}

function tick() {
  if (!video) return;
  if (video.readyState >= 2) {
    window.__pingTicks++;
    if (busy) window.__pingBusySkips++;
    // Timestamps from the frame count, not a clock: monotonic, and the same run gives the same numbers.
    else send((frame++ * 1000) / 30);
  }
  requestAnimationFrame(tick);
}

window.__pingStart = async function () {
  if (video) return;
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
  video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  if (useVideoTimes) video.requestVideoFrameCallback(onVideoFrame);
  else tick();
};
document.getElementById("start").addEventListener("click", () => window.__pingStart());
P.ready = true;
window.__pingReady = true;
document.getElementById("status").textContent = "ready: press Start camera";

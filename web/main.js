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

const pingCtx = document.getElementById("ping").getContext("2d");
const pointsCanvas = document.getElementById("points"), pointsCtx = pointsCanvas.getContext("2d");
let state = null, frame = 0, busy = false, video = null;
window.__pingFrames = 0;

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

async function tick() {
  if (!video) return;
  if (!busy && video.readyState >= 2) {
    busy = true;
    const bitmap = await P.handOff(video);
    // Timestamps from the frame count, not a clock: monotonic, and the same run gives the same numbers.
    worker.postMessage({ type: "frame", bitmap, timestampMs: (frame++ * 1000) / 30 }, [bitmap]);
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
  tick();
};
document.getElementById("start").addEventListener("click", () => window.__pingStart());
P.ready = true;
window.__pingReady = true;
document.getElementById("status").textContent = "ready: press Start camera";

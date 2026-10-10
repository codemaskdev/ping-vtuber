// MediaPipe Face Landmarker in a module worker, everything loaded from this repository (web/vendor, web/models).
// It receives ImageBitmaps (made by privacy.js handOff from the video) and sends back numbers only. From the start,
// worker-privacy.js refuses any request to another host (MediaPipe's own usage logging posts to a Google server every
// 60 s; author's prompt #24); once the model has loaded, it locks the network and pixel export entirely, before
// "ready" is sent.
import { FaceLandmarker, FilesetResolver } from "./vendor/tasks-vision/vision_bundle.mjs";
import { lockDown, sameOriginOnly } from "./worker-privacy.js";

sameOriginOnly(self);

const fileset = await FilesetResolver.forVisionTasks(new URL("./vendor/tasks-vision/wasm", import.meta.url).href, true);
const landmarker = await FaceLandmarker.createFromOptions(fileset, {
  baseOptions: { modelAssetPath: new URL("./models/face_landmarker.task", import.meta.url).href, delegate: "CPU" },
  runningMode: "VIDEO",
  numFaces: 1,
  outputFaceBlendshapes: true,
  outputFacialTransformationMatrixes: true,
});
lockDown(self);
self.postMessage({ type: "ready" });

self.onmessage = (e) => {
  if (e.data.type !== "frame") return;
  const { bitmap, timestampMs } = e.data;
  let out = { type: "result", face: null, points: [] };
  try {
    const r = landmarker.detectForVideo(bitmap, timestampMs);
    if (r.faceLandmarks && r.faceLandmarks.length) {
      const blendshapes = {};
      for (const c of r.faceBlendshapes[0].categories) blendshapes[c.categoryName] = c.score;
      out = { type: "result", face: { blendshapes, matrix: Array.from(r.facialTransformationMatrixes[0].data) }, points: r.faceLandmarks[0].map((p) => [p.x, p.y]) };
    }
  } finally {
    bitmap.close();
  }
  self.postMessage(out);
};

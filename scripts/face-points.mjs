// How many face points the detector returns (author's prompt #21), from MediaPipe's own code: the landmark indices in
// FaceLandmarker's connection lists (web/vendor/tasks-vision, @mediapipe/tasks-vision 1.1.0, npm run web:vendor).
// The page passes every landmark of the first face to show() as one dot each (web/detector-worker.js, web/main.js).
//
//   npm run face:points      prints the count; writes web/record-points.json (the recording mode's thinned set)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../lib/spec.mjs";

const { FaceLandmarker: F } = await import(pathToFileURL(path.join(ROOT, "web", "vendor", "tasks-vision", "vision_bundle.mjs")).href);
const lists = Object.keys(F).filter((k) => k.startsWith("FACE_LANDMARKS_"));
const idx = lists.flatMap((k) => F[k].flatMap((c) => [c.start, c.end]));
const largest = Math.max(...idx);
console.log(`connection lists: ${lists.join(", ")}`);
const unused = Array.from({ length: largest + 1 }, (_, i) => i).filter((i) => !idx.includes(i));
console.log(`landmark indices 0..${largest}: ${largest + 1} points per face (${new Set(idx).size} appear in a connection; not in any: ${unused.join(", ")})`);
console.log(`face mesh: indices 0..${Math.max(...F.FACE_LANDMARKS_TESSELATION.flatMap((c) => [c.start, c.end]))}; irises: ${[...new Set([...F.FACE_LANDMARKS_RIGHT_IRIS, ...F.FACE_LANDMARKS_LEFT_IRIS].flatMap((c) => [c.start, c.end]))].sort((a, b) => a - b).join(", ")}`);

// The thinned-out set for the recording mode of the page (author's prompt #22): the points of
// FACE_LANDMARKS_CONTOURS (lips, eyes, eyebrows, face oval), the parts Ping copies plus the head's outline.
const contours = [...new Set(F.FACE_LANDMARKS_CONTOURS.flatMap((c) => [c.start, c.end]))].sort((a, b) => a - b);
const parts = Object.fromEntries(["LIPS", "LEFT_EYE", "RIGHT_EYE", "LEFT_EYEBROW", "RIGHT_EYEBROW", "FACE_OVAL"].map((k) => [k.toLowerCase(), new Set(F[`FACE_LANDMARKS_${k}`].flatMap((c) => [c.start, c.end])).size]));
const file = path.join(ROOT, "web", "record-points.json");
fs.writeFileSync(file, JSON.stringify({
  $comment: "Written by scripts/face-points.mjs (npm run face:points) from @mediapipe/tasks-vision 1.1.0 FaceLandmarker.FACE_LANDMARKS_CONTOURS. The recording mode of the webcam page (?record=1) draws only these points.",
  of: largest + 1, shown: contours.length, parts,
  why: "Chosen: the contours are the lips, the eyes, the eyebrows and the face oval: the parts Ping copies (mouth, eyes, brows) and the outline that shows the head's tilt and shift. They read as a face at video size, where all 478 points blur into a mesh; the irises are left out because Ping does not use them.",
  indices: contours,
}, null, 2) + "\n");
console.log(`web/record-points.json: ${contours.length} of ${largest + 1} points (${Object.entries(parts).map(([k, v]) => `${k} ${v}`).join(", ")})`);

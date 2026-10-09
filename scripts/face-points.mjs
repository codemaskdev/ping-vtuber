// How many face points the detector returns (author's prompt #21), from MediaPipe's own code: the landmark indices in
// FaceLandmarker's connection lists (web/vendor/tasks-vision, @mediapipe/tasks-vision 1.1.0, npm run web:vendor).
// The page passes every landmark of the first face to show() as one dot each (web/detector-worker.js, web/main.js).
//
//   npm run face:points
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

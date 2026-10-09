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

// The thinned-out set for the recording mode of the page: the lips, eyes and eyebrows of MediaPipe's own connection
// lists (author's prompt #23 dropped the face oval: a face's outline is the most recognisable part of the mesh).
const PARTS = ["LIPS", "LEFT_EYE", "RIGHT_EYE", "LEFT_EYEBROW", "RIGHT_EYEBROW"];
const contours = [...new Set(PARTS.flatMap((k) => F[`FACE_LANDMARKS_${k}`].flatMap((c) => [c.start, c.end])))].sort((a, b) => a - b);
const parts = Object.fromEntries(PARTS.map((k) => [k.toLowerCase(), new Set(F[`FACE_LANDMARKS_${k}`].flatMap((c) => [c.start, c.end])).size]));
const file = path.join(ROOT, "web", "record-points.json");
fs.writeFileSync(file, JSON.stringify({
  $comment: "Written by scripts/face-points.mjs (npm run face:points) from @mediapipe/tasks-vision 1.1.0 FaceLandmarker connection lists LIPS, LEFT_EYE, RIGHT_EYE, LEFT_EYEBROW, RIGHT_EYEBROW. The recording mode of the webcam page (?record=1) draws only these points.",
  of: largest + 1, shown: contours.length, parts,
  why: "The lips, the eyes and the eyebrows: the parts Ping copies (mouth, eyes, brows). The face oval was dropped by the author (prompt #23): a face's outline is the most recognisable part of the mesh. The irises are left out because Ping does not use them.",
  before: "prompt #22: FACE_LANDMARKS_CONTOURS, 128 points with the face oval (36)",
  indices: contours,
}, null, 2) + "\n");
console.log(`web/record-points.json: ${contours.length} of ${largest + 1} points (${Object.entries(parts).map(([k, v]) => `${k} ${v}`).join(", ")})`);

// Puts what the webcam page needs into web/ so that nothing comes from a CDN:
//   web/vendor/tasks-vision/   vision_bundle.mjs and wasm/ copied from node_modules/@mediapipe/tasks-vision (pinned)
//   web/models/face_landmarker.task   downloaded once from MODEL_URL, checked against web/VENDOR.json's sha256
// Both folders are generated (gitignored); web/VENDOR.json records versions, hashes, source and licence.
//
//   npm run web:vendor
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { sha256 } from "../lib/png.mjs";
import { ROOT, rel } from "../lib/spec.mjs";

const PKG = path.join(ROOT, "node_modules", "@mediapipe", "tasks-vision");
const WEB = path.join(ROOT, "web");
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const vendorFile = path.join(WEB, "VENDOR.json");
const prev = fs.existsSync(vendorFile) ? JSON.parse(fs.readFileSync(vendorFile, "utf8")) : null;

const pkg = JSON.parse(fs.readFileSync(path.join(PKG, "package.json"), "utf8"));
const dest = path.join(WEB, "vendor", "tasks-vision");
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.join(dest, "wasm"), { recursive: true });
const files = [];
for (const f of ["vision_bundle.mjs", ...fs.readdirSync(path.join(PKG, "wasm")).map((x) => `wasm/${x}`)]) {
  fs.copyFileSync(path.join(PKG, f), path.join(dest, f));
  files.push({ file: rel(path.join(dest, f)), sha256: sha256(fs.readFileSync(path.join(dest, f))) });
}

const model = path.join(WEB, "models", "face_landmarker.task");
fs.mkdirSync(path.dirname(model), { recursive: true });
if (!fs.existsSync(model)) execFileSync("curl", ["-sSfL", "-o", model, MODEL_URL]);
const modelSha = sha256(fs.readFileSync(model));
if (prev?.model?.sha256 && prev.model.sha256 !== modelSha) throw new Error(`model sha256 ${modelSha} is not the recorded ${prev.model.sha256}`);

fs.writeFileSync(vendorFile, JSON.stringify({
  $comment: "Written by scripts/web-vendor.mjs. The page serves these files itself; nothing is loaded from a CDN.",
  package: { name: pkg.name, version: pkg.version, license: pkg.license, from: "npm registry, pinned in package.json" },
  files,
  model: {
    file: rel(model), name: "face_landmarker.task", url: MODEL_URL, sha256: modelSha, bytes: fs.statSync(model).size,
    license: "Apache-2.0 as stated by the MediaPipe solutions documentation for the Face Landmarker model; not checked against the model card in this run",
  },
}, null, 2) + "\n");
console.log(`${pkg.name}@${pkg.version} (${pkg.license}): ${files.length} files in ${rel(dest)}`);
console.log(`${rel(model)}: ${fs.statSync(model).size} bytes, sha256 ${modelSha}, from ${MODEL_URL}`);

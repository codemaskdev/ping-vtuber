// Ping's voice: the ElevenLabs key never enters the repository, its history or its logs; disclosure is complete.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { apiKey } from "../lib/elevenlabs.mjs";
import { ROOT } from "../lib/spec.mjs";

const key = apiKey({ optional: true });
const walk = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])) : []);

test("the ElevenLabs key is in no tracked file, no commit, and nothing under logs/ or out/", { skip: key ? false : "no key on this machine" }, () => {
  const needle = Buffer.from(key);
  const hits = [];
  for (const f of execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean)) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p) && fs.readFileSync(p).includes(needle)) hits.push(f);
  }
  const history = execFileSync("git", ["log", "--all", "-p", "--format=%H %s%n%b"], { cwd: ROOT, maxBuffer: 1 << 30 });
  if (history.includes(needle)) hits.push("git history");
  for (const f of [...walk(path.join(ROOT, "logs")), ...walk(path.join(ROOT, "out"))].filter((x) => /\.(txt|json|jsonl|log|md)$/.test(x))) {
    if (fs.readFileSync(f).includes(needle)) hits.push(path.relative(ROOT, f));
  }
  // Report only where, never the key itself.
  assert.deepEqual(hits, [], `the key was found in: ${hits.join(", ")}`);
});

test("the key is read like the episodes pipeline does, and never printed", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib", "elevenlabs.mjs"), "utf8");
  assert.match(src, /process\.env\.ELEVENLABS_API_KEY/);
  assert.match(src, /\.claude\.json/);
  assert.ok(!/console\.(log|error|warn)/.test(src), "lib/elevenlabs.mjs prints nothing");
  for (const f of ["scripts/voice.mjs", "lib/elevenlabs.mjs"]) assert.ok(!/console\.\w+\([^)]*apiKey/.test(fs.readFileSync(path.join(ROOT, f), "utf8")), f);
});

test("audio/SOURCES.json discloses every development phrase", () => {
  const s = JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "SOURCES.json"), "utf8"));
  const V = JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "voice.json"), "utf8"));
  assert.deepEqual(s.files.map((f) => f.text), Object.values(V.phrases));
  for (const f of s.files) {
    for (const k of ["voiceName", "voiceId", "modelId", "settings", "serverDate", "text", "sha256", "durationS", "sampleRate"]) assert.ok(f[k] !== undefined && f[k] !== null, `${f.file}: ${k}`);
    assert.ok(fs.existsSync(path.join(ROOT, f.alignment)), f.alignment);
  }
  assert.equal(typeof s.repeatability.identical, "boolean");
});

test("no audio file is committed before its metadata was approved", () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => /\.(mp3|wav|m4a|flac|ogg)$/.test(f));
  const approved = JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "voice.json"), "utf8")).metadataApproved || [];
  for (const f of tracked) assert.ok(approved.includes(f), `${f} is committed without approval`);
});

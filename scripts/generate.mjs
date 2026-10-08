// Makes one generator attempt through Codex CLI's built-in image tool (signed in with ChatGPT, no API key).
//
//   npm run generate -- G1                       input: art/reference/logo-5A.png
//   npm run generate -- G2                       input: art/raw/01-master.png
//   npm run generate -- G2 --input art/raw/attempts/G1-01.png   only for a file in art/raw/attempts/, logged
//   add --allow-more to go past 2 attempts for one prompt (only when the author has said so)
//
// What it does, in order:
// 1. builds the task: the fixed wrapper (lib/attempts.mjs) with the prompt from art/GENERATOR_PROMPTS.md put in,
//    byte for byte;
// 2. runs `codex exec --json --sandbox read-only -C . -i <input>` (task on stdin) in a fresh session (the binary itself, not the shell
//    alias; CODEX_HOME unset so Codex uses its default home);
// 3. keeps the raw event log, stderr, the task and Codex's session file in logs/codex/ (never committed);
// 4. finds the image the call created in Codex's generated_images folder and copies it, unmodified, to
//    art/raw/attempts/<id>.<ext>, checking the sha256 at the source and at the copy.
// The committed extract and the disclosure entry are written by scripts/extract-attempt.mjs from those logs.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  ATTEMPTS_RAW, MAX_ATTEMPTS, RAW_LOGS, attemptId, attemptsOf, buildTask, codexArgs, codexHome, listFiles,
} from "../lib/attempts.mjs";
import { generatorPrompts } from "../lib/prompts.mjs";
import { sha256 } from "../lib/png.mjs";
import { ROOT, rel } from "../lib/spec.mjs";

const args = process.argv.slice(2);
const promptId = args.find((a) => /^G\d+$/.test(a));
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const fail = (msg) => { console.error(msg); process.exit(1); };

if (!promptId) fail("usage: npm run generate -- G<n> [--input art/raw/attempts/<file>] [--allow-more]");
const prompt = generatorPrompts().find((p) => p.id === promptId);
if (!prompt || !prompt.text) fail(`no prompt ${promptId} in art/GENERATOR_PROMPTS.md`);

const defaultInput = promptId === "G1" ? "art/reference/logo-5A.png" : "art/raw/01-master.png";
const inputRel = opt("--input") || defaultInput;
if (inputRel !== defaultInput && !inputRel.startsWith("art/raw/attempts/")) fail("--input may only name a file in art/raw/attempts/");
const input = path.join(ROOT, inputRel);
if (!fs.existsSync(input)) fail(`input ${inputRel} does not exist`);

const done = attemptsOf(promptId);
if (done.length >= MAX_ATTEMPTS && !args.includes("--allow-more")) fail(`${promptId} already has ${done.length} attempts (${done.join(", ")}); ask the author before another`);
const id = attemptId(promptId, done.length + 1);

fs.mkdirSync(RAW_LOGS, { recursive: true });
fs.mkdirSync(ATTEMPTS_RAW, { recursive: true });
const task = buildTask(prompt.text);
const logBase = path.join(RAW_LOGS, id);
fs.writeFileSync(`${logBase}.task.txt`, task);

const imagesDir = path.join(codexHome(), "generated_images");
const before = new Set(listFiles(imagesDir));
const env = { ...process.env };
delete env.CODEX_HOME;
const version = spawnSync("codex", ["--version"], { encoding: "utf8", env }).stdout.trim();
const argv = codexArgs(ROOT, input);
console.log(`${id}: codex ${argv.map((a) => (a === ROOT ? "." : a === input ? inputRel : a)).join(" ")}  (${version})`);
const r = spawnSync("codex", argv, { input: task, encoding: "utf8", env, maxBuffer: 1 << 30, timeout: 20 * 60 * 1000 });
fs.writeFileSync(`${logBase}.events.jsonl`, r.stdout || "");
fs.writeFileSync(`${logBase}.stderr.txt`, r.stderr || "");

// Codex's own session file for this thread, found by the thread id in the event log.
let threadId = null;
for (const line of (r.stdout || "").split("\n")) {
  try { const e = JSON.parse(line); threadId = threadId || e.thread_id || e.threadId || null; } catch { /* not JSON */ }
}
if (threadId) {
  const sessions = path.join(codexHome(), "sessions");
  const hit = listFiles(sessions).find((f) => f.includes(threadId));
  if (hit) fs.copyFileSync(path.join(sessions, hit), `${logBase}.session.jsonl`);
}

const created = listFiles(imagesDir).filter((f) => !before.has(f));
const run = {
  id, prompt: promptId, input: inputRel, inputSha256: sha256(fs.readFileSync(input)), codexCliVersion: version,
  argv: argv.map((a) => (a === ROOT ? "." : a === input ? inputRel : a)),
  exitStatus: r.status, signal: r.signal, error: r.error ? String(r.error.message) : null,
  threadId, createdImages: created.map((f) => `$CODEX_HOME/generated_images/${f}`), copies: [],
};
for (const [i, f] of created.entries()) {
  const src = path.join(imagesDir, f);
  const ext = path.extname(f) || ".bin";
  const dest = path.join(ATTEMPTS_RAW, created.length === 1 ? `${id}${ext}` : `${id}-${i + 1}${ext}`);
  fs.copyFileSync(src, dest);
  const a = sha256(fs.readFileSync(src)), b = sha256(fs.readFileSync(dest));
  if (a !== b) fail(`copy of ${f} differs from its source`);
  run.copies.push({ source: `$CODEX_HOME/generated_images/${f}`, sourceSha256: a, copy: rel(dest), copySha256: b });
}
fs.writeFileSync(`${logBase}.run.json`, JSON.stringify(run, null, 2) + "\n");
console.log(`exit ${r.status}${r.signal ? ` signal ${r.signal}` : ""}; images created: ${created.length}`);
for (const c of run.copies) console.log(`  ${c.copy}  sha256 ${c.copySha256} (source ${c.sourceSha256})`);
console.log(`raw logs: ${rel(logBase)}.*  — next: npm run attempt:extract -- ${id}`);
if (r.status !== 0 || created.length !== 1) process.exit(1);

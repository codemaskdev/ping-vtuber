// Turns the raw logs of one attempt (logs/codex/<id>.*, never committed) into:
// - art/attempts/<id>.json: the committed extract, with local paths, account details and session/call ids removed;
// - the disclosure entry for the attempt in art/generations.json (attempts.<id>).
// Values are copied from what Codex or the file itself reports; anything not reported is written "not reported".
//
//   npm run attempt:extract -- G1-01
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ATTEMPTS_LOG, RAW_LOGS, compareText, imageInfo, sanitize } from "../lib/attempts.mjs";
import { generatorPrompts } from "../lib/prompts.mjs";
import { sha256 } from "../lib/png.mjs";
import { ROOT } from "../lib/spec.mjs";

const NR = "not reported";
const id = process.argv[2];
if (!/^G\d+-\d\d$/.test(id || "")) { console.error("usage: npm run attempt:extract -- G1-01"); process.exit(1); }
const base = path.join(RAW_LOGS, id);
const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const run = JSON.parse(fs.readFileSync(`${base}.run.json`, "utf8"));
const events = readJsonl(`${base}.events.jsonl`);
const session = readJsonl(`${base}.session.jsonl`);
const prompt = generatorPrompts().find((p) => p.id === run.prompt);

const payloads = session.map((e) => ({ type: e.type, p: e.payload || {} }));
const meta = payloads.find((x) => x.type === "session_meta")?.p || {};
const turn = payloads.find((x) => x.type === "turn_context")?.p || {};
const calls = payloads.filter((x) => x.p.type === "function_call" && x.p.namespace === "image_gen").map((x) => x.p);
const results = payloads.filter((x) => x.p.type === "item_completed" && x.p.item?.kind === "image_gen.generation").map((x) => x.p.item);
// Text Codex itself put into the user message besides our task (for example a file it could not read).
const injected = payloads
  .filter((x) => x.p.type === "message" && x.p.role === "user")
  .flatMap((x) => x.p.content || [])
  .filter((c) => c.type === "input_text" && /^Codex could not/.test(c.text))
  .map((c) => c.text);

const call = calls[0], result = results[0];
let args = null;
try { args = call ? JSON.parse(call.arguments) : null; } catch { args = null; }
const passed = args && typeof args.prompt === "string" ? args.prompt : null;

const copy = run.copies[0] || null;
let output = null, c2pa = {};
if (copy) {
  const buf = fs.readFileSync(path.join(ROOT, copy.copy));
  output = { copy: copy.copy, bytes: buf.length, sha256AtSource: copy.sourceSha256, sha256AtCopy: sha256(buf), ...imageInfo(buf) };
  const ex = spawnSync("exiftool", ["-j", "-ActionsSoftwareAgentName", "-ActionsSoftwareAgentVersion", "-Claim_Generator_InfoName", "-ActionsAction", "-ActionsDigitalSourceType", copy.copy], { cwd: ROOT, encoding: "utf8" });
  if (ex.status === 0) { const j = JSON.parse(ex.stdout)[0]; delete j.SourceFile; c2pa = j; }
}
const input = imageInfo(fs.readFileSync(path.join(ROOT, run.input)));
let sizeCheck;
if (!output || !output.width) sizeCheck = "failed: no image or size not readable";
else if (run.prompt === "G1") sizeCheck = `${output.width}x${output.height}: a G1 attempt sets the canvas if the author makes it the master`;
else sizeCheck = output.width === input.width && output.height === input.height
  ? `ok: ${output.width}x${output.height}, same as the input master`
  : `failed: ${output.width}x${output.height}, the input master is ${input.width}x${input.height}`;

const imageModel = c2pa.ActionsSoftwareAgentVersion
  ? { value: c2pa.ActionsSoftwareAgentVersion, source: "C2PA manifest in the output file, c2pa.actions.v2 softwareAgent.version (exiftool)" }
  : NR;
const extract = sanitize({
  $comment: "Written by scripts/extract-attempt.mjs from Codex's logs. Local paths, account details and session, call and response ids are removed. Values Codex did not report are 'not reported'.",
  attempt: id,
  prompt: run.prompt,
  attemptNumber: Number(id.slice(-2)),
  input: { file: run.input, sha256: run.inputSha256, width: input.width, height: input.height },
  command: ["codex", ...run.argv],
  exitStatus: run.exitStatus,
  codexCliVersion: run.codexCliVersion,
  sessionCliVersion: meta.cli_version || NR,
  date: meta.timestamp ? meta.timestamp.slice(0, 10) : NR,
  dateSource: meta.timestamp ? "Codex session file, session_meta.timestamp (UTC)" : NR,
  codexModel: turn.model || NR,
  sandbox: turn.sandbox_policy?.type || NR,
  approvalPolicy: turn.approval_policy || NR,
  jsonEventTypes: events.map((e) => e.type),
  jsonEventsReportToolCall: events.some((e) => JSON.stringify(e).includes("image_gen")) ? "yes" : "no: the --json events show only thread, turn and agent messages; the tool call is read from Codex's session file",
  injectedByCodex: injected.length ? injected : "none",
  imageTool: call ? { name: call.name, namespace: call.namespace, calls: calls.length, argumentKeys: args ? Object.keys(args).sort() : NR, otherArguments: args ? Object.fromEntries(Object.entries(args).filter(([k]) => k !== "prompt")) : NR } : NR,
  promptPassed: passed === null ? NR : passed,
  promptPassedVsOurs: prompt ? compareText(prompt.text, passed) : "our prompt not found",
  revisedPrompt: result?.revisedPrompt ?? NR,
  revisedPromptVsOurs: prompt ? compareText(prompt.text, result?.revisedPrompt ?? null) : "our prompt not found",
  imageResult: result ? { status: result.status, failure: result.failure, transparentBackground: result.transparentBackground, saved: result.savedPath ? "under $CODEX_HOME/generated_images" : NR } : NR,
  imagesCreated: run.createdImages.length,
  imageModel,
  c2pa: Object.keys(c2pa).length ? c2pa : NR,
  output: output || NR,
  sizeCheck,
  agentFinalMessage: events.filter((e) => e.item?.type === "agent_message").map((e) => e.item.text).pop() || NR,
});
fs.mkdirSync(ATTEMPTS_LOG, { recursive: true });
fs.writeFileSync(path.join(ATTEMPTS_LOG, `${id}.json`), JSON.stringify(extract, null, 2) + "\n");

// Disclosure entry.
const gfile = path.join(ROOT, "art", "generations.json");
const g = JSON.parse(fs.readFileSync(gfile, "utf8"));
g.attempts = g.attempts || {};
// Fields only the author sets survive a re-extraction.
const kept = Object.fromEntries(Object.entries(g.attempts[id] || {}).filter(([k]) => ["metadataApproved", "promotedTo"].includes(k)));
g.attempts[id] = sanitize({
  prompt: run.prompt,
  attempt: extract.attemptNumber,
  date: extract.date,
  generator: "Codex CLI built-in image tool, signed in with ChatGPT",
  codexCliVersion: run.codexCliVersion,
  codexModel: extract.codexModel,
  imageTool: call ? `${call.namespace}.${call.name}` : NR,
  imageModel,
  input: run.input,
  promptAsSent: passed === null ? NR : passed,
  promptAsSentVsOurs: extract.promptPassedVsOurs === "identical" ? "identical" : extract.promptPassedVsOurs,
  outputSize: output && output.width ? `${output.width}x${output.height}` : NR,
  file: output ? output.copy : NR,
  sha256: output ? output.sha256AtCopy : NR,
  sizeCheck,
  extract: `art/attempts/${id}.json`,
  metadataApproved: false,
  ...kept,
});
const sorted = Object.fromEntries(Object.entries(g.attempts).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
g.attempts = sorted;
fs.writeFileSync(gfile, JSON.stringify(g, null, 2) + "\n");
console.log(`art/attempts/${id}.json; art/generations.json attempts.${id}`);
console.log(`prompt passed: ${typeof extract.promptPassedVsOurs === "string" ? extract.promptPassedVsOurs : "DIFFERENT"}; image model: ${typeof imageModel === "string" ? imageModel : imageModel.value}; output ${extract.output.width}x${extract.output.height}; ${sizeCheck}`);

// Generator attempts made through Codex CLI's built-in image tool: the fixed wrapper, file names, and the helpers
// that turn Codex's raw logs into a committed extract without local paths or account details.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT } from "./spec.mjs";

// The task given to Codex is this wrapper with the generator prompt put in, byte for byte. PROMPTS.md logs it.
export const WRAPPER_HEAD = `You relay one request to your built-in image generation tool. Do exactly this:
1. Call your image generation tool exactly once.
2. Give it the prompt between the lines BEGIN PROMPT and END PROMPT below, character for character. Do not rewrite, shorten, extend, translate, restructure or add anything to it. The attached image is the input image for this call.
3. Change nothing in the result: no cropping, resizing, conversion, retouching and no second call.
4. Write, move or delete no file in the repository, and run no shell commands.
5. Reply with one line saying whether the image tool returned an image.

BEGIN PROMPT
`;
export const WRAPPER_TAIL = `
END PROMPT
`;

// The codex exec arguments. No "-" for stdin: -i takes several values and would swallow it as a second image (it
// did in G1-01). With no prompt argument, codex exec reads the task from stdin.
export function codexArgs(root, input) {
  return ["exec", "--json", "--sandbox", "read-only", "-C", root, "-i", input];
}

export function buildTask(promptText) {
  return WRAPPER_HEAD + promptText + WRAPPER_TAIL;
}

export const ATTEMPTS_RAW = path.join(ROOT, "art", "raw", "attempts"); // generated images, committed only once approved
export const ATTEMPTS_LOG = path.join(ROOT, "art", "attempts"); // committed extracts
export const RAW_LOGS = path.join(ROOT, "logs", "codex"); // raw event logs, never committed
export const MAX_ATTEMPTS = 2;

export const attemptId = (promptId, n) => `${promptId}-${String(n).padStart(2, "0")}`;

export function attemptsOf(promptId) {
  const ids = new Set();
  for (const dir of [ATTEMPTS_LOG, RAW_LOGS, ATTEMPTS_RAW]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(new RegExp(`^(${promptId}-\\d\\d)\\.`));
      if (m) ids.add(m[1]);
    }
  }
  return [...ids].sort();
}

export function codexHome() {
  return path.join(os.homedir(), ".codex");
}

// Makes repository paths relative, and replaces the home folder, the user name, anything that looks like an e-mail address, and session, call and
// response ids. Used on every string that goes into a committed extract.
export function sanitize(value) {
  const home = os.homedir(), user = os.userInfo().username, ch = codexHome();
  const clean = (s) => s
    .split(ROOT + path.sep).join("")
    .split(ROOT).join(".")
    .split(ch).join("$CODEX_HOME")
    .split(home).join("~")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email removed>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\b(call|resp|msg|fc|fco)_[A-Za-z0-9-]+/g, "<id>")
    .replace(new RegExp(`\\b${user}\\b`, "g"), "<user>");
  if (typeof value === "string") return clean(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v)]));
  return value;
}

// Exact comparison of two strings: identical, or the common prefix and suffix lengths and the differing middles.
export function compareText(ours, theirs) {
  if (theirs === null || theirs === undefined) return "not reported";
  if (ours === theirs) return "identical";
  let p = 0;
  while (p < ours.length && p < theirs.length && ours[p] === theirs[p]) p++;
  let s = 0;
  while (s < ours.length - p && s < theirs.length - p && ours[ours.length - 1 - s] === theirs[theirs.length - 1 - s]) s++;
  return {
    identical: false,
    oursLength: ours.length,
    passedLength: theirs.length,
    commonPrefixLength: p,
    commonSuffixLength: s,
    oursMiddle: ours.slice(p, ours.length - s),
    passedMiddle: theirs.slice(p, theirs.length - s),
  };
}

// Every file under dir, as paths relative to dir, sorted.
export function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(path.relative(dir, p));
    }
  };
  walk(dir);
  return out.sort();
}

// Pixel size and format from the file header (PNG, JPEG or WebP), without decoding.
export function imageInfo(buf) {
  if (buf.subarray(1, 4).toString("latin1") === "PNG") return { format: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let p = 2;
    while (p < buf.length) {
      const marker = buf[p + 1], len = buf.readUInt16BE(p + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { format: "jpeg", width: buf.readUInt16BE(p + 7), height: buf.readUInt16BE(p + 5) };
      p += 2 + len;
    }
  }
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return { format: "webp", width: null, height: null };
  return { format: "unknown", width: null, height: null };
}

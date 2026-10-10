// Repository rules that code can check: determinism sources, anonymity, no stray files.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ROOT } from "../lib/spec.mjs";
import { buildSources } from "../scripts/sources.mjs";

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const gitOr = (fallback, ...args) => { try { return git(...args); } catch { return fallback; } };
const files = git("ls-files", "--cached", "--others", "--exclude-standard").split("\n").filter(Boolean);
const textFiles = files.filter((f) => !/\.(png|jpe?g|webp|mp3|wav|m4a|ogg|flac|mp4|wasm|task|bin)$/i.test(f) && fs.existsSync(path.join(ROOT, f)));

test("no Math.random, wall-clock time or engine-dependent maths in code that makes output", () => {
  const code = files.filter((f) => /^(lib|scripts)\/.*\.mjs$/.test(f) || f === "test/fixtures/make-fixtures.mjs");
  assert.ok(code.length >= 5);
  const banned = /Math\.random|Date\.now|new Date\b|performance\.now|process\.hrtime|Math\.(pow|exp|expm1|log\w*|sin|cos|tan|asin|acos|atan2?|sinh|cosh|tanh|cbrt|hypot)\b/;
  for (const f of code) {
    const lines = fs.readFileSync(path.join(ROOT, f), "utf8").split("\n");
    lines.forEach((l, i) => assert.ok(!banned.test(l), `${f}:${i + 1}: ${l.trim()}`));
  }
});

test("no .DS_Store and no node_modules in the repository", () => {
  assert.ok(!files.some((f) => f.endsWith(".DS_Store") || f.startsWith("node_modules/")));
});

test("no local paths, usernames or the global git identity in any text file", () => {
  // Built from parts so this file does not match itself.
  const needles = [os.homedir(), ["", "Users", ""].join("/"), ["", "home", ""].join("/")];
  const user = os.userInfo().username;
  const globalName = gitOr("", "config", "--global", "user.name");
  const globalEmail = gitOr("", "config", "--global", "user.email");
  for (const v of [globalName, globalEmail]) if (v) needles.push(v);
  // web/vendor/ holds Google's unmodified MediaPipe files (sha256 in web/VENDOR.json): Emscripten's virtual file
  // system there makes a home folder for "web_user", which is not a path on any machine; every other needle applies
  const emscriptenHome = ["", "home", "web_user"].join("/");
  for (const f of textFiles) {
    let text = fs.readFileSync(path.join(ROOT, f), "utf8");
    if (f.startsWith("web/vendor/")) text = text.split(emscriptenHome).join("");
    // prompts #24 and #25 (verbatim in PROMPTS.md) quote the pattern they ask to look for: not a path
    if (f === "PROMPTS.md") for (const q of [["", "Users", "..."], ["", "Users", ""]]) text = text.split(`"${q.join("/")}"`).join("");
    for (const n of needles) assert.ok(!text.includes(n), `${f} contains a local path or identity`);
    assert.ok(!new RegExp(`\\b${user}\\b`, "i").test(text), `${f} contains the local username`);
  }
});

// Up to and including 73feeaa (published as they are: their hashes are in the video) the e-mail is the old noreply
// address; from the next commit on it is one no GitHub user can own (prompt #26, CLAUDE.md rule 9).
const LAST_OLD = "73feeaac276e921f874730a1521b63dddcdaced1";
test("every commit is authored and committed by CodeMask in UTC", () => {
  const log = gitOr("", "log", "--format=%H|%an|%ae|%aI|%cn|%ce|%cI");
  const old = new Set(gitOr("", "rev-list", LAST_OLD).split("\n").filter(Boolean));
  for (const line of log.split("\n").filter(Boolean)) {
    const [h, an, ae, ad, cn, ce, cd] = line.split("|");
    const email = old.has(h) ? "codemask@users.noreply.github.com" : "codemask@codemask.invalid";
    assert.equal(an, "CodeMask"); assert.equal(cn, "CodeMask");
    assert.equal(ae, email, h); assert.equal(ce, email, h);
    assert.match(ad, /(Z|\+00:00)$/); assert.match(cd, /(Z|\+00:00)$/);
  }
});

// No remote, or (once the author publishes, prompt #24) only origin at codemaskdev/ping-vtuber on GitHub.
test("no remote but the public repository", () => {
  const remotes = git("remote", "-v").split("\n").filter(Boolean);
  for (const r of remotes) assert.match(r, /^origin\s+(https:\/\/github\.com\/|git@github\.com:)codemaskdev\/ping-vtuber(\.git)? \((fetch|push)\)$/, r);
});

test("all repository text is English (no Cyrillic)", () => {
  const cyrillic = new RegExp(`[${String.fromCharCode(0x400)}-${String.fromCharCode(0x4ff)}]`);
  for (const f of textFiles) assert.ok(!cyrillic.test(fs.readFileSync(path.join(ROOT, f), "utf8")), f);
});

test("art/SOURCES.json is up to date and complete", () => {
  const { sources, errors } = buildSources();
  assert.deepEqual(errors, []);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(ROOT, "art", "SOURCES.json"), "utf8")), sources);
});

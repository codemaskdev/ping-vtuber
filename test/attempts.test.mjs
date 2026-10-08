// The Codex generator pipeline: wrapper, command line, sanitizing of extracts, disclosure records.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MAX_ATTEMPTS, WRAPPER_HEAD, WRAPPER_TAIL, buildTask, codexArgs, compareText, sanitize } from "../lib/attempts.mjs";
import { generatorPrompts } from "../lib/prompts.mjs";
import { ROOT } from "../lib/spec.mjs";

const prompts = generatorPrompts();
const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
const gens = JSON.parse(fs.readFileSync(path.join(ROOT, "art", "generations.json"), "utf8"));

test("the task is the wrapper with the generator prompt inside, byte for byte", () => {
  for (const p of prompts) {
    const t = buildTask(p.text);
    assert.equal(t, WRAPPER_HEAD + p.text + WRAPPER_TAIL);
    assert.equal(t.slice(WRAPPER_HEAD.length, t.length - WRAPPER_TAIL.length), p.text);
  }
  assert.match(WRAPPER_HEAD, /exactly once/);
  assert.match(WRAPPER_HEAD, /character for character/);
  assert.match(WRAPPER_HEAD, /Change nothing in the result/);
  assert.match(WRAPPER_HEAD, /Write, move or delete no file in the repository/);
});

test("PROMPTS.md logs the wrapper exactly", () => {
  const md = fs.readFileSync(path.join(ROOT, "PROMPTS.md"), "utf8");
  const sec = md.slice(md.indexOf("## [GENERATOR WRAPPER]"), md.indexOf("## Generator prompts\n"));
  const blocks = [...sec.matchAll(/```text\n([\s\S]*?)```/g)].map((m) => m[1]);
  assert.deepEqual(blocks, [WRAPPER_HEAD, WRAPPER_TAIL]);
});

test("codex runs read-only, with --json, the input attached with -i, and the task on stdin", () => {
  const a = codexArgs("ROOT", "IN.png");
  assert.deepEqual(a, ["exec", "--json", "--sandbox", "read-only", "-C", "ROOT", "-i", "IN.png"]);
  assert.ok(!a.includes("-"), "a trailing - would be taken by -i as a second image");
  const src = fs.readFileSync(path.join(ROOT, "scripts", "generate.mjs"), "utf8");
  assert.match(src, /spawnSync\("codex", argv, \{ input: task/);
  assert.match(src, /delete env\.CODEX_HOME/);
  assert.equal(MAX_ATTEMPTS, 2);
});

test("compareText: identical, or the exact differing middle", () => {
  assert.equal(compareText("abc", "abc"), "identical");
  assert.equal(compareText("abc", null), "not reported");
  assert.deepEqual(compareText("a red box", "a blue box"), {
    identical: false, oursLength: 9, passedLength: 10, commonPrefixLength: 2, commonSuffixLength: 4, oursMiddle: "red", passedMiddle: "blue",
  });
});

test("sanitize removes the repo path, home, user name, e-mail, session and call ids", () => {
  const user = os.userInfo().username;
  const dirty = {
    a: path.join(ROOT, "art", "x.png"), b: path.join(os.homedir(), ".codex", "generated_images", "01a11cbb-8966-76d1-98ce-bea82f308039", "call_YoiMlVEe4.png"),
    c: `${user} wrote to someone@example.com`, d: "resp_00cf4aa6b960 fc_00cf4 msg_01a1",
  };
  const clean = JSON.stringify(sanitize(dirty));
  for (const bad of [ROOT, os.homedir(), "example.com", "01a11cbb", "call_Yoi", "resp_00", "fc_00", "msg_01"]) assert.ok(!clean.includes(bad), bad);
  assert.ok(!new RegExp(`\\b${user}\\b`).test(clean));
  assert.match(clean, /art\/x\.png/);
  assert.match(clean, /\$CODEX_HOME\/generated_images\/<id>\/<id>\.png/);
});

test("raw Codex logs never reach git; committed extracts hold no paths, accounts or ids", () => {
  assert.ok(!tracked.some((f) => f.startsWith("logs/")), "logs/ is tracked");
  const user = os.userInfo().username;
  for (const f of tracked.filter((t) => t.startsWith("art/attempts/"))) {
    const text = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const bad of [os.homedir(), ["", "Users", ""].join("/"), "Desktop"]) assert.ok(!text.includes(bad), `${f}: ${bad}`);
    assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text), `${f}: e-mail address`);
    assert.ok(!new RegExp(`\\b${user}\\b`).test(text), `${f}: user name`);
    if (f.endsWith(".json")) {
      const keys = [];
      const walk = (v) => { if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { keys.push(k); walk(x); } };
      walk(JSON.parse(text));
      for (const k of keys) assert.ok(!/account|e-?mail|user_?id|session_?id|thread_?id|auth|token$/i.test(k), `${f}: key ${k}`);
      assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text), `${f}: session id`);
      assert.ok(!/\b(call|resp|fc|fco)_[A-Za-z0-9]/.test(text), `${f}: call or response id`);
    }
  }
});

test("every attempt has a full disclosure record and an extract", () => {
  const need = ["prompt", "attempt", "date", "generator", "codexCliVersion", "codexModel", "imageTool", "imageModel", "promptAsSent", "promptAsSentVsOurs", "outputSize", "file", "sha256", "sizeCheck", "extract", "metadataApproved"];
  for (const [id, a] of Object.entries(gens.attempts || {})) {
    for (const k of need) assert.ok(k in a, `${id}: ${k}`);
    assert.match(id, new RegExp(`^${a.prompt}-0${a.attempt}$`));
    assert.ok(a.imageModel === "not reported" || (a.imageModel.value && a.imageModel.source), `${id}: imageModel needs a source`);
    assert.ok(tracked.includes(a.extract) || fs.existsSync(path.join(ROOT, a.extract)), `${id}: ${a.extract}`);
    const ex = JSON.parse(fs.readFileSync(path.join(ROOT, a.extract), "utf8"));
    assert.equal(ex.output.sha256AtSource, ex.output.sha256AtCopy, `${id}: copy differs from source`);
    const gp = prompts.find((p) => p.id === a.prompt);
    const texts = [gp.text, ...gp.previous.map((v) => v.text)];
    if (a.promptAsSentVsOurs === "identical") assert.ok(texts.includes(a.promptAsSent), `${id}: prompt as sent is no version of ${a.prompt}`);
    if (a.promptVersion !== undefined && a.promptVersion !== "current") {
      const v = gp.previous.find((x) => x.label === a.promptVersion);
      assert.ok(v && v.attempts.includes(a.attempt), `${id}: ${a.promptVersion} does not list attempt ${a.attempt}`);
    }
  }
});

test("at most 2 attempts per prompt unless the author allowed more", () => {
  const per = {};
  for (const a of Object.values(gens.attempts || {})) per[a.prompt] = (per[a.prompt] || 0) + 1;
  for (const [p, n] of Object.entries(per)) assert.ok(n <= MAX_ATTEMPTS || (gens.allowedMore || []).includes(p), `${p}: ${n} attempts`);
});

// FACTS.md (author's prompt #20): every file, line, quote and commit it cites exists, and every fact has a source.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ROOT } from "../lib/spec.mjs";

const facts = fs.readFileSync(path.join(ROOT, "FACTS.md"), "utf8");
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });
const commitExists = (c) => { try { git("cat-file", "-e", `${c}^{commit}`); return true; } catch { return false; } };

test("every cited file, line and quote exists at the cited commit", () => {
  const refs = [...facts.matchAll(/\[([^\]\s:]+):(\d+) @ ([0-9a-f]{7,40}) ⟦(.+?)⟧\]/g)];
  assert.ok(refs.length >= 90, `${refs.length} file citations`);
  const cache = new Map();
  for (const [, file, line, commit, quote] of refs) {
    assert.ok(commitExists(commit), `commit ${commit}`);
    const key = `${commit}:${file}`;
    if (!cache.has(key)) { try { cache.set(key, git("show", key).split("\n")); } catch { cache.set(key, null); } }
    const lines = cache.get(key);
    assert.ok(lines, `${file} at ${commit}`);
    assert.ok(Number(line) >= 1 && Number(line) <= lines.length, `${file}:${line} at ${commit}`);
    assert.ok(lines[Number(line) - 1].includes(quote), `${file}:${line} at ${commit} does not say: ${quote}`);
  }
});

test("every cited command names an existing commit, and an npm script that exists there", () => {
  const runs = [...facts.matchAll(/\[run: (.+?) @ ([0-9a-f]{7,40})\]/g)];
  assert.ok(runs.length >= 3);
  for (const [, cmd, commit] of runs) {
    assert.ok(commitExists(commit), `commit ${commit}`);
    const m = cmd.match(/^npm run ([\w:-]+)/);
    if (m) assert.ok(JSON.parse(git("show", `${commit}:package.json`)).scripts[m[1]], `npm script ${m[1]} at ${commit}`);
  }
});

test("every commit named in the text exists", () => {
  const named = new Set([...facts.matchAll(/\b[0-9a-f]{7,12}\b/g)].map((m) => m[0]).filter((h) => /[a-f]/.test(h) && /\d/.test(h)));
  assert.ok(named.size >= 4, [...named].join(" "));
  for (const h of named) assert.ok(commitExists(h), `commit ${h}`);
});

test("every fact outside 'Not measured' has a source", () => {
  const body = facts.slice(facts.indexOf("## Layers and rig"), facts.indexOf("## Not measured"));
  const bullets = body.split("\n").filter((l) => l.startsWith("- "));
  assert.ok(bullets.length >= 80, `${bullets.length} facts`);
  for (const b of bullets) assert.match(b, /\[(run: .+ @ [0-9a-f]{7,40}|[^\]\s:]+:\d+ @ [0-9a-f]{7,40} ⟦.+?⟧)\]/, b.slice(0, 80));
});

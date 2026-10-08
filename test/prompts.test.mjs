import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { PROMPTS_FILE, generatorPrompts, parseGeneratorPrompts } from "../lib/prompts.mjs";
import { loadSpec } from "../lib/spec.mjs";

const spec = loadSpec();
const gen = generatorPrompts();
const promptsMd = fs.readFileSync(PROMPTS_FILE, "utf8");

test("generator prompts are G1..Gn in order, each with text and a save-as path", () => {
  assert.deepEqual(gen.map((p) => p.id), gen.map((_, i) => `G${i + 1}`));
  for (const p of gen) {
    assert.ok(p.text && p.text.length > 100, p.id);
    assert.match(p.saveAs, /^art\/raw\/\d\d-[a-z0-9_]+\.png$/, p.id);
  }
});

test("G1 starts from the reference logo; every later prompt edits the master", () => {
  assert.equal(gen[0].attach, "art/reference/logo-5A.png");
  for (const p of gen.slice(1)) assert.match(p.text, /^Edit the master image/, p.id);
});

test("each raw in layers.json is saved by exactly the prompt it names", () => {
  for (const r of spec.raws) {
    const p = gen.find((g) => g.id === r.prompt);
    assert.ok(p, r.prompt);
    assert.equal(p.saveAs, `art/raw/${r.file}`);
  }
  assert.equal(gen.length, spec.raws.length);
});

test("PROMPTS.md has every generator prompt verbatim, marked [GENERATOR]", () => {
  const copies = parseGeneratorPrompts(promptsMd);
  assert.deepEqual(copies.map((c) => c.id), gen.map((g) => g.id));
  for (const g of gen) assert.equal(copies.find((c) => c.id === g.id).text, g.text, g.id);
  for (const m of promptsMd.matchAll(/^### (?:\[GENERATOR\] )?G\d+/gm)) assert.match(m[0], /\[GENERATOR\]/);
});

test("author prompts in PROMPTS.md are numbered #1, #2, ... in order", () => {
  const nums = [...promptsMd.matchAll(/^## Prompt #(\d+)/gm)].map((m) => Number(m[1]));
  assert.ok(nums.length >= 1);
  assert.deepEqual(nums, nums.map((_, i) => i + 1));
});

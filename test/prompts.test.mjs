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

test("G1 starts from the reference logo; every later prompt edits the attached master", () => {
  assert.equal(gen[0].attach, "art/reference/logo-5A.png");
  for (const p of gen.slice(1)) assert.match(p.text, /^Edit the attached image\./, p.id);
});

test("face shapes and the cursor are crisp; only the outer outline glows", () => {
  for (const p of gen) assert.doesNotMatch(p.text, /flat glowing/i, p.id);
  assert.match(gen[0].text, /Only this outer outline glows/);
  assert.match(gen[0].text, /crisp, sharp edges and no glow or halo/);
  assert.match(gen[0].text, /No eyebrows/);
});

test("hollow mouths say their outline is one pixel block thick and open downward from the smile's top", () => {
  for (const id of ["G5", "G6", "G7", "G8"]) assert.match(gen.find((g) => g.id === id).text, /outline is one pixel block thick/, id);
  for (const id of ["G5", "G8"]) assert.match(gen.find((g) => g.id === id).text, /top edge is where the top of the closed smile was/, id);
  for (const id of ["G6", "G7"]) {
    const g = gen.find((x) => x.id === id);
    assert.match(g.text, /The mouth grows downward only, toward the bottom outline: no part of it is higher than the top of the closed smile's two raised end blocks\./, id);
    assert.match(g.previous[0].text, /top edge is where the top of the closed smile was/, id);
    assert.deepEqual(g.previous[0].attempts, [1]);
  }
});

test("G3's corrected text keeps one block between brows and eyes, and the attempt-1 text next to it", () => {
  const g = gen.find((x) => x.id === "G3");
  assert.match(g.text, /a clear dark gap of one full pixel block \(the height of one raised end block of the smile\)/);
  assert.match(g.text, /The brows do not touch the eyes\./);
  assert.match(g.previous[0].text, /stay well below the red cursor/);
});

test("G2 removes the face and the cursor and keeps the chevron", () => {
  const t = gen.find((g) => g.id === "G2").text;
  assert.match(t, /remove both eyes, the mouth and the red cursor block/);
  assert.match(t, /Keep the ">" chevron/);
});

test("each raw in layers.json is saved by exactly the prompt it names", () => {
  for (const r of spec.raws) {
    const p = gen.find((g) => g.id === r.prompt);
    assert.ok(p, r.prompt);
    assert.equal(p.saveAs, `art/raw/${r.file}`);
  }
  assert.equal(gen.length, spec.raws.length);
});

test("PROMPTS.md has every generator prompt verbatim, earlier versions included, marked [GENERATOR]", () => {
  const copies = parseGeneratorPrompts(promptsMd);
  assert.deepEqual(copies.map((c) => c.id), gen.map((g) => g.id));
  for (const g of gen) {
    assert.equal(copies.find((c) => c.id === g.id).text, g.text, g.id);
    assert.deepEqual(copies.find((c) => c.id === g.id).previous, g.previous, g.id);
  }
  for (const m of promptsMd.matchAll(/^### (?:\[GENERATOR\] )?G\d+/gm)) assert.match(m[0], /\[GENERATOR\]/);
});

test("author prompts in PROMPTS.md are numbered #1, #2, ... in order", () => {
  const nums = [...promptsMd.matchAll(/^## Prompt #(\d+)/gm)].map((m) => Number(m[1]));
  assert.ok(nums.length >= 1);
  assert.deepEqual(nums, nums.map((_, i) => i + 1));
});

test("mouth sizes in blocks: small 6 x 3, open 6 x 4 (inside 4 x 2), round 4 x 4, wide 1.5 x by 3", () => {
  const t = (id) => gen.find((g) => g.id === id).text;
  assert.match(t("G5"), /as wide as the closed smile and 3 blocks tall/);
  assert.match(t("G6"), /as wide as the closed smile and 4 blocks tall, so the dark inside is 4 blocks wide and 2 blocks tall/);
  assert.match(t("G7"), /4 blocks wide and 4 blocks tall with the four corner blocks left out/);
  assert.match(t("G8"), /one and a half times as wide as the closed smile and 3 blocks tall/);
  assert.doesNotMatch(t("G8"), /raised/);
});

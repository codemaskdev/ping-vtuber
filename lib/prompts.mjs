// Reads generator prompts from art/GENERATOR_PROMPTS.md and PROMPTS.md.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./spec.mjs";

export const GENERATOR_PROMPTS_FILE = path.join(ROOT, "art", "GENERATOR_PROMPTS.md");
export const PROMPTS_FILE = path.join(ROOT, "PROMPTS.md");

// Sections start with a heading "## G1 · title" (or "### [GENERATOR] G1 · title" in PROMPTS.md); the prompt is the
// first ```text block after it.
export function parseGeneratorPrompts(md) {
  const out = [];
  const re = /^#{2,3} (?:\[GENERATOR\] )?(G\d+) · (.+)$/gm;
  const heads = [...md.matchAll(re)];
  heads.forEach((h, i) => {
    const body = md.slice(h.index + h[0].length, i + 1 < heads.length ? heads[i + 1].index : md.length);
    const text = body.match(/```text\n([\s\S]*?)\n```/);
    // Earlier versions kept next to the current text: "#### G3 text used for attempt 1 (G3-01)" + a text block.
    const previous = [...body.matchAll(/^#### (G\d+ text used for attempts? ([\d, and]+)[^\n]*)\n\n```text\n([\s\S]*?)\n```/gm)]
      .map((m) => ({ label: m[1], attempts: m[2].match(/\d+/g).map(Number), text: m[3] }));
    const saveAs = body.match(/^Save as: `([^`]+)`/m);
    const attach = body.match(/^Attach: `([^`]+)`/m);
    out.push({ id: h[1], title: h[2].trim(), text: text ? text[1] : null, previous, saveAs: saveAs ? saveAs[1] : null, attach: attach ? attach[1] : null });
  });
  return out;
}

export function generatorPrompts() {
  return parseGeneratorPrompts(fs.readFileSync(GENERATOR_PROMPTS_FILE, "utf8"));
}

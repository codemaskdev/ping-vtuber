// Rewrites the "## Generator prompts" section of PROMPTS.md from art/GENERATOR_PROMPTS.md: every current prompt and
// every earlier version kept next to it, marked [GENERATOR]. The intro paragraph of the section is kept.
//
//   npm run prompts:copy
import fs from "node:fs";
import { PROMPTS_FILE, generatorPrompts } from "../lib/prompts.mjs";

const md = fs.readFileSync(PROMPTS_FILE, "utf8");
const cut = md.indexOf("## Generator prompts\n");
const intro = md.slice(cut).split("\n").slice(0, 3).join("\n");
let s = md.slice(0, cut) + intro + "\n\n";
for (const p of generatorPrompts()) {
  s += `### [GENERATOR] ${p.id} · ${p.title}\n\nSave as: \`${p.saveAs}\`\n` + (p.attach ? `Attach: \`${p.attach}\`\n` : "") + "\n```text\n" + p.text + "\n```\n\n";
  for (const v of p.previous) s += `#### ${v.label}\n\n\`\`\`text\n${v.text}\n\`\`\`\n\n`;
}
fs.writeFileSync(PROMPTS_FILE, s.trimEnd() + "\n");
console.log("PROMPTS.md generator prompts rewritten");

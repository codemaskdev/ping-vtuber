// Promotes attempts the author chose to art/raw/<name>.png: an unmodified copy, sha256 checked at source and copy,
// recorded in art/generations.json (images.<name> and attempts.<id>.promotedTo). Only on the author's decision.
//
//   npm run promote -- --by "the author, prompt #11" G2-02=02-head.png G3-02=03-brows.png ...
import fs from "node:fs";
import path from "node:path";
import { sha256 } from "../lib/png.mjs";
import { ROOT, loadSpec } from "../lib/spec.mjs";

const args = process.argv.slice(2);
const by = (() => { const i = args.indexOf("--by"); return i >= 0 ? args[i + 1] : null; })();
const pairs = args.filter((a) => /^G\d+-\d\d=\d\d-[a-z0-9_]+\.png$/.test(a)).map((a) => a.split("="));
if (!by || !pairs.length) { console.error('usage: npm run promote -- --by "<who and where>" G2-02=02-head.png ...'); process.exit(1); }
const spec = loadSpec();
const gfile = path.join(ROOT, "art", "generations.json");
const g = JSON.parse(fs.readFileSync(gfile, "utf8"));
for (const [id, name] of pairs) {
  const raw = spec.raws.find((r) => r.file === name);
  const a = g.attempts[id];
  if (!raw || !a || a.prompt !== raw.prompt) { console.error(`${id} → ${name}: the attempt's prompt is not the one layers.json gives ${name}`); process.exit(1); }
  const from = path.join(ROOT, "art", "raw", "attempts", `${id}.png`), to = path.join(ROOT, "art", "raw", name);
  fs.copyFileSync(from, to);
  const s = sha256(fs.readFileSync(from)), c = sha256(fs.readFileSync(to));
  if (s !== c || s !== a.sha256) { console.error(`${id}: sha256 source ${s}, copy ${c}, recorded ${a.sha256}`); process.exit(1); }
  g.images[name] = { fromAttempt: id, sha256: c, promotedBy: by, metadataApproved: true, metadataApprovedBy: by };
  a.promotedTo = `art/raw/${name}`;
  console.log(`${id} → art/raw/${name}  sha256 ${c} (source ${s})`);
}
g.images = Object.fromEntries(Object.entries(g.images).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
fs.writeFileSync(gfile, JSON.stringify(g, null, 2) + "\n");

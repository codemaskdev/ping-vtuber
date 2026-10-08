// Dumps the embedded metadata of every file in art/raw/ (or the files given) for the author to review before any
// raw file is committed: exiftool (EXIF, XMP, PNG text, C2PA where it can), c2patool if installed, and this
// repository's own PNG chunk list with a yes/no for a C2PA/JUMBF chunk. Prints only; writes nothing.
//
//   npm run metadata
//   npm run metadata -- path/to/file.png
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { c2paChunks, describeChunks, sha256 } from "../lib/png.mjs";
import { ROOT, rel } from "../lib/spec.mjs";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dir = path.join(ROOT, "art", "raw");
const files = args.length ? args.map((a) => path.resolve(a)) : fs.readdirSync(dir).filter((f) => !f.startsWith(".")).sort().map((f) => path.join(dir, f));
if (!files.length) { console.error("art/raw/ is empty"); process.exit(1); }

// Run from the repo root with repo-relative paths and in UTC, so no local path or time zone is printed.
const tool = (cmd, a) => {
  const r = spawnSync(cmd, a, { encoding: "utf8", cwd: ROOT, env: { ...process.env, TZ: "UTC" } });
  if (r.error) return null;
  return (r.stdout + r.stderr).trimEnd();
};

for (const file of files) {
  const buf = fs.readFileSync(file);
  console.log(`\n=== ${rel(file)}  ${buf.length} bytes  sha256 ${sha256(buf)}`);
  const exif = tool("exiftool", ["-a", "-u", "-G1", "-s", rel(file)]);
  console.log("--- exiftool -a -u -G1 -s");
  console.log(exif === null ? "exiftool not installed" : exif);
  const c2pa = tool("c2patool", [rel(file)]);
  console.log("--- c2patool");
  console.log(c2pa === null ? "c2patool not installed" : c2pa);
  console.log("--- PNG chunks (lib/png.mjs)");
  if (buf.subarray(1, 4).toString("latin1") !== "PNG") { console.log("not a PNG file"); continue; }
  for (const c of describeChunks(buf)) console.log(`${c.type}  ${c.length}${c.keyword ? `  keyword ${JSON.stringify(c.keyword)}` : ""}`);
  const found = c2paChunks(buf);
  console.log(`C2PA/JUMBF chunk: ${found.length ? "present (" + found.map((c) => `${c.type} ${c.length} bytes`).join(", ") + ")" : "absent"}`);
}

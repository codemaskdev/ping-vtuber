// Metadata dumps of the audio files for review (author's prompt #16: approved for committing if they show the encoder
// tag only). Per file: exiftool -a -u -G1 -s, run from the repository root in UTC, saved as <name>.metadata.txt next
// to the file, and a verdict: which tags are embedded in the file itself (everything except exiftool's own lines,
// the file system, the file type, the MPEG frame header and exiftool's computed values) and whether that is exactly
// one encoder tag.
//
//   npm run audio:metadata                  audio/raw/*.mp3 and audio/dev/*.mp3
//   npm run audio:metadata -- <file.mp3>...
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "../lib/png.mjs";
import { ROOT, rel } from "../lib/spec.mjs";

const NOT_EMBEDDED = ["ExifTool", "System", "File", "MPEG", "Composite"];

export function embeddedTags(dump) {
  const out = [];
  for (const line of dump.split("\n")) {
    const m = line.match(/^\[([^\]]+)\]\s+(\S+)\s*:\s*(.*)$/);
    if (m && !NOT_EMBEDDED.includes(m[1])) out.push({ group: m[1], tag: m[2], value: m[3] });
  }
  return out;
}
export const encoderOnly = (tags) => tags.length === 1 && /^ID3v2_\d$/.test(tags[0].group) && tags[0].tag === "EncoderSettings";

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const files = args.length ? args.map((a) => path.resolve(a)) : ["raw", "dev"].flatMap((d) => fs.readdirSync(path.join(ROOT, "audio", d)).filter((f) => f.endsWith(".mp3")).sort().map((f) => path.join(ROOT, "audio", d, f)));
  let all = true;
  for (const file of files) {
    const r = spawnSync("exiftool", ["-a", "-u", "-G1", "-s", rel(file)], { encoding: "utf8", cwd: ROOT, env: { ...process.env, TZ: "UTC" } });
    if (r.error) throw new Error("exiftool is not installed");
    const dump = (r.stdout + r.stderr).trimEnd();
    const buf = fs.readFileSync(file);
    const tags = embeddedTags(dump), ok = encoderOnly(tags);
    all &&= ok;
    const text = `=== ${rel(file)}  ${buf.length} bytes  sha256 ${sha256(buf)}\n--- exiftool -a -u -G1 -s\n${dump}\n--- embedded tags: ${tags.map((t) => `[${t.group}] ${t.tag} = ${t.value}`).join("; ") || "none"}\n--- encoder tag only: ${ok ? "yes" : "NO"}\n`;
    fs.writeFileSync(file.replace(/\.mp3$/, ".metadata.txt"), text);
    console.log(text);
  }
  console.log(all ? "every file: encoder tag only" : "NOT every file shows the encoder tag only: stop");
  process.exitCode = all ? 0 : 2;
}

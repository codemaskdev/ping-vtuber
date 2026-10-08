# Ping VTuber

CodeMask episode 3: a VTuber made with AI. The character is Ping, an original terminal-face character based on the
channel logo. These rules hold for the whole project.

## Rules

1. **No Live2D, no VTuber apps or their SDKs.** Not VTube Studio, VRoid, Cubism, Warudo or anything similar.
   Animation uses HyperFrames, rig and tracking code are written here.
2. **Every character image comes from the image generator.** Never draw replacement art in code and never retouch
   by hand. Every automatic processing step (crop, background removal, resize, alignment) is done by a script in this
   repository and logged (`art/process-log.json`). Failures are reported and fixed by rerunning the generator with a
   corrected prompt, never by editing pixels.
3. **Disclosure.** For every image record the generator name and version as shown in its UI, the date, and the exact
   prompt (`art/generations.json` → `art/SOURCES.json`).
4. **Camera rule** (for later steps, written down now): webcam pixels are never drawn to the page, never saved, never
   sent anywhere. This will be enforced by code and by a test.
5. **Determinism.** No `Math.random` and no wall-clock time in anything that affects output. Use the seeded generator
   in `lib/rng.mjs`. Same input gives the same bytes. Avoid `Math.pow`, `Math.exp`, `Math.sin` and similar in output
   code: their last bits may differ between engines; `+ - * /`, `Math.sqrt` and `Math.round` are exact.
6. **Numbers.** Only measured ones, each with the command that produced it. Never estimate, never round in the logs.
   Thresholds in `art/layers.json` are chosen limits, not measurements, and are labelled as such.
7. **PROMPTS.md** holds every prompt the author sends, verbatim and numbered, plus every generator prompt, marked
   `[GENERATOR]`. Generator prompts in PROMPTS.md must match `art/GENERATOR_PROMPTS.md` exactly (a test checks this).
8. **DEVLOG.md**: what was done, what broke, and the real numbers.
9. **Anonymity.** Commits authored as CodeMask, with UTC dates, never the global git identity:
   `TZ=UTC git -c user.name=CodeMask -c user.email=codemask@users.noreply.github.com commit …`
   No local paths, no usernames, no `.DS_Store`, no personal data in any file (a test checks tracked files and
   commit authors).
10. **All repository text in English.**

## Workflow

- Node 22 or newer (`.nvmrc` pins 24.15.0; byte-for-byte output is only promised on that version, since PNG
  compression comes from Node's zlib). `npm test` runs everything.
- Raw generator files are never committed before the author has seen their embedded metadata (EXIF, XMP, C2PA) and
  approved them.
- Test fixtures are made by code, live only under `test/fixtures/`, are labelled `TEST FIXTURE` in the pixels and in
  a PNG text chunk, and the scripts refuse to use them as character art.
- Do not push and do not add a remote unless the author asks.

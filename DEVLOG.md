# Devlog

Commands run from the repository root with Node 24.15.0. Numbers are pasted as measured.

## 2026-10-08 · Step 1 setup: repository, layer spec, generator prompts, processing on fixtures

What was done
- Looked at the CodeMask host avatar (`Avatar/` in the CodeMask repo): its layers are one full 1254 x 1254 picture
  (`body.jpg`) plus cropped sprites (`head.png` 669 x 701 with alpha, `eyeL.png`, `eyeR.png`, `mouth.png` without
  alpha) placed by hard-coded offsets in `avatar.js`; head rotates around a neck pivot at (650, 760). Its HyperFrames
  preview pins `hyperframes@0.8.133`; the episodes pipeline uses `hyperframes@0.8.134`. Kept: the 1254 x 1254 canvas,
  one PNG per layer named by its key in code, a flat `layers/` folder. Changed: every layer is a full-canvas PNG with
  alpha, so no offsets in code; placement lives in `art/layers.json`.
- Repository, rules (`CLAUDE.md`), layer spec, generator prompts G1…G7, processing, `check:layers`, contact sheet,
  `SOURCES.json`, tests. One dependency: `pngjs` 7.0.0.

What broke
- The first contact sheet showed wrong glyphs for S, W and "-" in the label font (hand-typed 35-character strings).
  Rewrote the font as rows separated by "|" and added a test that every glyph is 7 rows of 5 cells.
- Composite labels on the contact sheet overlapped the next tile. Labels are now the mouth id only.
- `node --test test/` fails on Node 24.15.0 ("Cannot find module .../test"); the script now passes the glob
  `"test/*.test.mjs"`.
- The hygiene test matched itself twice: its own home-folder path needle, and its Cyrillic character range, which the file
  writer had turned from `\u0400-\u04FF` escapes into literal characters. Both are now built from parts at runtime.

Numbers (fixtures, not character art)
- `npm run check:layers -- --fixtures` found the shifts built into the fixtures: 02-head 2,-1; 04-mouth_small 1,1;
  06-mouth_round -3,2; others 0,0. Full table in the step 1 report and reproducible with that command.
- `npm test`: tests 39, pass 39, fail 0, duration_ms 57193.093333.

## 2026-10-08 · Prompts and regions follow the logo

- The author added `art/reference/logo-5A.svg` (642 bytes, sha256
  0647760785308e9f15671161247cb78fc54add8c3a95ffbda965ebdc99bf2d33) while step 1 was being built; it went into the
  first commit before it had been read. Read since: plain shapes, no metadata. A 64 x 64 square screen (rx 12, stroke
  #2ee6ff, fill #0b0d13), a dim ">" prompt and a #ff4d6d cursor block top left, two mirrored slanted eye shapes, a
  pixel-block smile. No brows.
- The first prompts had been written without it and described another face (wider-than-tall screen, upright block
  eyes, a line mouth). Rewrote G1 to keep the logo's design and add neutral brows; G2 keeps the prompt and cursor on
  the empty screen; the mouths are built from the logo's pixel blocks.
- Regions and pivots moved to the logo's geometry, the screen drawn 878 px wide at x, y 188..1066 (logo unit u maps
  to 188 + (u - 1.5) * 878 / 61): brows y 380..505, eyes 505..705, mouths 705..1000; pivots brows (627, 445),
  eyes (627, 605), mouths (627, 828), head (627, 1066). Fixtures moved with them.
- What broke: the commit-author test expected "+00:00"; `git log --format=%aI` with TZ=UTC prints "Z". Both accepted.
- `npm test`: tests 39, pass 39, fail 0, duration_ms 56049.653083.

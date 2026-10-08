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

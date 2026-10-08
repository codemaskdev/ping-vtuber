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

## 2026-10-08 · Review of step 1: master-sized canvas, measured regions, cursor layer, calibration-only limits

What was done (prompt #2)
- Canvas: no fixed size. It is the master's own pixel size; every raw must match it exactly, a raw of another size
  fails, nothing is resampled (the resample step was removed from processing; the contact sheet still scales its
  thumbnails for display, the layers are never scaled).
- Regions and pivots are no longer typed in. `npm run regions` measures them on the master with the rules written in
  `art/layers.json` (regionRule, pivotRule) before any master existed: margin = ceil(screenWidth x 3 / 100); the
  cursor, eyes and mouth boxes come from the master compared with the empty screen. They are written to
  `art/regions.json` and frozen once the master is approved. When the real master arrives, its regions will be
  fitted to it by this script and DEVLOG will say so.
- New `cursor` layer (child of head, from the master). G2 now removes eyes, mouth and cursor and keeps the chevron.
  Brows are their own edit (G3) of a master without brows. New order: G1 master, G2 head, G3 brows,
  G4 eyes_closed, G5-G8 mouths. Every edit starts "Edit the attached image"; the master is attached each time.
- Prompts: only the screen's outer outline glows; face shapes and the cursor have crisp edges. Hollow mouths have a
  one-block outline.
- check:layers prints the screen box size of every variant next to the master's. Offset, drift and screen size are
  shown as "measured": `checks` limits are null until chosen after looking at the first real run. Canvas size,
  inside-region and corner alpha stay pass/fail.
- The eyes_closed fixture now lies on the eye's bottom edge, as G4 says; a test checks it.
- `npm run metadata`: exiftool output, c2patool output if installed, and the PNG chunk list with a C2PA/JUMBF yes/no.
  A test refuses any committed raw that is not marked `metadataApproved` in `art/generations.json`.
- `art/layers/*.png` will be committed; a test reprocesses `art/raw` and compares bytes with them (skipped until the
  real images and regions exist).
- Fixtures are 800 x 800, a size no real generator output is assumed to have, and follow the logo's geometry.

Tools
- `brew install exiftool`: exiftool 13.55 installed.
- `brew install c2patool` did not install cleanly, twice: "Error: c2patool: A `brew install c2patool` process has
  already locked /opt/homebrew/Cellar/openssl@3." with no other brew process running. Left uninstalled; the
  metadata script lists PNG chunks itself and reports whether a caBX (C2PA) or JUMBF chunk is present.

What broke, and decisions it forced
- "Hollow, one block thick" and "one quarter as tall as wide" cannot both hold: the smile is 6 blocks wide, a quarter
  of that is 1.5 blocks, too short for a hollow shape with one-block walls. Mouth sizes are now in blocks: small 6 x 3,
  open 6 x 4, round 4 x 4 without corners, wide 9 x 3 (the raised ends of the old wide mouth were dropped).
- A mouth centred on the smile would grow up into the eyes: in the logo the gap between eye bottom and smile top is
  7 of 64 units, and an "open" mouth 2/3 as tall as it is wide reaches 6 units above the smile's centre. Every mouth
  now keeps the smile's top edge and opens downward, and the mouth region rule follows that.
- The screen box includes the outline's bright halo, so it also moves with brightness: the fixture tinted by +3 on
  every channel measured 615 x 615 against the master's 613 x 613 with no change of scale
  (`npm run check:layers -- --fixtures`). Worth knowing when the scale limit is chosen.
- `npm test`: tests 53, pass 52, fail 0, skipped 1 (reprocess vs committed layers: no real art yet), duration_ms 29234.18675.

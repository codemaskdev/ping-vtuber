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

## 2026-10-08 · Review round 2: mouth_open 6 x 5, full-size composites, master review, partial runs

- Prompts #3 and #4 were sent in Russian; PROMPTS.md holds them as English translations, marked as such, because
  all repository text is English.
- The author's first logo drop put `logo-5A.svg` (moved from art/reference/, sha256 unchanged) into art/raw/ and no
  PNG. Moved back to art/reference/ on the author's word. `logo-5A.png` is not in yet.
- mouth_open is now 6 x 5 blocks (dark inside 4 x 3): G6, the mouth region rule (depth max(h, ceil(5w / 6)) +
  margin), the fixtures and the tests changed with it. The fixture label on the screen moved down by 3 px so it stays
  between the open mouth and the outline.
- `npm run sheet` also writes full-size, unscaled composites to out/composites/: glow + head + cursor + eyes_open
  with each mouth, one with eyes_closed, one with brows.
- `npm run review` writes out/master-review.png: the master at full size with the measured regions and pivots drawn
  on it. It refuses any path in art/.
- `--partial` for process and check:layers, for Part D stage 1 when only 01-master.png and 02-head.png are in.
- Identity check: the latest bug-driver commit and this repo's both print `CodeMask <codemask@users.noreply.github.com>`.
- `npm test`: tests 58, pass 57, fail 0, skipped 1 (reprocess vs committed layers: no real art yet), duration_ms 31663.011834.

## 2026-10-08 · Generator through Codex CLI; Part D stage 1 (G1, G2)

What was done (prompt #7)
- `scripts/generate.mjs` makes every generator call: `codex exec --json --sandbox read-only -C . -i <input>`, task on
  stdin = fixed wrapper (lib/attempts.mjs, logged in PROMPTS.md) + the generator prompt byte for byte. Raw event
  log, stderr, task and Codex's session file go to logs/codex/ (gitignored). `scripts/extract-attempt.mjs` writes
  the committed extract art/attempts/<id>.json and the disclosure entry in art/generations.json.
- Logo: art/reference/logo-5A.png sha256 05bb7b746c89d52a363db1a896708f4a0d291ba6e2c46badbb5faa7bcbc70e06, 29096
  bytes, 1024 x 1024, chunks IHDR bKGD IDAT IEND, no text chunks, no C2PA (`npm run metadata --
  art/reference/logo-5A.png`). Committed as reference.
- G1-01 (input: the logo): `time node scripts/generate.mjs G1` 48.165 s total, exit 0, one image, 1254 x 1254,
  sha256 c095a94da19f4e145eb5e2adee542a8d92cc350dfd25fba302d1c33bcd32a81a at source and copy.
- G2-01 (input: G1-01, the stage 1 exception): exit 0, one image, 1254 x 1254, sha256
  923936cdc85c7ff4b38d39426174b4e9f76a000d07e8ac9f03375e2ac837e7b4 at source and copy.
- Both: Codex CLI 0.161.0, session model gpt-5.5, tool image_gen.imagegen called once, the prompt it received is
  identical to ours (and so is the tool's revisedPrompt). The image model is not named in Codex's logs; the C2PA
  manifest in each output names softwareAgent "ChatGPT" version "gpt-image", claim generator "OpenAI Media Service
  API" (exiftool). Metadata dumps: art/attempts/G1-01.metadata.txt, G2-01.metadata.txt. No EXIF, no XMP.
- Regions on G1-01 / G2-01 (`npm run stage1 -- art/raw/attempts/G1-01.png art/raw/attempts/G2-01.png`): REJECTED by
  the region rule, so no partial check:layers table and no master-review.png. Diagnostic view: out/stage1/blobs.png.
  02-head offset 0,0; margin 29; screen box 147,152,959,950; 12 blobs, 6 kept (>= 841 px):
  - blob 1, box 162,165,924,238, 2880 px, diff max 152, 508 px > 72: thin rims along the top of the screen outline;
  - blob 12, box 162,870,927,218, 3357 px, diff max 167, 1558 px > 72: the same along the bottom;
  - blob 2, box 268,280,170,125, 10753 px, 6173 red: the cursor, joined with the chevron, which G2-01 redrew in a
    different colour although G2 says to keep it;
  - blobs 5, 6 (eyes, 28228 and 28254 px) and 11 (mouth, 14820 px) are as expected.

What broke
- `-i` takes several values, so the trailing "-" (meant as "task on stdin") was read as a second image in G1-01.
  Codex put "Codex could not read the local image at `-`: No such file or directory (os error 2)" into the user
  message; the task itself still came from stdin and the image tool got our prompt unchanged. Recorded in the G1-01
  extract (injectedByCodex). Fixed before G2-01: no "-", and a test.
- The --json event stream does not show the tool call (only thread, turn, agent message, usage). The prompt passed
  to the tool and the session model are read from Codex's session file, kept in logs/ with the event log.
- The first G2-01 extract still held a path under the home folder (the tool's referenced_image_paths). The sanitizer
  now makes repository paths relative first; both extracts were rewritten before any commit.
- The first per-blob diagnostics summed over each blob's box, and box 1 contains blob 2, so its numbers were wrong
  (13629 pixels for a 2880-pixel blob). Now summed per blob label; the numbers above are from that version.
- The extract hygiene test first matched the word "account" in the extracts' own $comment; it now checks JSON keys
  (no account, e-mail, user, session, thread, auth or token keys) and strings for paths, e-mail addresses and ids.
- `npm test`: tests 66, pass 65, fail 0, skipped 1 (reprocess vs committed layers: no approved raws yet),
  duration_ms 31683.754583.

## 2026-10-08 · Stage 1 review applied; regions frozen; G2-02, G3-G8; stage 2 calibration

Decisions (prompt #8) and what was done
- G1-01 promoted, unmodified, to art/raw/01-master.png (sha256 c095a94da19f4e145eb5e2adee542a8d92cc350dfd25fba302d1c33bcd32a81a
  at both); its metadata approved by the author (C2PA only). It is the only raw file committed.
- Region rule changed after seeing G1-01 and G2-01, labelled so in art/layers.json (regionRule.changedAfterSeeing,
  interior, cursor): faces are searched only inside the screen shrunk by the margin; the cursor is the master's red
  pixels there; the chevron is head. To make "the chevron is head" work, pixels lit in the empty screen (max channel
  >= silhouetteThreshold 48) are never feature pixels, in the region rule and in feature extraction. That last part
  is my implementation of the author's rule, chosen after seeing the data.
- mouth_open back to 6 x 4 blocks (G6, mouth region rule depth max(h, ceil(2w / 3)) + margin, fixtures, tests).
  `npm run measure:master`: smile box 480,788,294,99; smile top edge y 788; end blocks 50 px wide and 50 px tall
  (top-row runs [480,50] and [723,51]); bar 49 px tall; smile width / 6 = 49, height / 2 = 49.5; inner bottom edge
  of the outline below the smile's centre y 1048; room from the smile top to the outline 260 px = 5.2 blocks of 50 px.
- Regions (`npm run stage2 -- regions G2-01`, base G2-01 as the provisional head): margin 29, screen
  147,152,959,950, inside 230,231,794,788, 02-head offset 0,0; found the cursor (379,291,59,103), two eyes (joint
  345,518,564,172) and the mouth (480,788,294,99); 5 blobs, 3 kept, 2 under 841 px ignored (chevron edges, 70 and
  97 px). No overlaps. Frozen (`npm run regions -- --freeze`); review image out/master-review.png.
- Attempts G2-02, G3-01 ... G8-01 (input art/raw/01-master.png): all exit 0, one image each, 1254 x 1254, one tool
  call, prompt passed identical to ours, session model gpt-5.5, C2PA gpt-image. Metadata dumps in art/attempts/.
- Chevron (`npm run compare:heads -- G2-01 G2-02`; masks: outline 168688 px, chevron 4733 px, inside 364442 px):
  - master chevron mean RGB 27.552714979928165, 142.27424466511727, 165.58229452778366;
  - G2-01: 30.27403338263258, 173.17282907246988, 199.6712444538348; mean |RGB difference| outline
    6.19678143475924, chevron 24.284386224381997, inside the screen 1.7938190439082213;
  - G2-02: 19.987745615888443, 145.38178744982042, 171.92372702302978; outline 5.691950030035727, chevron
    6.801253609409113, inside the screen 1.303507828406166.
- Stage 2 calibration (`npm run stage2 -- calibrate G2-01 G3-01 G4-01 G5-01 G6-01 G7-01 G8-01`; sources are
  provisional; output in out/stage2/, not committed). No limits set. Table as printed:

```
| layer       | source             | canvas    | alpha bbox x,y,w,h | region x,y,w,h    | inside | changed blobs (outside) | corner alpha TL,TR,BL,BR | offset dx,dy | drift mean (sum/samples)             | screen w,h (master w,h) | status                                                                                |
|-------------|--------------------|-----------|--------------------|-------------------|--------|-------------------------|--------------------------|--------------|--------------------------------------|-------------------------|---------------------------------------------------------------------------------------|
| glow        | 02-head.png        | 1254x1254 | 137,141,980,971    | 0,0,1254,1254     | yes    | 4 (0)                   | 0,0,0,0                  | 0,0          | 1.5692632798970356 (5822006/3710025) | 956,948 (959,950)       | measured                                                                              |
| head        | 02-head.png        | 1254x1254 | 149,153,956,948    | 118,123,1017,1008 | yes    | 4 (0)                   | 0,0,0,0                  | 0,0          | 1.5692632798970356 (5822006/3710025) | 956,948 (959,950)       | measured                                                                              |
| cursor      | 01-master.png      | 1254x1254 | 378,291,60,103     | 350,262,117,161   | yes    | master                  | 0,0,0,0                  | master       | master                               | 959,950 (959,950)       | ok                                                                                    |
| eyes_open   | 01-master.png      | 1254x1254 | 345,518,564,172    | 316,489,622,230   | yes    | master                  | 0,0,0,0                  | master       | master                               | 959,950 (959,950)       | ok                                                                                    |
| eyes_closed | 04-eyes_closed.png | 1254x1254 | 354,625,547,42     | 316,489,622,230   | yes    | 2 (0)                   | 0,0,0,0                  | 0,0          | 1.5526169054191705 (6560266/4225296) | 955,947 (959,950)       | measured                                                                              |
| brows       | 03-brows.png       | 1254x1254 | 345,477,564,12     | 316,423,622,66    | yes    | 2 (2)                   | 0,0,0,0                  | 0,0          | 1.5091606487864748 (6856310/4543128) | 958,949 (959,950)       | FAIL: changed outside its regions: [346,477,222,43] 4664 px, [686,477,223,21] 4681 px |
| mouth_rest  | 01-master.png      | 1254x1254 | 480,788,294,99     | 377,759,500,254   | yes    | master                  | 0,0,0,0                  | master       | master                               | 959,950 (959,950)       | ok                                                                                    |
| mouth_small | 05-mouth_small.png | 1254x1254 | 479,787,296,127    | 377,759,500,254   | yes    | 1 (0)                   | 0,0,0,0                  | 0,0          | 1.4959255064557395 (6403357/4280532) | 957,948 (959,950)       | measured                                                                              |
| mouth_open  | 06-mouth_open.png  | 1254x1254 | 486,759,282,176    | 377,759,500,254   | yes    | 1 (0)                   | 0,0,0,0                  | 0,0          | 1.6122400206329495 (6901245/4280532) | 956,948 (959,950)       | measured                                                                              |
| mouth_round | 07-mouth_round.png | 1254x1254 | 522,759,210,175    | 377,759,500,254   | yes    | 1 (1)                   | 0,0,0,0                  | 0,0          | 1.7481572383993391 (7483043/4280532) | 957,948 (959,950)       | FAIL: changed outside its regions: [480,739,294,194] 25568 px                         |
| mouth_wide  | 08-mouth_wide.png  | 1254x1254 | 416,788,422,103    | 377,759,500,254   | yes    | 1 (0)                   | 0,0,0,0                  | 0,0          | 1.4159415231564674 (6060983/4280532) | 956,948 (959,950)       | measured                                                                              |
```

What broke
- The inside-region check could never fail for a feature layer: extraction cuts each feature to its region, so its
  alpha box is inside by construction. Seen in this run: mouth_open and mouth_round boxes started exactly at the
  region's top (759). Added the changed-blob check (layers.json checks.$comment) and a test with a shape drawn past
  its region. With it, two attempts fail:
  - G7-01 (mouth_round): the ring starts at y 739, a block above the smile's top edge 788, 20 px above the mouth
    region; the layer had been cut at 759.
  - G3-01 (brows): the brows sit at y 477, close above the eyes (top 518); they reach y 497 and 498, below the brows
    region's bottom 489, and the blob joins the eyes' top edge (to y 520). The layer had been cut at 489.
- G6-01 (mouth_open) also did not keep the smile's top edge: it starts at y 759/760, 28 px above 788, inside the
  region by 1 px. It passes.
- `npm test`: tests 69, pass 67, fail 0, skipped 2 (reprocess vs committed layers, and the empty-art/raw CLI check, both waiting for promoted raws), duration_ms 43203.035.

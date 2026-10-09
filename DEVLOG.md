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

## 2026-10-08 · Stage 2 review applied: G2-02 as base, second attempts of G3, G6, G7, calibration again

- Regions measured again with G2-02 as the base, in memory (`npm run stage2 -- compare-regions G2-02`): 28 of 28
  boxes and pivots identical to the frozen ones, G2-02 offset 0,0. Recorded with `--record`: art/regions.json base is
  now G2-02 (sha256 30bc8b270bccd1d9190a0ac5fb0fa68624074fc523f8f6a64c0fe67ab086fa89), G2-01 kept in baseHistory;
  regions and pivots unchanged, still frozen.
- Stroke widths of the accepted provisional sources (`npm run measure:shapes`; one block = 50 px, from
  `npm run measure:master`): G4-01 closed-eye bars 41 px (left) and 42 px (right) tall; G5-01 strokes top 39, bottom
  41, left 42, right 42 px; G8-01 strokes top 35, bottom 32, left 37, right 38 px. Not regenerated.
- G3, G6, G7 corrected as the author wrote them (prompt #9); the attempt-1 texts stay next to them in
  art/GENERATOR_PROMPTS.md and PROMPTS.md (`npm run prompts:copy`). Extracts now record promptVersion, compared with
  the prompt inside the task Codex received, not with today's file.
- G3-02, G6-02, G7-02: exit 0, one image each, 1254 x 1254, prompt passed identical (current text). Attempt 2 of 2
  for each; no third attempt.
- Shapes, uncut by regions (`npm run measure:shapes -- master G3-01 G3-02 G4-01 G5-01 G6-01 G6-02 G7-01 G7-02 G8-01`):
  - mouth top edges next to the smile's 788: master 788; G5-01 788; G6-01 759 (-29); G6-02 776 (-12); G7-01 738
    (-50); G7-02 743 (-45); G8-01 789 (+1). G6-02 is closer to 788 than G6-01, so G6-02 is the G6 candidate.
  - brows: G3-01 box 345,477,564,41 (left brow reaches y 517); G3-02 box 356,470,543,20, bottom y 489; brows region
    316,423,622,66, bottom y 488. Eyes top y 518, cursor bottom y 393.
- Stage 2 calibration again (`npm run stage2 -- calibrate G2-02 G3-02 G4-01 G5-01 G6-02 G7-02 G8-01`), no limits:

```
| layer       | source             | canvas    | alpha bbox x,y,w,h | region x,y,w,h    | inside | changed blobs (outside) | corner alpha TL,TR,BL,BR | offset dx,dy | drift mean (sum/samples)             | screen w,h (master w,h) | status                                                                                |
|-------------|--------------------|-----------|--------------------|-------------------|--------|-------------------------|--------------------------|--------------|--------------------------------------|-------------------------|---------------------------------------------------------------------------------------|
| glow        | 02-head.png        | 1254x1254 | 137,141,980,971    | 0,0,1254,1254     | yes    | 4 (0)                   | 0,0,0,0                  | 0,0          | 1.2810288340375064 (4752649/3710025) | 957,948 (959,950)       | measured                                                                              |
| head        | 02-head.png        | 1254x1254 | 148,153,957,948    | 118,123,1017,1008 | yes    | 4 (0)                   | 0,0,0,0                  | 0,0          | 1.2810288340375064 (4752649/3710025) | 957,948 (959,950)       | measured                                                                              |
| cursor      | 01-master.png      | 1254x1254 | 350,291,88,103     | 350,262,117,161   | yes    | master                  | 0,0,0,0                  | master       | master                               | 959,950 (959,950)       | ok                                                                                    |
| eyes_open   | 01-master.png      | 1254x1254 | 345,518,564,172    | 316,489,622,230   | yes    | master                  | 0,0,0,0                  | master       | master                               | 959,950 (959,950)       | ok                                                                                    |
| eyes_closed | 04-eyes_closed.png | 1254x1254 | 354,625,547,42     | 316,489,622,230   | yes    | 2 (0)                   | 0,0,0,0                  | 0,0          | 1.5526169054191705 (6560266/4225296) | 955,947 (959,950)       | measured                                                                              |
| brows       | 03-brows.png       | 1254x1254 | 355,470,544,19     | 316,423,622,66    | yes    | 2 (2)                   | 0,0,0,0                  | 0,0          | 1.3891085613260292 (6310898/4543128) | 957,947 (959,950)       | FAIL: changed outside its regions: [356,470,217,20] 4328 px, [681,470,217,20] 4322 px |
| mouth_rest  | 01-master.png      | 1254x1254 | 480,788,294,99     | 377,759,500,254   | yes    | master                  | 0,0,0,0                  | master       | master                               | 959,950 (959,950)       | ok                                                                                    |
| mouth_small | 05-mouth_small.png | 1254x1254 | 479,787,296,127    | 377,759,500,254   | yes    | 1 (0)                   | 0,0,0,0                  | 0,0          | 1.4959255064557395 (6403357/4280532) | 957,948 (959,950)       | measured                                                                              |
| mouth_open  | 06-mouth_open.png  | 1254x1254 | 481,776,292,167    | 377,759,500,254   | yes    | 1 (0)                   | 0,0,0,0                  | 0,0          | 1.1349813527851211 (4858324/4280532) | 956,948 (959,950)       | measured                                                                              |
| mouth_round | 07-mouth_round.png | 1254x1254 | 522,759,211,193    | 377,759,500,254   | yes    | 1 (1)                   | 0,0,0,0                  | 0,0          | 1.6750992633625914 (7170316/4280532) | 955,948 (959,950)       | FAIL: changed outside its regions: [480,743,294,209] 27008 px                         |
| mouth_wide  | 08-mouth_wide.png  | 1254x1254 | 416,788,422,103    | 377,759,500,254   | yes    | 1 (0)                   | 0,0,0,0                  | 0,0          | 1.4159415231564674 (6060983/4280532) | 956,948 (959,950)       | measured                                                                              |
```

What failed
- G3-02 (brows): 1 px past the brows region (bottom y 489 against 488). Both attempts of G3 are used.
- G7-02 (mouth_round): the ring starts at y 743, 16 px above the mouth region (759) and 45 px above the smile's top.
  Both attempts of G7 are used.
- Not caught by a pass/fail check: with G2-02 as the base, the cursor layer (cut to its region, which reaches over
  the chevron's tip) holds 97 non-red pixels besides 6076 red ones, box 350,298,30,96, alpha up to 133: the
  chevron's tip, which G2-02 draws a little differently at its edge, and the cursor's own left edge. With G2-01 as
  the base the cursor layer box started at x 378. (Counted from out/stage2/layers/cursor.png.)
- `npm test`: tests 70, pass 68, fail 0, skipped 2 (both wait for promoted raws), duration_ms 43500.067.

## 2026-10-08 · Review of 5fb51a8: G6-01 back, two region rules changed, mouth anchors, red-only cursor

- Sources (author's prompt #10): G2-02, G3-02, G4-01, G5-01, G6-01, G7-02, G8-01. G6-01 replaces G6-02: G6-02's end
  blocks stick out 12 px above its top bar and it has visible seams. The author's rule in prompt #9, "G6-02 replaces
  G6-01 only if its top edge is closer to y 788", was wrong by the author's own account: the top edge alone did not
  judge the shape.
- Region rules changed after seeing the G3, G6 and G7 attempts, labelled in art/layers.json (regionRule
  changedAfterSeeingG3G6G7, mouth, eyes): the mouth region starts at the eyes region's bottom edge; brows and eyes
  share the boundary eyes box top - ceil(margin / 2). Measured again on the master with base G2-02
  (`npm run stage2 -- remeasure G2-02 --label ...`), no overlaps, frozen again; the old boxes are in
  art/regions.json history. Old -> new: eyes_open / eyes_closed 316,489,622,230 -> 316,503,622,216; brows
  316,423,622,66 -> 316,423,622,80 (pivot 627,456 -> 627,463, the region's centre); all mouths 377,759,500,254 ->
  377,719,500,294. glow, head, cursor unchanged.
- Mouth anchors, a rig rule (layers.json mouthAnchor): the top edge (first row with alpha >= 128) of each mouth layer
  and anchorDy = the mouth_rest layer's top edge - it are written into the process log (mouthAnchors). Composites
  and the contact sheet draw each mouth moved by anchorDy; layers are unchanged. check:layers fails a moved mouth that
  leaves the inside of the screen. The prompts' preamble and README say so.
- Cursor: cut from the master's red pixels only (extract "red"), the same rule as its region; check:layers fails any
  non-red pixel in it; tests for both.
- Calibration (`npm run stage2 -- calibrate G2-02 G3-02 G4-01 G5-01 G6-01 G7-02 G8-01`), no limits, nothing failed:

```
| layer       | source             | canvas    | alpha bbox x,y,w,h | region x,y,w,h    | inside | changed blobs (outside) | corner alpha TL,TR,BL,BR | offset dx,dy | drift mean (sum/samples)             | screen w,h (master w,h) | status   |
|-------------|--------------------|-----------|--------------------|-------------------|--------|-------------------------|--------------------------|--------------|--------------------------------------|-------------------------|----------|
| glow        | 02-head.png        | 1254x1254 | 137,141,980,971    | 0,0,1254,1254     | yes    | 4 (0)                   | 0,0,0,0                  | 0,0          | 1.2804883075319133 (4753179/3712005) | 957,948 (959,950)       | measured |
| head        | 02-head.png        | 1254x1254 | 148,153,957,948    | 118,123,1017,1008 | yes    | 4 (0)                   | 0,0,0,0                  | 0,0          | 1.2804883075319133 (4753179/3712005) | 957,948 (959,950)       | measured |
| cursor      | 01-master.png      | 1254x1254 | 379,291,59,103     | 350,262,117,161   | yes    | master                  | 0,0,0,0                  | master       | master                               | 959,950 (959,950)       | ok       |
| eyes_open   | 01-master.png      | 1254x1254 | 345,518,564,172    | 316,503,622,216   | yes    | master                  | 0,0,0,0                  | master       | master                               | 959,950 (959,950)       | ok       |
| eyes_closed | 04-eyes_closed.png | 1254x1254 | 354,625,547,42     | 316,503,622,216   | yes    | 2 (0)                   | 0,0,0,0                  | 0,0          | 1.5524761383379095 (6601793/4252428) | 955,947 (959,950)       | measured |
| brows       | 03-brows.png       | 1254x1254 | 355,470,544,20     | 316,423,622,80    | yes    | 2 (0)                   | 0,0,0,0                  | 0,0          | 1.3880977751087469 (6268644/4515996) | 957,947 (959,950)       | measured |
| mouth_rest  | 01-master.png      | 1254x1254 | 480,788,294,99     | 377,719,500,294   | yes    | master                  | 0,0,0,0                  | master       | master                               | 959,950 (959,950)       | ok       |
| mouth_small | 05-mouth_small.png | 1254x1254 | 479,787,296,127    | 377,719,500,294   | yes    | 1 (0)                   | 0,0,0,0                  | 0,0          | 1.4933306493755294 (6298349/4217652) | 957,948 (959,950)       | measured |
| mouth_open  | 06-mouth_open.png  | 1254x1254 | 486,759,282,176    | 377,719,500,294   | yes    | 1 (0)                   | 0,0,0,0                  | 0,0          | 1.6054868917587322 (6771385/4217652) | 956,948 (959,950)       | measured |
| mouth_round | 07-mouth_round.png | 1254x1254 | 522,743,211,209    | 377,719,500,294   | yes    | 1 (0)                   | 0,0,0,0                  | 0,0          | 1.6206076271821384 (6835159/4217652) | 955,948 (959,950)       | measured |
| mouth_wide  | 08-mouth_wide.png  | 1254x1254 | 416,788,422,103    | 377,719,500,294   | yes    | 1 (0)                   | 0,0,0,0                  | 0,0          | 1.4137124162922878 (5962547/4217652) | 956,948 (959,950)       | measured |
```

  cursor layer: alpha box 379,291,59,103, non-red pixels 0.
  Mouth anchors (smile top 788; inside of the screen 200,202,854,846, bottom row 1047):
  mouth_rest top 788 anchorDy 0, moved lowest row 886; mouth_small 788, 0, 913; mouth_open 759, 29, 963;
  mouth_round 743, 45, 996; mouth_wide 789, -1, 889. No moved pixel leaves the inside of the screen.

What broke
- My first anchor test built a shifted mouth with lib/image.mjs translate, which fills the rows it shifts in with
  opaque black (meant for raw images), so the test layer's top edge became row 0. Rewritten to paint a block above
  the mouth instead. A text replacement of that test also stopped at the first "});" inside a line and left stray
  lines; node --check showed it, fixed.
- `npm test`: tests 73, pass 71, fail 0, skipped 2 (both wait for promoted raws), duration_ms 55009.385792.

## 2026-10-08 · Sources promoted, limits set, art/layers committed

- Promoted unmodified (`npm run promote`), sha256 the same at source and copy, metadata approved by the author
  (prompt #11) after checking each dump again: groups ExifTool, System, File, PNG, JUMBF, Jpeg2000, CBOR, Composite
  only (C2PA), no EXIF, no XMP, no path lines; chunks IHDR caBX IDAT IEND; same as the committed dumps apart from
  file dates.
  - G2-02 → art/raw/02-head.png 30bc8b270bccd1d9190a0ac5fb0fa68624074fc523f8f6a64c0fe67ab086fa89
  - G3-02 → art/raw/03-brows.png fd4b12542ca890c4e284aa9120340c87a217781e14eb962c4197a688465ad4aa
  - G4-01 → art/raw/04-eyes_closed.png 795f27770cbdd97a71ce67c45644e2fbf9767da9fe86f8529ce835c46a4372e3
  - G5-01 → art/raw/05-mouth_small.png ce04ef178b8e98ac482b945e9881cfcbc85e83c42d3acd3fd38c6823dc4846c6
  - G6-01 → art/raw/06-mouth_open.png f2a395c77435ea68ad9a7d133778391a15aec18681844c936aed44700bca6a11
  - G7-02 → art/raw/07-mouth_round.png b4e0670207a42737fabd9e05f418221f6b4e5e70583e03e88eedd80dbe46845a
  - G8-01 → art/raw/08-mouth_wide.png 1d7eff381d3802747eaf51433cb3aae30e41b8d4e662e87ba2b288f54b45dbe0
- Limits chosen by the author after the stage 2 calibration (prompt #11), written in art/layers.json checks with the
  measured values next to them: maxOffsetPx 2 (measured: every offset 0,0); maxDrift 2.5 (measured 1.2804883075319133
  to 1.6206076271821384); screen edges 6 px per side (measured: at most 2 px on any side). "Per side" is implemented
  as a new measure: how far each edge (left, top, right, bottom) of a variant's screen box moved against the master's
  after alignment; before, only the width and height differences were measured. With all three limits set, rows that
  pass show "ok" instead of "measured".
- Known limitation, accepted by the author: the head silhouette (threshold 48) keeps the brightest part of the halo,
  so the glow layer holds only a faint band: art/layers/glow.png, 38972 pixels with alpha above 0, alpha at most 33.
  A glow pulse would need new processing or drawing the glow in code. Also in README.
- `npm run process` → art/layers/ (11 layers) and art/process-log.json; `npm run check:layers` exits 0, every row ok;
  `npm run sheet` → out/contact-sheet.png sha256 df787a99ac8bc7a1b647092942058f749dd3fa7c8a6d4229f942b94fae65ba61,
  byte for byte the same as the last calibration's sheet from the same sources, and 7 composites in out/composites/.
- Fixture runs in test/pipeline.test.mjs now measure with the limits unset (fixtures are distorted on purpose); the
  limits have their own test. The CLI test that only ran while art/raw was empty now runs check:layers on the real
  art.
- out/stage2-calibrate.txt (first run, G2-01 and G3-01/G7-01, "SOME LAYERS FAIL") deleted as asked, and
  out/stage2-calibrate-b.txt too (second run, sources with G6-02, also "SOME LAYERS FAIL"). out/stage2-calibrate-c.txt
  is the run on the accepted sources.
- `npm test` before the commit: 73 tests, 72 pass, 1 fail: "art/layers/glow.png is not committed" (the reprocess test
  requires the layers to be tracked). After committing: tests 73, pass 73, fail 0, skipped 0, duration_ms
  67238.940209; the two tests that were skipped (reprocess equals the committed layers; check:layers CLI on the real
  art) both ran and passed.

## 2026-10-08 · Step 2: the rig (prompt #12)

What was done
- `scripts/build-rig.mjs` → rig/rig.json: layers, parents and z from art/layers.json; pivots and regions from the
  frozen art/regions.json; each mouth's anchorDy from art/process-log.json; canvas 1254 x 1254; head pivot 626,1102;
  smile top 788.
- browsRestDy, chosen rule (labelled in rig.json): the dark gap between the brows' bottom edge and the eyes' top edge
  equals one smile block. Measured (`npm run rig`): brows bottom row 489, eyes top row 518, gap 28 px, block 50 px
  (the smile's first raised end block, on the row below its top edge) → browsRestDy = 28 - 50 = -22.
- Pose limits, chosen values (labelled in rig.json): head tilt -4..4 degrees, head shift x -30..30 and y -30..30 px,
  brows dy -47..13 (keeps the brows inside their frozen region 316,423,622,80), glow opacity 0..1. Tilt and shift were
  chosen so no layer's alpha box can leave the canvas; the check (rig.json fitCheck) bounds each box corner's move by
  r * theta + shift without trigonometry; smallest room left 19.26524282106189 px (glow). A first choice of 6 degrees
  would not have fitted by that bound (the glow box corner 1078 px from the pivot moves up to 112.9 px at 6 degrees
  plus 42.4 px of shift, more than its 137 px of room), so 4 was chosen.
- lib/rig.mjs: drawList(rig, pose), validatePose, skeleton, neutralPose. No imports, no Node API, no trigonometry.
- HyperFrames, as in the host avatar's preview (Avatar/preview: a generated index.html with one canvas, a paused GSAP
  timeline whose proxy tween draws the frame for the current time, vendor/gsap.min.js, hyperframes.json copied from it).
  Pinned hyperframes@0.8.134, the version the episodes pipeline uses (the host preview itself pins 0.8.133).
  rig/adapter.js paints a draw list and the debug skeleton; lib/rig.mjs is loaded in the composition as an ES module,
  so the rig runs in the browser. `npx --yes hyperframes@0.8.134 check`: lint 0 errors 0 warnings, runtime 0, layout
  0 errors 0 warnings 1 info (the skeleton's smile line touches the frame edge at t=14.17s, intended), motion 0.
- out/pose-sheet.png (15 cells) from the HyperFrames png-sequence render of the "pose-sheet" sequence.
- Test clip: 8 fixed poses, 15 frames each at 30 fps, 120 frames, no easing. Rendered twice
  (`(cd rig/preview && npx --yes hyperframes@0.8.134 render --format png-sequence -o ../../out/render/clip-N)`):
  `npm run frame-hashes -- out/render/clip-1 out/render/clip-2`: 120 frames, 120 identical by sha256, 0 differ.
  Within each run the frames form exactly 8 runs of 15 identical frames.

Numbers (no limits yet)
- Reconstruction (`npm run reconstruction`; neutral pose, brows hidden, over opaque black; smallest alpha 255) against
  the master, RGB channels 0..255:
  - outside the outline: 704761 px, mean 1.0156350876396396 (2147340/2114283), max 23, 34174 px with a channel off by
    more than 16 (the glow layer keeps only the faint band, alpha at most 33: the known limitation);
  - on the outline: 168688 px, mean 5.854277324607164 (2962639/506064), max 142, 13271 px off by more than 16 (the
    head comes from G2-02, whose outline is a redraw of the master's);
  - inside the screen: 699067 px, mean 1.105652724750751 (2318776/2097201), max 64, 1098 px off by more than 16.
- Render times, hyperframes' own report and `time`:
  - pose sheet, 15 frames at 1 fps: rendered in 4.6s (capture 4.0s, screenshot capture, hardware gpu); `time` total
    6.247 s;
  - clip, 120 frames at 30 fps: run 1 rendered in 26.4s (capture 24.2s), `time` 28.402 s; run 2 rendered in 26.4s
    (capture 24.5s), `time` 28.240 s.
- `npm test`: tests 91, pass 91, fail 0, skipped 0, duration_ms 67063.60475.

What broke
- Nothing failed. Generated preview files (index.html, data.js, copies of rig.mjs, adapter.js and the layers) are
  gitignored; the committed project is package.json, hyperframes.json, meta.json and vendor/gsap.min.js.

## 2026-10-08 · Step 3: liveness (prompt #13)

Step 2 change
- The neutral pose has the brows hidden, like the logo and the master (rig.json neutralPose, written by
  scripts/build-rig.mjs); browsRestDy (-22) stays as their rest position when shown. Tests and the pose sheet
  updated; out/pose-sheet.png re-rendered (15 frames, rendered in 5.0s, `time` 6.662 s). The step 2 test clip was
  rendered with the old neutral pose (brows shown); it was not rendered again.

What was done
- rig/liveness.json: chosen values, each with its reason in the file: blink interval 2.0..6.0 s (from the end of one
  blink to the start of the next), closed 0.10..0.15 s, double-blink chance 0.15 with 0.15..0.25 s between the two;
  breathing period 4.0 s, depth 3 px (head y -1.5..+1.5); micro drift targets every 1.5..3.5 s within -0.8..0.8
  degrees and -4..4 px on each axis; cursor 0.53 s on, 0.53 s off, starting on.
- lib/liveness.mjs: livenessAt(config, seed, frame, fps) builds the seed's blink and drift schedules from time 0 up
  to the frame and looks it up; nothing cached, so the answer does not depend on earlier calls. Separate generator
  streams for blinks and drift (lib/rng.mjs mulberry32). Breathing is a smoothstep up and down, the drift eases with
  smootherstep; no trigonometry.
- lib/pose.mjs: combine(rig, base, ...partials): head tilt, x and y add up; eyes closed and cursor off win; brows,
  mouth and glow take the last setter; the result goes through validatePose (rejected, never clamped).
- The HyperFrames preview computes each frame of a liveness clip in the browser: combine(neutral, livenessAt(seed,
  frame, 30)) → drawList → adapter.

Numbers
- `npm run liveness:report -- --seed 1 --seconds 60`: 16 blinks start in the 60 s (2 of them the second of a
  double); 61 frames with the eyes closed; interval between blink starts shortest 0.3039843718172044 s (inside a
  double), longest 6.126616161921994 s; not counting the second of a double, shortest 2.6431976171210394 s. The
  longest start-to-start interval is above 6.0 because the configured interval runs from a blink's end, and blinks
  last up to 0.15 s. Largest |tilt| 0.6771515524734805 degrees, |x| 3.908362841289338 px, |y| 5.231234531257524 px
  (breathing included), against limits of 4 degrees and 30 px. Chart: out/liveness-timeline.png.
- Clip: seed 1, 10 s at 30 fps, 300 frames (`node scripts/build-preview.mjs liveness --seed 1`, then
  `(cd rig/preview && npx --yes hyperframes@0.8.134 render --format png-sequence -o ../../out/render/liveness-seed-1-run-N)`;
  the seed is in the folder name and on the first line of each run's log). Run 1 rendered in 1m 0.9s (capture
  58.3s), `time` 1:02.59; run 2 rendered in 1m 0.8s (capture 58.3s), `time` 1:02.52.
  `npm run frame-hashes -- out/render/liveness-seed-1-run-1 out/render/liveness-seed-1-run-2`: 300 frames, 300
  identical by sha256, 0 differ.
- out/liveness-strip.png: the first blink of the clip, frames 83 to 86 closed (2.7666666666666666 s to 2.9 s), with
  frames 82 and 87 open on either side; frame n is the render's frame_<n + 1>.png.
- `npm test`: tests 100, pass 100, fail 0, skipped 0, duration_ms 65863.347208.

What broke
- The first timeline chart drew the row names over the scale labels ("BREATHING" over "1.5"); the names now sit
  above each row.

## 2026-10-08 · Step 4: Ping's voice and lip sync v1 (prompt #14)

Step 3 change
- Breathing depth 6 px (rig/liveness.json, the author's value). `npm run liveness:report -- --seed 1 --seconds 60`:
  blinks unchanged (16, intervals 0.3039843718172044 .. 6.126616161921994 s); largest |tilt| 0.6771515524734805
  degrees, |x| 3.908362841289338 px, |y| 6.642545818415915 px. 10 s clip for seed 1 rendered twice: run 1 rendered in
  1m 1.6s (`time` 1:03.33), run 2 in 1m 1.3s (`time` 1:02.90); `npm run frame-hashes`: 300 of 300 frames identical.

Voice (ElevenLabs)
- The key is read like the CodeMask episodes pipeline reads it: ELEVENLABS_API_KEY, else the ElevenLabs MCP entry in
  ~/.claude.json; memory only (lib/elevenlabs.mjs). test/voice.test.mjs searches tracked files, the whole git history
  and logs/ and out/ for it and reports only where it was found (nowhere).
- Candidates (audio/voice.json; the host's voice excluded), the line "Hello. I am Ping. I live
  in a terminal.", model eleven_multilingual_v2, settings stability 0.5, similarity_boost 0.75, style 0,
  use_speaker_boost true, speed 1.0, output mp3_44100_128, seed 1; files in out/voice-candidates/ with
  candidates.txt:
  1. Miffy Mouse - Squeaky, Upbeat Cartoon (M5t0724ORuAGCh3p3DUR), 3.111474 s — provisional voice;
  2. River - Relaxed, Neutral, Informative (SAz9YHcvj6GT2YYXdXww), 2.229116 s;
  3. Callum - Husky Trickster (N2lVS1w4EtoT3dr4eOWO), 3.065034 s.
- Development phrases with the provisional voice, /with-timestamps, alignment next to each file: P1 1.950476 s,
  P2 2.786395 s, P3 2.507755 s (ffprobe), 44100 Hz mono. Disclosure in audio/SOURCES.json (date from ElevenLabs'
  Date header).
- Repeatability: P1 twice with the same settings and seed: different bytes (same size, 32226 bytes; first
  difference at byte 219). Decoded, both are 86016 samples; 78084 differ, largest |difference| 0.06707808375358582,
  mean 0.002114315951817548; the character alignments are identical. So the calls are not repeatable at the sample
  level; each phrase is synthesised once and that take is the one used.
- Decoding (lib/audio.mjs, `npm run decode`): "ffmpeg version 8.1.1", mono float32 at the file's own rate; logged in
  audio/decode-log.json with the samples' sha256.
- Metadata of P1-P3 (audio/dev/*.metadata.txt): MP3, 128 kbps, 44100 Hz, single channel, ID3v2.4 with only
  EncoderSettings "Lavf60.16.101". No audio file committed.

Lip sync v1
- lib/lipsync-volume.mjs: RMS of each frame's samples, then rest below 0.01, open from 0.08, small between; no
  smoothing, hysteresis or look-ahead. rig/lipsync-volume.json says how the thresholds were chosen (RMS percentiles
  of P1-P3, `npm run lipsync:stats`, out/lipsync-stats.txt). The mouth is a partial pose for combine() after liveness.
- Clips (`npm run lipsync:clips -- --seed 1 P1 P2 P3`): HyperFrames mp4, video only, then
  `ffmpeg -i <video> -i <mp3> -map 0:v:0 -map 1:a:0 -c:v copy -c:a copy` (ffmpeg 8.1.1, stream copy, nothing
  re-encoded). Render: P1 rendered in 5.0s (`time` real 0m6.729s), P2 4.7s (0m6.540s), P3 4.5s (0m5.831s).
  The mp3 stream in each mp4 reports a slightly longer duration than the decoded samples (P1 1.960000 s against
  1.9504761904761905 s); not measured further, the offset method is fixed at step 8.
- `npm run lipsync:report -- P1 P2 P3 --chart P2` (out/lipsync-v1/report.txt, P2-timeline.png):
  - P1: 59 frames, 16 changes = 8.135593220338983 per second; rest 25, small 25, open 9; 17 runs, shortest 1,
    median 3, longest 11 frames; 5 runs of one frame; no open frame between two frames under the rest threshold.
  - P2: 84 frames, 26 changes = 9.285714285714286 per second; rest 26, small 41, open 17; 27 runs, shortest 1,
    median 3, longest 9; 6 runs of one frame; none.
  - P3: 76 frames, 17 changes = 6.710526315789474 per second; rest 25, small 31, open 20; 18 runs, shortest 1,
    median 3.5, longest 11; 4 runs of one frame; none.

What broke
- scripts/decode-audio.mjs took the "--no-log" flag for a file name; flags are now filtered out.
- The first P2 chart drew the threshold labels under the loudness bars; they now sit in the left margin.
- `npm test`: tests 110, pass 110, fail 0, skipped 0, duration_ms 66629.007417.

## 2026-10-08 · Overnight run (prompt #15), branch `overnight`

### Task 0: small fixes
- audio/voice.json no longer holds the host's voice id or the path into the CodeMask repository; it says only that the
  host's voice is excluded. Decided without asking: the same id and the same kind of path were also removed from the
  step 4 DEVLOG entry and from the comment in lib/elevenlabs.mjs. The step 1 and step 2 mentions of the host avatar's
  folder (`Avatar/`) stay: they record what the author asked me to find.
- P1-P3 committed under audio/dev/ (metadata approved by the author: encoder tag only; recorded in audio/voice.json
  metadataApproved). Synthesis is not repeatable: P1 twice gave different samples with the same alignment, so there is
  one take per phrase and that take is the asset.
- What broke: the "no Cyrillic" hygiene test read the new mp3 files as text and found Cyrillic code points in their
  bytes. Binary media (audio, video, wasm, model files) are now left out of the text checks.

### Task 1: voice candidates, round 2
- `npm run voice:round2` → out/voice-candidates/round-2/ (not committed) with candidates.txt. Four ElevenLabs calls:
  1. library, Laura - Enthusiast, Quirky Attitude (FGY2WhTYpPnrIDTdsKH5), 2.414875 s, character-cost 39;
  2. library, Liam - Energetic, Social Media Creator (TX3LPaxmHKxFdv7VOQHJ), 2.832834 s, character-cost 39;
  3. voice design "d1-curious-dry" (description in audio/voice.json round2), first of 3 previews, 8.306917 s;
  4. voice design "d2-crisp-deadpan", first of 3 previews, 9.273458 s.
  The account can design voices (POST /text-to-voice/create-previews answered with 3 previews each); nothing was
  saved to the account. The model and the credits used are not reported by that endpoint.
- Decided without asking: the design endpoint needs 100 to 1000 characters of text, so the design previews say the
  candidate line three times (119 characters); the library and processed ones say it once.
- Processed (no ElevenLabs call): the round 1 River file (the most neutral of the first three) through two ffmpeg
  chains, kept in audio/voice.json round2 and in candidates.txt with the full command (ffmpeg 8.1.1, libmp3lame
  128 kbps): subtle `highpass=f=150,lowpass=f=7500,acrusher=bits=12:mode=log:aa=1:mix=0.2,aecho=0.8:0.5:9:0.12`;
  stronger `highpass=f=280,lowpass=f=5000,acrusher=bits=9:mode=log:aa=1:mix=0.35,flanger=delay=1.5:depth=1.5:speed=0.4,aecho=0.8:0.55:7:0.22`.
  Levels (out/voice-candidates/round-2/levels.txt) are in the report; intelligibility was not judged by ear (no one
  listened in this run).

### Task 2: step 5, lip sync v2 (character timings → mouth)
- Rules first (rig/lipsync-text.json), committed before anything was rendered with them, as asked; this makes two
  commits for task 2 (rules, then results), decided because the rule "commit the rules before rendering" outranks
  "one commit per task" for this task.
- Changed before any render: the silent final e rule first also silenced the e of "the" (seen in a unit test, not in
  output); "the" and "she" are now exceptions.
- Clips (`npm run lipsync:clips -- --seed 1 --method v2 P1 P2 P3`): P1 rendered in 4.8s (`time` real 0m6.663s),
  P2 4.6s (0m6.059s), P3 4.4s (0m5.784s); audio muxed by ffmpeg 8.1.1 stream copy, as for v1.
- `npm run lipsync:compare` (out/lipsync-v2/compare.txt):
  - closure score (m, b, p with rest in at least one frame of the letter's span): v1 P1 1 of 2, P2 1 of 3, P3 0 of 1
    (2 of 6); v2 P1 2 of 2, P2 3 of 3, P3 1 of 1 (6 of 6);
  - P1: v1 8.135593220338983 changes/s, rest 25 small 25 open 9, shortest 1 median 3, 5 one-frame runs;
        v2 5.593220338983051 changes/s, rest 31 small 10 open 6 round 5 wide 7, shortest 2 median 4, 0;
  - P2: v1 9.285714285714286, rest 26 small 41 open 17, shortest 1 median 3, 6;
        v2 7.500000000000001, rest 32 small 18 open 0 round 24 wide 10, shortest 2 median 3, 0;
  - P3: v1 6.710526315789474, rest 25 small 31 open 20, shortest 1 median 3.5, 4;
        v2 4.736842105263158, rest 28 small 5 open 0 round 30 wide 13, shortest 2 median 5, 0.
  - out/lipsync-v2/words.txt, P2-timeline.png (both rows), P1-P3-side-by-side.mp4 (v1 left, v2 right, labels drawn
    by code and overlaid; ffmpeg 8.1.1 hstack, video re-encoded with libx264 crf 18, audio stream copied).
  - The mp3 inside each mp4 is longer than the decoded audio by 0.00952380952380949 s (P1), 0.00961444217687113 s
    (P2), 0.00024989795918362034 s (P3), the same for v1 and v2. Nothing corrected.
- Looked at, not changed (no rule was changed after seeing output): P2 and P3 never use "open" because their text
  has no a and no pronoun I; the round mouth sits 45 px lower than the smile because of its anchorDy, as decided.
- `npm test`: tests 116, pass 116, fail 0, skipped 0, duration_ms 66610.703166.

### Task 3: step 6, emotions
- Four states besides neutral, chosen (rig/emotions.json, each with its reason): happy (brows dy -30, the closed
  smile, tilt 2, y -2), surprised (brows dy -47, round mouth, y -4), focused (brows dy 13, rest mouth, y 3), sleepy
  (eyes closed, brows hidden, rest mouth, tilt -3, y 5). Every state passes the rig limits on its own and with
  liveness (test checks 258 frames of 60 s each).
- Changed after seeing output: happy was first proposed with the wide mouth; on the first emotions sheet the hollow
  wide mouth read as gritted teeth, not a grin, so happy keeps the logo's closed smile (recorded in the file).
- lib/emotions.mjs: marks → partial pose per frame, smootherstep over 8 frames (chosen); eyes, mouth and brow
  visibility switch at the middle of a transition, numbers ease; hidden brows ease from browsRestDy. Speech: lip sync
  is combined after the emotion on every frame from the first to the last letter of an utterance (speechSpan,
  speechPartial), so the speech mouth wins there and the emotion's mouth shows outside. combine() was not changed.
- lib/script-tags.mjs: parseTags (tags removed, spaces collapsed, unknown tags and unbalanced brackets fail) and
  marksFromAlignment (a tag starts at its character's start frame, or after the last character); tests.
- out/emotions-sheet.png from a HyperFrames render (5 frames: rendered in 2.8s, `time` 4.458 s).
- Walk-through: liveness seed 1, demoMarks neutral 0, happy 30, surprised 90, focused 150, sleepy 210, neutral 270;
  300 frames at 30 fps, rendered twice: run 1 rendered in 1m 1.9s (`time` 1:03.61), run 2 1m 1.9s (1:03.58);
  `npm run frame-hashes -- out/render/emotions-seed-1-run-1 out/render/emotions-seed-1-run-2`: 300 of 300 identical.
  out/emotions-seed-1.mp4 made from run 1's frames for viewing (ffmpeg libx264 crf 18).
- What broke: one emotions test had the happy mouth typed into it; it now reads the mouth from the config.
- `npm test`: tests 124, pass 124, fail 0, skipped 0, duration_ms 66436.932.

### Task 4: step 7, the webcam page — NOT VERIFIED WITH A REAL CAMERA
- Packages, pinned: @mediapipe/tasks-vision 1.1.0 (Apache-2.0, npm) and, for the headless test only, puppeteer-core
  25.13.0 driving the installed Google Chrome. `npm run web:vendor` copies vision_bundle.mjs and the wasm files into
  web/vendor/ and downloads face_landmarker.task (3758596 bytes, sha256
  64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff) from
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
  into web/models/; both folders are gitignored (37 MB of wasm, 3.7 MB of model), and web/VENDOR.json records every
  file's sha256. Decided without asking: the files are served from this repository's folders but not committed; the
  model licence is written as stated by the MediaPipe documentation and was not checked against the model card here.
- lib/face-to-pose.mjs: tilt from the matrix's rotation (sine from its first column, arcsine as a polynomial, no
  trigonometry), shift from its translation against the first frame, exponential smoothing; blink and brows with
  hysteresis; mouth from pucker/funnel, jawOpen and smile. Values in rig/face.json, all chosen, none checked on a
  face. The rig's 4 degree tilt is too small for a real head (about ±20 degrees): face.json maps it with gain 0.2 and
  saturates at the limit, flagged in the state, never silent; it proposes a 1600 x 1600 stage with a ±12 degree limit
  (no art change), not applied.
- The page draws Ping and the landmark points only. Detection runs in a module worker (FilesetResolver with
  useModule = true loads the module build of the wasm), CPU delegate; the main thread hands it one ImageBitmap per
  frame through privacy.js handOff(), the only call that may take the video. Timestamps for the detector come from
  the frame count, not a clock.
- Headless test (test/web.test.mjs, stubbed camera): 24 requests before ready (page, scripts, rig, layers, worker,
  bundle, module wasm, model), 0 after; 16 hand-offs for 18 drawn frames; no video element in the page; storage
  empty; drawImage, createImageBitmap, appendChild of a video, fetch after ready, MediaRecorder and captureStream all
  refused (out/web-headless.json).
- Synthetic face stream (`npm run face:stream -- --seed 1`, numbers made by code, SYNTHETIC): 300 frames; eyes closed
  8; brows shown 100; mouths rest 116, small 24, open 8, round 152, wide 0 (the seed never drew the smile mode);
  largest |tilt| 4 (saturated in 31 frames), |x| 16.445415981231584, |y| 6.885732103368328. Rendered through
  HyperFrames as a poses clip: out/face-synthetic-seed-1.mp4, rendered in 9.4s (`time` 11.234 s).
- `npm test`: tests 136, pass 136, fail 0, skipped 0, duration_ms 67211.651292 (includes the headless browser test).

## 2026-10-09 · Review of the overnight run (prompt #16)

`overnight` merged into `main` by fast-forward (3b84fd3..0ba1087); work continues on `main`.

### Decisions applied
- Voice: River (SAz9YHcvj6GT2YYXdXww) with the "stronger" chain, round 2 candidate 6 (`audio/voice.json` chosen,
  chosenBy, processing). Miffy Mouse is recorded as provisionalBefore.
- Stage: `scripts/build-rig.mjs` writes `rig.json` stage 1600 x 1600, artOffset 173,173 (the 1254 x 1254 art
  centred); tilt limit -12..12 degrees. The draw list's translate is now the head's shift plus artOffset; rotation
  stays in art pixels. Fit check on the stage: smallest room 41.6485422055714 px (glow). `rig/face.json` tiltGain 0.6
  (the author's value), stageProposal replaced by a note that it is applied. The webcam page's canvas takes the stage
  size from `rig.json`; `build-preview` sizes the composition from it.
- Renders made again on the stage (`npm run stage:renders`, out/stage-renders.txt; hyperframes@0.8.134):
  - pose sheet: 15 frames rendered in 5.3s (`time` 7.280 s), out/pose-sheet.png 1316x1496 sha256
    46f86ea96a61a81fb8e6ae55443bfdc6c48d4c087e0dd495a2a64d2e9db89d16; tilt -12 and 12 seen on the sheet.
  - step 2 test clip twice: 26.8s (28.297 s) and 26.6s (28.213 s); 120 frames, 120 identical by sha256.
  - reconstruction: rendered in 1.2s; the art cut out of the stage at 173,173; the 987484 stage pixels around the art
    have a largest channel value of 0. Against the master the numbers are the same as in step 2: outside the outline
    mean 1.0156350876396396, max 23; on the outline mean 5.854277324607164, max 142; inside the screen mean
    1.105652724750751, max 64.
  - liveness seed 1 twice: 1m 2.9s (1m4.275s) and 1m 3.0s (1m4.650s); 300 of 300 frames identical; blink strip
    frames 82..87 (closed 83..86).
  - emotions sheet: 5 frames in 2.2s (3.831 s), sha256 44a48fbf3355e70cfad4d89c4b7bb89929d286d56cd37ca2f04517ed5b3efc2e.
  - emotions walk-through twice: 1m 3.0s (1m4.329s) and 1m 2.8s (1m4.491s); 300 of 300 identical;
    out/emotions-seed-1.mp4.
  - synthetic face stream seed 1 with gain 0.6: largest |tilt| 12, saturated in 31 frames; clip rendered in 9.9s
    (11.802 s). It used to be rendered by a command typed in the shell; it is now part of the script.
- `PUBLISH-CHECKLIST.md`: the model licence against its model cards (author's prompt #16), the vendor hashes, and the
  12 real-camera checks moved there from the uncommitted overnight report (tilt now ±12 with gain 0.6). The wasm and
  the model stay out of git; `npm run web:vendor` stays.

### Part A: the voice pipeline
- `audio/raw/` holds what ElevenLabs returned, untouched, with the alignment (`P<n>.align.json`); the alignment files
  left `audio/dev/`. `npm run audio:process` (`scripts/audio-process.mjs`) makes `audio/dev/` from it: ffmpeg decode
  to mono float, the chain on floats (`-f f32le` in and out), one gain in JavaScript, one libmp3lame 128k encode from
  floats. Gain rule (author's): the RMS back to the raw file's RMS, lowered if a sample would pass peakCeiling 0.95
  (chosen; no file needed lowering). Logged in `audio/process-log.json` and summarised in `audio/SOURCES.json`.
- ElevenLabs: 4 calls (P1, P2, P3 and the candidate line), River, eleven_multilingual_v2, settings as before, seed 1.
  character-cost reported 17, 40, 25 and 39. Server dates Fri, 09 Oct 2026 08:20:32 to 08:20:35 GMT.
- Per file (tool: ffmpeg version 8.1.1; RMS of all samples, linear, full scale 1):

| file | RMS raw | RMS after chain | gain | RMS gained (floats) | RMS decoded result | peak gained | peak result |
|---|---|---|---|---|---|---|---|
| P1 | 0.0665092084904448 | 0.02124206081506653 | 3.1310148798402495 | 0.06650920852191707 | 0.0632565123849845 | 0.46815139055252075 | 0.4460398256778717 |
| P2 | 0.06067107421197575 | 0.019269599918362364 | 3.1485383437650483 | 0.060671074249299885 | 0.0577031351604808 | 0.6719824075698853 | 0.6390900611877441 |
| P3 | 0.07049507968095198 | 0.02111612822398933 | 3.3384472254181934 | 0.07049507965732833 | 0.06694050880586776 | 0.6113734841346741 | 0.5794536471366882 |
| final check | 0.07002654051490918 | 0.021443491582736823 | 3.2656314502104853 | 0.07002654052322813 | 0.06651225198129584 | 0.461969256401062 | 0.4383390247821808 |

  The gained floats match the raw RMS; after the one mp3 encode the decoded RMS is lower: result / raw =
  0.9510940487898364 (P1), 0.9510814817432536 (P2), 0.9495770358559552 (P3), 0.9498149057804002 (final check). Not
  corrected: matching after the encode would need a second encode.
- Repeatable: `npm run audio:process` twice on the same raw files gave identical bytes for P1, P2, P3 and
  `audio/process-log.json` (sha256 89dc4543…, f4a062b9…, 6d6d9e09…, 6074a762…; out/audio-repeat/). A test does
  it again on P1 and compares with the committed file.
- Time shift (normalised cross-correlation of the raw samples with the processed ones, lags -2205..2205): P1 1
  sample, P2 1 sample, P3 0 samples, final check 0 samples, the same for the chain's floats and for the decoded mp3.
  Correlation at the best lag 0.5892679731478089 / 0.641816991499808 / 0.613102780157535 (at lag 0
  0.5861221721266935 / 0.6242252260637347 / 0.613102780157535): the chain changes the sound a lot but does not move
  it. The chain's echo adds 308 samples of tail at the end (raw 57344 → 57652, 96256 → 96564, 65536 → 65844). The
  encode adds no delay: with ffmpeg's default LAME header the decoded length equals the encoded floats' length.
  Nothing corrected.
- out/voice-final-check.mp3 (not committed): the candidate line through the same pipeline. Its raw take has the same
  size (36824 bytes) and the same alignment as round 1's River take, but different bytes.
- Metadata (`npm run audio:metadata`, exiftool 13.55): all six committed files show one embedded tag,
  `[ID3v2_4] EncoderSettings` (Lavf60.16.101 for ElevenLabs' files, Lavf62.12.101 for ours). Approved by the
  author's rule; `audio/voice.json` metadataApproved lists them.

### Part B: lip sync on the final voice
- v1 thresholds chosen again on the processed P1-P3 (out/lipsync-stats.txt): 48 of 151 frames under 0.0075, the
  next frame 0.01064, so restBelow stays 0.01; openFrom 0.07 (was 0.08): 32 of 151 frames at or above it (0.2119205298013245),
  close to the share before (46 of 219, 0.2100456621004566). v1 report: P1 8.25 changes/s, 1-frame runs 3; P2 8.181818181818182, 7; P3
  7.333333333333333, 2.
- Rules changed after seeing words.txt (author's prompt #16), labelled in `rig/lipsync-text.json`
  (changedAfterSeeing, before): y as a word's only vowel is open; ou and ow: first letter open, second round, "you"
  and "your" stay round. `lipsync:compare` reads the earlier rules from git (commit 0b9efef) and runs both on the same
  audio.
- Closure score (m, b, p): v1 2 of 6, v2 before 6 of 6, v2 after 6 of 6.

| phrase | version | changes/s | rest | small | open | round | wide | shortest | median | 1-frame runs |
|---|---|---|---|---|---|---|---|---|---|---|
| P1 | v1 | 8.25 | 15 | 14 | 11 | 0 | 0 | 1 | 3 | 3 |
| P1 | v2 before | 6 | 15 | 8 | 6 | 6 | 5 | 2 | 3 | 0 |
| P1 | v2 after | 6 | 15 | 8 | 6 | 6 | 5 | 2 | 3 | 0 |
| P2 | v1 | 8.181818181818182 | 18 | 36 | 12 | 0 | 0 | 1 | 2 | 7 |
| P2 | v2 before | 6.8181818181818175 | 22 | 23 | 0 | 15 | 6 | 2 | 4 | 0 |
| P2 | v2 after | 7.727272727272727 | 22 | 23 | 8 | 9 | 4 | 2 | 3.5 | 0 |
| P3 | v1 | 7.333333333333333 | 15 | 21 | 9 | 0 | 0 | 1 | 3 | 2 |
| P3 | v2 before | 4.666666666666667 | 17 | 0 | 0 | 20 | 8 | 2 | 4.5 | 0 |
| P3 | v2 after | 6 | 17 | 0 | 3 | 17 | 8 | 2 | 3.5 | 0 |

- Words that changed (words-before.txt against words.txt): My `rest×4 wide wide` → `rest×4 open open`; sound
  `small small round round round round small small` → `small small open open round round small small`; loud
  `small round×6 small×4` → `small open×4 round round small×4`; wow `round×7` → `round round open open open round
  round`. "mouth" did not change: its o lasts 0.279..0.325 s and shares frame 8 with m (closure outranks open) and
  frame 9 with u (round outranks open), so open never wins a frame. Not changed (a priority rule, the author's to
  decide).
- Clips: out/lipsync-v1/ and out/lipsync-v2/ P1-P3 on the stage (renders 5.9s/5.1s/4.1s for v1, 5.5s/4.8s/4.2s for
  v2), side-by-side clips, out/lipsync-v2/P2-timeline.png with the rows V1, V2 OLD, V2. The mp3 inside each mp4 is
  longer than the decoded audio by 0.025691412698412686 s (P1), 0.0053511360544216124 s (P2) and
  0.022947775510204105 s (P3); with the provisional voice's files straight from ElevenLabs it was 0.00952380952380949 s,
  0.00961444217687113 s and 0.00024989795918362034 s. Not measured
  further and not corrected (that is the measurement step).

### Part C: the web page
- `web/worker-privacy.js` lockDown(self), called in the detector worker after the model has loaded and before
  "ready": fetch, importScripts, XMLHttpRequest, WebSocket, EventSource, WebTransport, Worker, SharedWorker and
  OffscreenCanvas convertToBlob throw and are recorded. A dynamic import() cannot be replaced (syntax); a static
  test checks the worker has none.
- Headless test (stubbed camera): from inside the worker after ready, fetch, XMLHttpRequest, WebSocket, importScripts
  and convertToBlob were all refused (5 refusals recorded) and the server saw no request; detection kept running
  after the lockdown. 25 requests before ready (worker-privacy.js is new), 0 after.
- Timestamps: the page counts hand-offs, not camera frames: `timestampMs = handOffCount * 1000 / 30`. When the
  detector is busy the tick hands nothing over and the count does not move, so the next frame's timestamp is only
  33.3 ms later however long the detector took: the detector's clock runs slower than the camera. Timestamps stay
  strictly increasing, so MediaPipe accepts them; what changes is everything it does with time (its smoothing and
  tracking see slower motion than there is). The other way round: ticks come from requestAnimationFrame, not from new
  camera frames, so a fast detector can be handed the same camera frame twice, 33.3 ms apart. face-to-pose smooths
  per result, so its smoothing also stretches when results come slower. Measured headless (synthetic picture, no
  face, CPU): 23 ticks with a playable video, 6 skipped because the detector was busy, 17 hand-offs. New counters
  `window.__pingTicks` and `window.__pingBusySkips` are in the real-camera checklist. Not changed: a fix would take
  timestamps from the video itself (requestVideoFrameCallback's mediaTime), which is a question for the author.

### What broke
- A lip sync test asserted the old rule for "loud" (round round); it now tests "soon" for the round pair, and the
  new rules have their own tests.
- `scripts/audio-metadata.mjs` had no main guard, so the first test run that imported it rewrote the dumps; guarded.
- My first gain test used numbers that never reached the ceiling; fixed the numbers.
- Tests and the pose sheet had the old 4 degree tilt written in them (a combine test, a preview label).

### Tests
- `npm test`: tests 144, pass 144, fail 0, skipped 0, duration_ms 66523.676709 (includes the headless browser test).

## 2026-10-09 · Prompt #17: the last rule change, the freeze, the measurement

### Part A: a frame takes the character that covers most of it; then the freeze
- `rig/lipsync-text.json` frameRule (mode "majority"), labelled "changed after seeing output" with what the author
  saw in words.txt ("moves" and "move" rest for the whole word; "mouth" loses its open "o"). A frame takes the
  character that covers most of its time window; class priority only breaks exact ties; the minimum-run rule is
  unchanged. Decided without asking: spaces and punctuation compete like letters (class gap), and so does time no
  character covers, so a frame that is mostly pause stays at rest as before. `lib/lipsync-text.mjs` keeps the old
  behaviour for rules without frameRule, so `lipsync:compare` runs the rules of e2a7f56 from git on the same audio.
- v2 clips made again (renders in out/lipsync-v2-clips.txt). Closure score: before 6 of 6, after 6 of 6 (P1 2 of 2,
  P2 3 of 3, P3 1 of 1). v1 unchanged: 2 of 6.

| phrase | v2 | changes/s | rest | small | open | round | wide | shortest | median | 1-frame runs |
|---|---|---|---|---|---|---|---|---|---|---|
| P1 | before | 6 | 15 | 8 | 6 | 6 | 5 | 2 | 3 | 0 |
| P1 | after | 6.75 | 21 | 10 | 2 | 3 | 4 | 2 | 3 | 0 |
| P2 | before | 7.727272727272727 | 22 | 23 | 8 | 9 | 4 | 2 | 3.5 | 0 |
| P2 | after | 6.8181818181818175 | 24 | 13 | 8 | 19 | 2 | 2 | 2.5 | 0 |
| P3 | before | 6 | 17 | 0 | 3 | 17 | 8 | 2 | 3.5 | 0 |
| P3 | after | 6.666666666666667 | 23 | 0 | 2 | 12 | 8 | 2 | 2 | 0 |

- Words that changed (out/lipsync-v2/words-before.txt against words.txt):
  - Hello: `small small small wide wide small small round round round round round` → `… small round round round rest`
  - I: `open open open` → `rest open open`
  - am: `open open rest rest` → `rest rest rest rest`
  - Ping: `rest rest rest wide wide wide small small small` → `rest rest rest wide wide small small small small`
  - My: `rest rest rest rest open open` → `rest ×6` (M covers most of the frames, y one frame, removed by the minimum run)
  - mouth: `rest rest rest round round small small small` → `rest rest open open open small small rest`
  - moves: `rest ×6 wide wide` → `rest rest round round round round round round`
  - when: `round round round small` → `round ×4`; the: `small small small` → `round round round`
  - sound: `small small open open round round small small` → `round round open open round round small small`
  - gets: `… small small small` → `… small small rest`; loud: `small open open open open round round small ×4` →
    `small small open open open round round small small small rest`
  - Oh: `round ×7` → `round ×6 rest`; wow: `round round open open open round round` → `rest round round open open round round`
  - you: `rest round round` → `rest rest rest`; see: `round wide ×5` → `rest wide ×5`
  The closure score did not drop, so nothing else was changed. "My", "am" and "you" now lose their vowel the same way
  "moves" did before (one frame, then the minimum run).
- Freeze: `rig/frozen.json` (`scripts/freeze.mjs`) holds the sha256 of the v1 thresholds and code, the v2 rules and
  code, the voice settings (chosen, modelId, settings, outputFormat, seed) and the processing (chain, gainRule,
  peakCeiling, encode); `test/freeze.test.mjs` fails if any of them changes.

### Answer 2: detector timestamps from the video
- `web/main.js`: with requestVideoFrameCallback (Chrome has it) each presented video frame calls back with its
  mediaTime; the frame is handed to the detector with timestampMs = mediaTime × 1000 unless the detector is busy
  (skipped, counted in `__pingBusySkips`) or the time is not later than the last one sent (skipped, counted in
  `__pingRepeatSkips`), so a skipped frame keeps real time and no frame goes twice. Without it the page falls back to
  one hand-off per animation tick with frame count / 30. The line under the status says which is in use;
  `window.__pingTimestamps` is "video" or "count".
- Headless (stubbed camera, Chrome): "video"; 18 video frames, 2 skipped busy, 0 skipped as repeats, 16 hand-offs,
  17 drawn frames; 25 requests before ready, 0 after. A second headless test removes requestVideoFrameCallback and
  sees "count" and the fallback line.
- What broke: the headless test expected at least 16 hand-offs once 16 frames were drawn; the first drawn frame comes
  before any hand-off, and the old loop happened to be one hand-off ahead. The check is now hand-offs within one of
  the drawn frames.

### Part B: the measurement method (committed before any held-out audio)
- `MEASUREMENT.md`, `measurement.json`, `lib/measure.mjs`, `scripts/measure.mjs` (`npm run measure`), tests in
  `test/measure.test.mjs`. Added to `rig/frozen.json` in this commit.
- onsets.mjs (CodeMask episodes, `episodes/tools/onsets.mjs`): ffmpeg silencedetect at −50 dB with silences of at
  least 80 ms, used to move ElevenLabs' word edges to where the sound starts and stops. The same idea is written here
  on the mp4's own audio without the alignment: RMS over a 10 ms window every 1 ms, sound at or above
  0.0031622776601683794 (−50 dBFS), pauses of at least 80 ms. Chosen on P1–P3 after looking at −60/−50/−40 dBFS and
  50/80/120 ms (table in MEASUREMENT.md).
- Found while writing it (prompt #16 question 4): the mp4's edit list skips the mp3 encoder's 1105 samples and
  ffmpeg applies it, so the mp4's audio equals the mp3's sample for sample on P1–P3 (lag 0); the extra length is
  padding at the end, at most 0.0000012379792906358489.
- Pixels against the draw list on P1–P3 (v1 and v2, 392 frames): 0 disagreements, 0 unread, largest template
  distance 4 px.
- What changed while testing on P1–P3, before the commit: the first onset rule needed the mouth to be at rest after
  the pause began, so a mouth open from frame 0 (v2 "Hello", "Oh") was not measured; the first end rule needed the
  mouth at rest at the last frame of the pause, so a mouth opening early for the next word (v1 and v2 "wow" → "We")
  was not measured. Both now use the mouth's rest run in the pause (MEASUREMENT.md 4 and 5), and frame 0 is flagged.
  Two of my own tests had wrong expectations (a template boundary); fixed the tests.
- P1–P3 with the frozen method (out/measure/P-check.txt), ms, positive = late:

| clip | onsets | ends | closure |
|---|---|---|---|
| P1 v1 | Hello 6.21315192743764 | Ping −11.110777777777692 | 1 of 2 |
| P1 v2 | Hello −93.78684807256236 (frame 0, flagged) | Ping 22.222222222222253 | 2 of 2 |
| P2 v1 | My not measured (m) | loud −35.41983446712016 | 1 of 3 |
| P2 v2 | My not measured (m) | loud −2.0858344671201845 | 3 of 3 |
| P3 v1 | Oh −4.172002267573694; We −9.02460997732424 | wow 1.7236893424036337; see −26.213151927437785 | 0 of 1 |
| P3 v2 | Oh −70.8390022675737 (frame 0, flagged); We −42.35860997732432 | wow 1.7236893424036337; see 7.119848072562274 | 1 of 1 |
- What broke: the headless web test failed once in the full run (hand-offs 15, frames 17). The test read the hand-off
  count, then awaited `indexedDB.databases()`, then read the frame count, so results arriving during the await split
  them (a test bug since prompt #15, made visible by the tighter check of prompt #17's answer 2). Both counters are now
  read before anything awaits; 5 runs in a row passed.
- `npm test` before the method commit: tests 152, pass 152, fail 0, skipped 0, duration_ms 68562.950083.

### Part C: the held-out phrases (after the method commit 5332a8c)
- `npm run voice -- held-out`: H1-H4 synthesised once each (the mode refuses if a file exists), River, frozen
  settings; character-cost 43, 42, 43, 43; server dates Fri, 09 Oct 2026 08:59:34 to 08:59:37 GMT; durations
  2.136236, 2.182676, 2.368435, 2.414875 s.
- `npm run audio:process`: P1-P3 came out byte for byte as before; H1-H4 gains 3.1947955934755536,
  3.1798540727644165, 3.3021407279052615, 3.6687298804341224; RMS raw → result 0.07035685180980257 →
  0.06683287012492387, 0.07153989929303718 → 0.06794946305431043, 0.0702747331509732 → 0.06678668897846181,
  0.06928115770307362 → 0.06580898027121534; lag 1, 0, -3, -3 samples (out/audio log in audio/process-log.json).
- Metadata: all eight files show the encoder tag only. Decided without asking: prompt #17 did not restate prompt
  #16's rule, so I applied it to H1-H4 and committed them (`audio/voice.json` metadataApprovedHeldOut says so).
- Clips: v1 and v2 for H1-H4 (renders 7.6/5.3/5.4/5.4 s for v1, 5.4/5.3/5.3/5.4 s for v2), side-by-side clips,
  out/lipsync-v2/compare-held-out.txt and words-held-out.txt. Measured with `npm run measure -- H1 H2 H3 H4 --out H`
  (out/measure/H.txt); a second run with `--check-drawlist` gave the same file plus: pixels and draw list agree on
  all 672 frames, 0 unread, largest template distance 4.
- Every value (ms, positive = the mouth is late; "f0" = mouth not rest at frame 0, flagged):

| clip | onsets | ends |
|---|---|---|
| H1 v1 | Okay −16.144791383219946; Open −3.855208616780015 | ready −2.902160997732439; window 3.083900226757308 |
| H1 v2 | Okay −82.81179138321995 (f0); Open −3.855208616780015 | ready −2.902160997732439; window 36.41690022675736 |
| H2 v1 | Bob not measured (b) | lamp −65.35180725623579 |
| H2 v2 | Bob not measured (b) | lamp −132.0178072562359 |
| H3 v1 | Why −9.160664399092965 | idea −18.36701360544213 |
| H3 v2 | Why −75.82766439909297 (f0) | idea −18.36701360544213 |
| H4 v1 | Evolution −23.537748299319727; but not measured (b) | slow −12.698412698412653; bored −52.51667346938804 |
| H4 v2 | Evolution −56.87074829931973 (f0); but not measured (b) | slow −46.0314126984126; bored 14.149326530612072 |

| version | kind | count | median | largest abs | within one frame | within 45 late / 125 early | not measured |
|---|---|---|---|---|---|---|---|
| v1 | onsets | 4 | −12.652727891156456 | 23.537748299319727 | 4 | 4 | 2 |
| v1 | ends | 6 | −15.53271315192739 | 65.35180725623579 | 4 | 6 | 0 |
| v2 | onsets | 4 | −66.34920634920636 | 82.81179138321995 | 1 | 4 | 2 |
| v2 | ends | 6 | −10.634587301587285 | 132.0178072562359 | 3 | 5 | 0 |

- Closure score: v1 8 of 14, v2 10 of 14 (H1 0 of 1, H2 8 of 11, H3 0 of 0, H4 2 of 2). With the rules before prompt
  #17's change (e2a7f56, from lipsync:compare on the draw list) v2 would have had 14 of 14: the majority rule drops
  the b of "Bob brought", "brought" and "big" and the p of "Open", short letters that never cover most of a frame.
- Changes per second (pixel mouths, frames before the end of the audio): v1 12.727272727272727, 10.909090909090908,
  9.166666666666668, 12.73972602739726 with 14, 10, 6, 14 one-frame runs; v2 6.363636363636363, 5.909090909090908,
  5.833333333333334, 6.575342465753425 with 0 one-frame runs.
- Seen in the numbers, nothing changed: three of v2's four measured onsets are flagged f0 (the alignment starts the
  first letter at 0 s, before the sound); H2's "lamp" ends with m and p, so its rest from the m on counts as an
  early end (−132.0178072562359 ms) though rest is the right mouth for m and p. No measuring-code bug found.
- `npm test`: tests 152, pass 152, fail 0, skipped 0, duration_ms 68392.216125.

## 2026-10-09 · Prompt #18: lip sync v3, then a second exam (H5-H8)

- The H1-H4 exam stands as measured: v2 scored 10 of 14 closures. The cause was the author's majority rule of prompt
  #17: a short b or p never covers most of a frame, so it lost every frame (b in "Bob brought a big", p in "Open").
  Nothing is re-scored.
- Footnote to every end offset (frozen method, unchanged): a word that ends on m, b or p (H2 "lamp") is counted; its
  mouth is meant to be closed from the m on, so such an end reads early by construction.
- The early mouth at phrase starts (the alignment puts the first letter at 0 s, before the sound) stays: an
  observation.

### Part A: lip sync v3
- Own files: `rig/lipsync-v3.json` (v2's letter rules copied unchanged and checked equal by a test; the three v3
  rules; labelled "changed after seeing P1 to P3 and H1 to H4" with what was seen) and `lib/lipsync-v3.mjs`, which
  imports only v2's letterClasses. `lib/lipsync-text.mjs` and `rig/lipsync-text.json` were not touched. Before
  writing v3, v2's mouths on all seven seen phrases were recorded (`test/v2-snapshot.json`); a test checks v2 still
  gives exactly those, and that v3's rule 1 gives v2's classes before rescue and runs.
- Decided without asking: rule 2 on a tie takes the earlier frame, and skips a frame that already shows a closure.
  Rule 3: runs are checked from the phrase start, again after every change; a removed run takes the class of the run
  before it (after it at the start), as in v2.
- Found by a test before the freeze, decided without asking: rule 3 as first written let a short run grow into a
  closure run and take the only closure frame of H2's "brought" b (closure 10 of 11). Rule 2 says a letter that
  "ends up" with no frame, so a closure frame that is the last closure frame overlapping an m, b, p, f or v cannot be
  given. Written into the rules file.
- v2 against v3 on the seven seen phrases (`npm run lipsync:v3-compare -- P1 P2 P3 H1 H2 H3 H4 --name seen`, from
  the code; the pixels were shown to equal the code on every v1 and v2 clip): closure v2 16 of 20, v3 20 of 20.
  "am" (P1) stays rest in v3: its a wins one frame, neither neighbour can give one (a 2-frame pause before, the
  1-frame m after), so that run is removed and the m grows into it. The full output:

```
P1: "Hello. I am Ping.", 40 frames
  v2: closure 2 of 2 (m@0.639, P@0.731); changes 9 = 6.75/s; rest 21, small 10, open 2, round 3, wide 4; shortest 2, median 3, 1-frame runs 0
  v3: closure 2 of 2 (m@0.639, P@0.731); changes 9 = 6.75/s; rest 21, small 10, open 2, round 3, wide 4; shortest 2, median 3, 1-frame runs 0
P2: "My mouth moves when the sound gets loud.", 66 frames
  v2: closure 3 of 3 (M@0, m@0.232, m@0.511); changes 15 = 6.8181818181818175/s; rest 24, small 13, open 8, round 19, wide 2; shortest 2, median 2.5, 1-frame runs 0
  v3: closure 3 of 3 (M@0, m@0.232, m@0.511); changes 23 = 10.454545454545453/s; rest 25, small 20, open 9, round 8, wide 4; shortest 2, median 2, 1-frame runs 0
  changed: My (frames 0..5): v2 rest rest rest rest rest rest → v3 rest rest rest open open rest
  changed: mouth (frames 6..13): v2 rest rest open open open small small rest → v3 rest rest rest open open small small rest
  changed: moves (frames 15..22): v2 rest rest round round round round round round → v3 rest rest round round rest rest small small
  changed: when (frames 23..26): v2 round round round round → v3 round round small small
  changed: the (frames 27..29): v2 round round round → v3 small wide wide
  changed: sound (frames 30..37): v2 round round open open round round small small → v3 small small open open round round small small
  changed: gets (frames 39..44): v2 small wide wide small small rest → v3 wide wide small small small rest
P3: "Oh wow. We move, you see?", 45 frames
  v2: closure 1 of 1 (m@0.708); changes 10 = 6.666666666666667/s; rest 23, small 0, open 2, round 12, wide 8; shortest 2, median 2, 1-frame runs 0
  v3: closure 1 of 1 (m@0.708); changes 13 = 8.666666666666666/s; rest 19, small 4, open 2, round 13, wide 7; shortest 2, median 2, 1-frame runs 0
  changed: Oh (frames 0..6): v2 round round round round round round rest → v3 round round round round small small rest
  changed: you (frames 27..29): v2 rest rest rest → v3 rest round round
  changed: see (frames 31..36): v2 rest wide wide wide wide wide → v3 small small wide wide wide wide
H1: "Okay, okay. Are you ready? Open the window.", 65 frames
  v2: closure 0 of 1 (p@1.3 NOT rest); changes 14 = 6.461538461538462/s; rest 26, small 9, open 5, round 12, wide 13; shortest 2, median 3, 1-frame runs 0
  v3: closure 1 of 1 (p@1.3); changes 22 = 10.153846153846155/s; rest 23, small 13, open 5, round 13, wide 11; shortest 2, median 2, 1-frame runs 0
  changed: Okay (frames 0..9): v2 round round round round round small small small small rest → v3 round round round round round small small wide wide rest
  changed: Are (frames 19..22): v2 rest rest rest rest → v3 rest small small small
  changed: you (frames 22..25): v2 rest rest rest rest → v3 small round round small
  changed: ready (frames 26..32): v2 rest wide wide wide wide wide rest → v3 small wide wide wide wide wide rest
  changed: Open (frames 36..42): v2 rest round round round wide wide wide → v3 rest round round rest rest wide wide
  changed: the (frames 43..45): v2 wide wide wide → v3 small small rest
  changed: window (frames 46..54): v2 wide wide small small small open open round round → v3 rest wide wide small small open open round round
H2: "Bob brought a big map, a pump, and a lamp.", 66 frames
  v2: closure 8 of 11 (B@0, b@0.221 NOT rest, b@0.302 NOT rest, b@0.569 NOT rest, m@0.778, p@0.917, p@1.173, m@1.289, p@1.335, m@1.776, p@1.823); changes 13 = 5.909090909090908/s; rest 37, small 11, open 6, round 10, wide 2; shortest 2, median 3.5, 1-frame runs 0
  v3: closure 11 of 11 (B@0, b@0.221, b@0.302, b@0.569, m@0.778, p@0.917, p@1.173, m@1.289, p@1.335, m@1.776, p@1.823); changes 18 = 8.181818181818182/s; rest 42, small 9, open 7, round 6, wide 2; shortest 2, median 2, 1-frame runs 0
  changed: Bob (frames 0..7): v2 rest rest rest rest round round round round → v3 rest rest rest rest round round rest rest
  changed: brought (frames 9..14): v2 round round round small small small → v3 rest round round small small open
  changed: a (frames 15..16): v2 small small → v3 open rest
  changed: big (frames 17..21): v2 small wide wide small small → v3 rest wide wide small small
  changed: lamp (frames 49..57): v2 rest open open open rest rest rest rest rest → v3 small small open open rest rest rest rest rest
H3: "Why is the sky so loud now? I have no idea.", 72 frames
  v2: closure 0 of 0; changes 14 = 5.833333333333334/s; rest 39, small 9, open 4, round 13, wide 7; shortest 2, median 4, 1-frame runs 0
  v3: closure 0 of 0; changes 26 = 10.833333333333334/s; rest 27, small 11, open 14, round 11, wide 9; shortest 2, median 2, 1-frame runs 0
  changed: Why (frames 0..5): v2 round round round round round round → v3 round round round round open open
  changed: is (frames 7..10): v2 rest rest rest rest → v3 rest small small small
  changed: the (frames 11..13): v2 small small small → v3 small wide wide
  changed: sky (frames 14..21): v2 small small small small open open open open → v3 rest rest small small open open open open
  changed: loud (frames 28..34): v2 rest rest rest round round round rest → v3 rest open open round round round rest
  changed: now (frames 35..40): v2 rest rest rest round round rest → v3 rest open open round round rest
  changed: I (frames 44..45): v2 rest rest → v3 open rest
  changed: have (frames 47..50): v2 rest rest rest rest → v3 open open rest rest
  changed: no (frames 52..54): v2 rest rest rest → v3 small small rest
H4: "Evolution is slow, but it never gets bored.", 73 frames
  v2: closure 2 of 2 (b@1.068, b@1.788); changes 16 = 6.575342465753425/s; rest 30, small 20, open 3, round 8, wide 12; shortest 2, median 3, 1-frame runs 0
  v3: closure 2 of 2 (b@1.068, b@1.788); changes 25 = 10.273972602739727/s; rest 31, small 18, open 3, round 8, wide 13; shortest 2, median 2, 1-frame runs 0
  changed: Evolution (frames 0..15): v2 wide wide wide wide rest rest rest small small round round small small small small small → v3 wide wide wide wide rest rest rest small small round round small small round round rest
  changed: is (frames 17..19): v2 small small small → v3 small small rest
  changed: slow (frames 20..29): v2 small small small small open open open round round rest → v3 rest small small small open open open round round rest
  changed: but (frames 32..36): v2 rest rest rest rest rest → v3 rest rest small small wide
  changed: it (frames 37..39): v2 rest rest rest → v3 wide wide rest
  changed: never (frames 41..46): v2 rest wide wide wide wide rest → v3 rest wide wide rest rest rest
  changed: bored (frames 53..63): v2 small rest rest round round round round wide wide small small → v3 small rest rest round round small small wide wide small small
total closure: v2 16 of 20, v3 20 of 20
```
- `npm test` at the v3 freeze: tests 160, pass 160, fail 0, skipped 0, duration_ms 68669.113167.

### Part B: the second exam, H5-H8 (after the v3 freeze 40ae504)
- `npm run voice -- held-out H5 H6 H7 H8` (the mode now takes the phrase names and adds to SOURCES.json instead of
  starting it again; it would have dropped H1-H4's entries): once each; character-cost 38, 43, 42, 53; server dates
  Fri, 09 Oct 2026 09:17:56 to 09:17:59 GMT; durations 2.043356, 2.414875, 2.321995, 3.111474 s.
- `npm run audio:process`: every earlier file came out byte for byte the same; H5-H8 gains 3.1418688869335027,
  3.6952848862658447, 3.1362921302068183, 3.575748362126393; RMS raw → result 0.07170018808271295 →
  0.0680986885773395, 0.07119811156602733 → 0.06765986560507749, 0.05892329693830097 → 0.056009096762476146,
  0.07563637491219606 → 0.07185546241334075. Metadata: encoder tag only on all eight files (prompt #16's rule, which
  the author confirmed for H1-H4 in prompt #18).
- Clips v1, v2, v3 (renders 5.2 to 6.0 s each), side-by-side clips v1 | v3 and v2 | v3
  (`npm run side-by-side`, out/lipsync-v3/<phrase>-v1-v3.mp4 and -v2-v3.mp4). Measured with
  `npm run measure:exam -- H5 H6 H7 H8 --out H5-H8`: it calls the frozen `scripts/measure.mjs` measureClip and
  reportLines unchanged and adds v3's summary with the same `summary()`. Pixels against the draw list: 0
  disagreements on all 12 clips (1077 frames), 0 unread, largest template distance 5.
- Every value (ms, positive = late; f0 = mouth not rest at frame 0, flagged; ends on m, b, p: footnote above):

| phrase | word | kind | v1 | v2 | v3 |
|---|---|---|---|---|---|
| H5 | Alright | onset | −12.15386167800453 | −78.82086167800453 f0 | −78.82086167800453 f0 |
| H5 | Let | onset | 1.3148594104308575 | 134.64885941043087 | 1.3148594104308575 |
| H5 | One | onset | −5.441843537415059 | −38.775843537415035 | −38.775843537415035 |
| H5 | Alright | end | 8.072229024943312 | 41.40622902494334 | 41.40622902494334 |
| H5 | again | end | −22.26790702947845 | −22.26790702947845 | −22.26790702947845 |
| H5 | go | end | −14.104308390022746 | 19.22869160997731 | 19.22869160997731 |
| H6 | Is | onset | 8.798519274376423 | −57.868480725623584 f0 | −57.868480725623584 f0 |
| H6 | Testing | onset | 9.02494331065762 | −57.64205668934241 | −57.64205668934241 |
| H6 | One | onset | −0.40849659863950727 | −0.40849659863950727 | −0.40849659863950727 |
| H6 | on | end | −16.3718820861678 | −16.3718820861678 | −16.3718820861678 |
| H6 | Testing | end | 2.5400158730157774 | 2.5400158730157774 | 2.5400158730157774 |
| H6 | three | end | −26.348873015872964 | 40.31712698412715 | 40.31712698412715 |
| H7 | I | onset | −7.1651995464852565 | −73.83219954648526 f0 | −73.83219954648526 f0 |
| H7 | I (2nd) | onset | −18.68514058956916 | −18.68514058956916 | −18.68514058956916 |
| H7 | those | end | −5.351473922902361 | 27.981526077097474 | 27.981526077097474 |
| H7 | do | end | −3.03888208616776 | −3.03888208616776 | −3.03888208616776 |
| H8 | Keep | onset | 16.1904761904762 | −83.80952380952381 f0 | −83.80952380952381 f0 |
| H8 | A | onset | −11.337868480725488 | −44.670868480725545 | −44.670868480725545 |
| H8 | box | end | −37.32459637188201 | −70.65759637188206 | −70.65759637188206 |
| H8 | happy | end | 9.932306122448775 | 9.932306122448775 | 9.932306122448775 |

| version | kind | count | median | largest abs | within one frame | within 45 late / 125 early | not measured |
|---|---|---|---|---|---|---|---|
| v1 | onsets | 10 | −2.925170068027283 | 18.68514058956916 | 10 | 10 | 0 |
| v1 | ends | 10 | −9.727891156462555 | 37.32459637188201 | 9 | 10 | 0 |
| v2 | onsets | 10 | −51.15646258503398 | 134.64885941043087 | 2 | 9 | 0 |
| v2 | ends | 10 | 6.236160997732276 | 70.65759637188206 | 7 | 10 | 0 |
| v3 | onsets | 10 | −51.15646258503398 | 83.80952380952381 | 3 | 10 | 0 |
| v3 | ends | 10 | 6.236160997732276 | 70.65759637188206 | 7 | 10 | 0 |

- Closure: v1 9 of 16 (H5 0/1, H6 0/0, H7 2/4, H8 7/11), v2 12 of 16 (0/1, 0/0, 2/4, 10/11), v3 16 of 16.
- One-frame runs (pixel mouths): v1 4, 7, 8, 16; v2 0, 0, 0, 0; v3 0, 0, 0, 0. Changes per second: v1
  8.709677419354838, 11.506849315068495, 8.873239436619718, 12.631578947368421; v2 5.806451612903225,
  7.397260273972603, 8.873239436619718, 7.578947368421053; v3 8.709677419354838, 9.45205479452055,
  10.140845070422536, 9.789473684210527.
- Nothing was changed after seeing the numbers. No measuring-code bug found.
- Lags of the chain for H5-H8: 0, 1, 0, 0 samples. `npm test`: tests 160, pass 160, fail 0, skipped 0, duration_ms 68167.920792.

## 2026-10-09 · Prompt #19
- The H5-H8 exam is accepted. No time shift: v3 is the last version and the early mouth at phrase starts stays an
  observation. Nothing is wired into the episode or the web page until the author chooses between frozen v2 and
  frozen v3 after watching the v2 | v3 clips (out/lipsync-v3/H5-v2-v3.mp4 to H8-v2-v3.mp4).

## 2026-10-09 · Prompt #20: decisions, FACTS.md, the model licence

### Decisions (the author's)
- Lip sync: v3 is the main lip sync for the episode (`rig/lipsync-main.json`); v1 and v2 stay for the comparison
  clips. No time shift: the early mouth stays an observation.
- Voice: confirmed by ear by the author (`audio/voice.json` confirmedByEar).
- Emotions, chosen by eye by the author after looking at the sheet: happy and focused read as the same face. focused
  is removed (kept in `rig/emotions.json` removedByEye for the record) and happy tilts 6 degrees instead of 2.
  Decided by Claude: focused's demo mark is simply dropped, so surprised holds from frame 90 to 210. The emotions
  tests now expect three states. `npm run stage:renders -- emotions` (the script now takes the parts to render):
  sheet 4 frames rendered in 4.9s (`time` 6.580 s), out/emotions-sheet.png 1316x416 sha256
  f70fe90272b914924bcde0fe07554fa8f96aa4c92e06298950be4eb9e605a71e; walk-through seed 1 twice, 1m 3.4s (1m4.916s)
  and 1m 4.4s (1m6.066s), 300 of 300 frames identical; out/emotions-seed-1.mp4 from run 1.
- Camera page: the author tested it with a real camera on 2026-10-09. The page opens, no camera picture is shown,
  Ping follows the author's head, eyes, mouth and brows. This was checked by eye, with no numbers. "NOT VERIFIED WITH
  A REAL CAMERA" is replaced by "checked by eye by the author on 2026-10-09, no measurements" in README, the web code,
  the tests' comments, `lib/face-to-pose.mjs`, `scripts/serve-web.mjs` and PUBLISH-CHECKLIST.md; earlier DEVLOG and
  PROMPTS entries keep their words (history), and `rig/face.json` is unchanged as the author asked, so its $comment
  still says NOT VERIFIED WITH A REAL CAMERA. The checklist items that need DevTools, the console or numbers stay
  open.

### The model licence (checked by Claude, nothing published)
- The Face Landmarker documentation page (https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker,
  Models section) links three model cards for the bundle: BlazeFace short range (model date June 9, 2021), Face
  Mesh V2 (September 15, 2022), Blendshape V2 (November 11, 2022). Each card's first page says "LICENSED UNDER Apache
  License, Version 2.0" (PDFs read with pdftotext; their sha256 in `web/VENDOR.json`). Not checked: the cards do not
  name `face_landmarker.task` (float16/1). Recorded in PUBLISH-CHECKLIST.md (ticked) and `web/VENDOR.json`.
- `npm test`: tests 160, pass 160, fail 0, skipped 0, duration_ms 70754.36875.

### FACTS.md
- FACTS.md: 101 facts in eleven chapters (the ten asked for plus Voice), each with its source as `[file:line @ commit ⟦quote⟧]` or `[run: command @ commit]`
  (all at f4a3f98, the decisions commit), whether it was decided before or after seeing data, and marks for NOT
  INDEPENDENT, BY EYE, BY EAR and SYNTHETIC; 9 items under "Not measured". Line numbers were filled in by a script
  in the scratch folder from the quotes, then checked by `test/facts.test.mjs`: every cited commit, file, line and
  quote exists, every cited npm script exists at its commit, every commit named in the text exists, and every fact
  has a source.
- Wrong on my first draft and corrected before the commit: "about 5 % quieter" (a rounded number; the three ratios are
  now given), "12 attempts" cited to a command that prints file names (now also the outputSize line), and "all code
  written by Claude" (no file says it; now the Co-Authored-By line every commit carries, 27 of 27 at f4a3f98).
- `npm test`: tests 164, pass 164, fail 0, skipped 0, duration_ms 71398.836334.

## 2026-10-09 · Prompt #21: the script checked against the repository (read-only)

- The scripts were read in the CodeMask repository, not changed: script.en.md 20085 bytes, sha256
  865e221d43d6f469d632d7fbc6fc89ab77f1e8a9e41cf53d5c99b811b3df2192; script.ru.md 30515 bytes, sha256
  9c23f7c9b934e6ef821ec6bee00f4f9bd358f36fe39874628197423e5d86082a. Both match the prompt.
- Face points: `npm run face:points` (new, read-only) reads MediaPipe's own connection lists in
  web/vendor/tasks-vision (1.1.0): landmark indices 0..477, so 478 points per face; 476 of them appear in a
  connection, 468 and 473 in none. The worker sends every landmark of the first face and the page draws each as a
  dot. From the code only: no run has had a real face in front of it (the headless test's picture has no face).
- One eye shut: `lib/face-to-pose.mjs` line 49 averages eyeBlinkLeft and eyeBlinkRight; line 50 closes Ping's eyes
  when that mean goes above 0.55 and opens them when it falls below 0.35 (`rig/face.json` lines 13-16); line 70 has
  only "open" or "closed" for both eyes (`lib/rig.mjs` has no single-eye layer). So a wink moves the mean to about
  half of one eye's score: Ping has no wink; if the mean stays between 0.35 and 0.55 his eyes keep the state they had,
  above 0.55 both close. What a real wink scores was never measured.
- The repeat test in the script ("the same phrase twice, the same settings, two different sounds") was made in step 4
  with Miffy Mouse, the provisional voice (P1 twice). Measured now for River, read-only, on two files already in
  out/: the candidate line "Hello. I am Ping. I live in a terminal." from round 1 (out/voice-candidates/2-river.mp3)
  and from the prompt #16 final check (out/voice-final-check.raw.mp3), the same voice, model, settings and seed 1:
  both 36824 bytes and 98304 samples, 87875 samples differ, largest |difference| 0.06001995503902435, mean
  |difference| 0.0029135154292259414, character alignments identical. Command (lib/audio.mjs decode, then compare
  sample by sample):
  `node --input-type=module -e 'import { decode } from "./lib/audio.mjs"; const a = decode("out/voice-candidates/2-river.mp3").samples, b = decode("out/voice-final-check.raw.mp3").samples; let n = 0, m = 0, s = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) n++; if (d > m) m = d; s += d; } console.log(a.length, b.length, n, m, s / a.length)'`

## 2026-10-09 · Prompt #22: footage for the episode

- Script checked first: script.en.md 21021 bytes, sha256 8aca74c7e89668ef97afb053903045f194a949d4802421b58de1336a43449fe4
  (matches the prompt).
- Before any line was rendered, the combine rule was written down and tested (`lib/line.mjs`, README "A spoken line",
  `test/line.test.mjs`): partials in the order liveness, emotion, speech through the unchanged combine(). Mouth: speech
  from the first to the last letter, the emotion's mouth (or rest) outside; eyes: closed wins (sleepy or a blink);
  brows: the emotion only; head: liveness plus the emotion, rejected outside the limits; cursor: liveness. Decided by
  Claude (labelled in `rig/lines.json`): liveness seed 1 for every line; 15 rest frames after each line, 3 s for the
  outro (the author's); the tag's emotion starts at the first letter's start frame and eases in over 8 frames.
- Ping's six lines (prompt #22), `npm run voice -- lines`: 6 ElevenLabs calls, one per line, River, frozen settings,
  the script text without its tag; durations (ffprobe) hook 1.857596 s, alive 1.625397 s, fix 2.182676 s, emotions
  1.021678 s, webcam 1.393197 s, outro 1.393197 s. Processed with `npm run audio:process` (earlier files unchanged);
  chain lag alive -16 samples and emotions 72 samples (the others 0 or 1); not corrected, as before. Metadata: encoder
  tag only on all 12 files.
- Numbers computed for the script's stage notes (from the H5-H8 and H1-H4 tables above, ms, f0 = mouth already open
  at frame 0, so the true value is that or earlier):
  - mouth changes per second averaged over H5-H8: v1 10.43033627960287 (8.709677419354838, 11.506849315068495,
    8.873239436619718, 12.631578947368421), v3 9.523012742127113 (8.709677419354838, 9.45205479452055,
    10.140845070422536, 9.789473684210527);
  - v2 phrase starts in H1-H4: Okay −82.81179138321995 f0, Why −75.82766439909297 f0, Evolution
    −56.87074829931973 f0; the one onset inside a phrase: Open −3.855208616780015;
  - v2 and v3 phrase starts in H5-H8 (the same in both): Alright −78.82086167800453 f0, Is −57.868480725623584 f0,
    I −73.83219954648526 f0, Keep −83.80952380952381 f0; in frames (÷ 33.333333333333336): −2.364625850340136,
    −1.7360544217687075, −2.2149659863945574, −2.5142857142857142.
  Command: `node -e 'const m=a=>a.reduce((x,y)=>x+y)/a.length;console.log(m([8.709677419354838,11.506849315068495,8.873239436619718,12.631578947368421]),m([8.709677419354838,9.45205479452055,10.140845070422536,9.789473684210527]))'`
- Footage (`npm run footage`, code at 0111563, clean tree; out/footage/, not committed; 3:08.18 for everything):
  26 shots, each `<id>/<id>.mp4` and `shot.json` with its checks, all checks passing; the full run gave the same
  bytes as the trial runs for every shot except emotions-sheet-focused, whose labels I centred between the two. Total 29992 kB (`du -sk out/footage`) with the
  contact sheet; only mp4, json and the contact sheet png are kept.
  - Wrapped, copied unchanged: v1-P2, v1-v2-P2, v2-H2, v3-H7, emotions-walkthrough. From the two liveness renders
    (frames encoded, then the frame folders deleted; their per-frame sha256 lists stay): liveness-two-renders (300 of
    300 frames identical by sha256), liveness, still-alive-split (the neutral still of the reconstruction render next
    to run 1).
  - From frozen code: v3-H2 (11 of 11 closures read from the pixels, 0 frames where the pixel mouth disagrees with
    the draw list) and v2-v3-H2; mouth-region (frame 4 of v2-H2, the first that reads round, with the measuring window
    550, 892, 500 x 294 outlined); strip-moves, strip-My, strip-loud, strip-bob (the real mouth layers per frame,
    letters and times under them, missed closures in red: 3 in v2, 0 in v3; old rules from git e2a7f56 and 0b9efef);
    emotions-sheet-focused (rig/emotions.json from 9f9b04d, into out/footage only); mouths-row.
  - New: line-hook, line-alive, line-fix, line-emotions, line-webcam, line-outro (mouth, eyes and cursor read from the
    pixels agree with lib/line.mjs on every frame; the outro's 90 tail frames all eyes shut, the cursor both on and
    off); blink-compare (left a blink every 4 s from frame 60, right seed 1's blinks only; eyes from pixels agree on
    every frame of both); skeleton-sway (tilt 0, 8, −8, 0 degrees); layers-apart (whole-pixel moves only, no tile
    overlaps, all inside the stage).
  - Decided without asking: stills (strips, sheets, mouths row, mouth region) are held as 5 or 6 s mp4s; strips and
    sheets are 1920 x 1080, side-by-side shots 3200 x 1600; the blink comparison shows blinks only on both sides;
    the layers that are not in the neutral face fade in and out while they move; the head and the glow stay in
    place; the old emotions sheet has labels and the mouths row has none (the edit adds them); liveness seed 1 for
    the lines.
- What broke:
  - The frozen measuring code reads the mouth from an upright head; at happy's 6 degree tilt the rotated smile reads
    as small or unread (59 of 64 frames of line-alive wrong). The method stays frozen; the footage checks for the
    lines turn each bright pixel back by the frame's pose before measuring the box. It needs sine and cosine, which
    the determinism test bans in scripts; they are Taylor polynomials (largest error 9.177769655366319e-11 over
    ±12 degrees).
  - My crops for the eyes and cursor checks had odd sizes; ffmpeg rounds odd crops of yuv420p video, so the raw
    frames no longer divided evenly and every later frame was shifted (3 false cursor disagreements in the outro).
    Crops are now even.
  - A local variable named `read` shadowed the JSON reader (a ReferenceError), and the eyes were first classified by
    the box height, which a 6.7 degree tilt pushes past the threshold for shut eyes; they are now classified by the
    count of bright pixels, which turning does not change.
  - The recording-mode test counted the hidden start button as visible (display is not inherited); visibility is
    now read from the layout.
- Webcam page, recording mode (`?record=1`): 1920 x 1080, black; on the left the 128 points of
  FACE_LANDMARKS_CONTOURS (lips 40, eyes 16 + 16, eyebrows 10 + 10, face oval 36; web/record-points.json from
  `npm run face:points`), mirrored like Ping, 6 px dots; on the right Ping; one caption "128 of 478 points shown";
  the camera starts by itself once ready. Privacy guards unchanged; the four headless tests pass (requests after
  ready 0 in the recording mode too).
- `npm test`: tests 171, pass 171, fail 0, skipped 0, duration_ms 68868.638958.

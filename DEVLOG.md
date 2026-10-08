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

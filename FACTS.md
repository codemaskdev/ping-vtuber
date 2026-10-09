# Facts for the script

Every number and claim the video may use, one per line, each with where it comes from. Nothing here is typed from
memory: if it has no source it is under "Not measured" at the end.

How to read a line:
- `[path:line @ commit ⟦quote⟧]`: the quoted text stands on that line of that file at that commit
  (test/facts.test.mjs checks the file, the line, the quote and the commit).
- `[run: command @ commit]`: the command that prints the number, at that commit (the test checks the npm script or
  the commit exists).
- When: **before data** = decided before seeing the data it is about; **after data** = decided or changed after
  seeing output; **measured** = a number a run printed; **author** = the author's decision.
- Marks: **NOT INDEPENDENT** (measured against something it was built from), **BY EYE** / **BY EAR** (checked only by
  looking or listening, no numbers), **SYNTHETIC** (made by code, not a real face or camera).

## Layers and rig

- The character is 11 layers on a 1254 x 1254 canvas, cut by scripts from 8 generated images. measured [DEVLOG.md:327 @ f4a3f98 ⟦`npm run process` → art/layers/ (11 layers)⟧]
- The 8 images are used unmodified (sha256 the same at source and copy). measured [DEVLOG.md:307 @ f4a3f98 ⟦Promoted unmodified (`npm run promote`), sha256 the same at source and copy⟧]
- No art is drawn or retouched by hand; every processing step is a script. rule, before data [CLAUDE.md:10 @ f4a3f98 ⟦Never draw replacement art in code and never retouch⟧]
- Rebuilt from the layers, the neutral face differs from the original image by a mean of 1.0156350876396396 (max 23) outside the outline, 5.854277324607164 (max 142) on the outline, 1.105652724750751 (max 64) inside the screen, channel values 0..255. measured [DEVLOG.md:372 @ f4a3f98 ⟦outside the outline: 704761 px, mean 1.0156350876396396⟧] [DEVLOG.md:374 @ f4a3f98 ⟦on the outline: 168688 px, mean 5.854277324607164⟧] [DEVLOG.md:376 @ f4a3f98 ⟦inside the screen: 699067 px, mean 1.105652724750751⟧]
- The same numbers on the 1600 x 1600 stage. measured [DEVLOG.md:606 @ f4a3f98 ⟦have a largest channel value of 0. Against the master the numbers are the same as in step 2⟧]
- Known limitation: the glow layer keeps only a faint band, alpha at most 33 (38972 pixels). measured, accepted by the author after data [DEVLOG.md:325 @ f4a3f98 ⟦so the glow layer holds only a faint band: art/layers/glow.png, 38972 pixels with alpha above 0, alpha at most 33.⟧]
- Each mouth keeps the smile's top edge by a vertical anchor: rest 0, small 0, open 29, round 45, wide -1 px. measured; the rule is the author's, after data [DEVLOG.md:295 @ f4a3f98 ⟦mouth_rest top 788 anchorDy 0, moved lowest row 886; mouth_small 788, 0, 913; mouth_open 759, 29, 963;⟧] [DEVLOG.md:296 @ f4a3f98 ⟦mouth_round 743, 45, 996; mouth_wide 789, -1, 889.⟧]
- The head turns around a pivot at 626,1102; the smile's top edge is row 788. measured [DEVLOG.md:345 @ f4a3f98 ⟦frozen art/regions.json; each mouth's anchorDy from art/process-log.json; canvas 1254 x 1254; head pivot 626,1102;⟧]
- Brows at rest sit one smile block (50 px) above the eyes: browsRestDy -22. rule by the author before data, value measured [DEVLOG.md:348 @ f4a3f98 ⟦equals one smile block. Measured (`npm run rig`): brows bottom row 489, eyes top row 518, gap 28 px, block 50 px⟧]
- The stage is 1600 x 1600 with the art centred at 173,173; the head may tilt ±12 degrees and shift ±30 px. author, after data (the first ±4 degree limit was too small for a real head) [DEVLOG.md:597 @ f4a3f98 ⟦centred); tilt limit -12..12 degrees. The draw list's translate is now the head's shift plus artOffset; rotation⟧]
- At ±12 degrees and ±30 px every layer keeps at least 41.6485422055714 px of room on the stage (an arc bound, no trigonometry). measured [DEVLOG.md:599 @ f4a3f98 ⟦(the author's value), stageProposal replaced by a note that it is applied.⟧] [DEVLOG.md:598 @ f4a3f98 ⟦Fit check on the stage: smallest room 41.6485422055714 px (glow).⟧]
- The first limit, ±4 degrees on the 1254 px canvas, left 19.26524282106189 px of room; 6 degrees would not have fitted. measured [DEVLOG.md:353 @ f4a3f98 ⟦r * theta + shift without trigonometry; smallest room left 19.26524282106189 px (glow). A first choice of 6 degrees⟧]
- Rendering is deterministic: the 120-frame test clip rendered twice gave 120 of 120 identical frames, on the stage too. measured [DEVLOG.md:366 @ f4a3f98 ⟦`npm run frame-hashes -- out/render/clip-1 out/render/clip-2`: 120 frames, 120 identical by sha256, 0 differ.⟧] [DEVLOG.md:604 @ f4a3f98 ⟦step 2 test clip twice: 26.8s (28.297 s) and 26.6s (28.213 s); 120 frames, 120 identical by sha256.⟧]
- The rig code has no trigonometry and runs unchanged in Node and in the browser. tested [test/rig.test.mjs:145 @ f4a3f98 ⟦lib/rig.mjs runs in a browser: no imports, no Node globals, no trigonometry⟧]

## Liveness

- Blinks every 2 to 6 s (from the end of one to the start of the next), closed for 0.10 to 0.15 s, one in about seven a double (chance 0.15). chosen before data [rig/liveness.json:4 @ f4a3f98 ⟦"intervalS": [2.0, 6.0],⟧]
- Breathing: 4 s period, 6 px from top to bottom. 4 s chosen before data; 6 px the author's, after watching step 3 [rig/liveness.json:16 @ f4a3f98 ⟦"depthPx": 6,⟧]
- Micro drift: a new small head target every 1.5 to 3.5 s, within ±0.8 degrees and ±4 px. chosen before data [rig/liveness.json:22 @ f4a3f98 ⟦"tiltDeg": 0.8,⟧]
- Cursor blinks 0.53 s on, 0.53 s off. chosen before data [rig/liveness.json:28 @ f4a3f98 ⟦"onS": 0.53,⟧]
- Seed 1 over 60 s: 16 blinks start (2 of them the second of a double), 61 frames with the eyes closed. measured [DEVLOG.md:411 @ f4a3f98 ⟦16 blinks start in the 60 s (2 of them the second of a⟧] [run: npm run liveness:report -- --seed 1 --seconds 60 @ f4a3f98]
- Seed 1 over 60 s: largest head tilt 0.6771515524734805 degrees, largest vertical move 6.642545818415915 px. measured [DEVLOG.md:436 @ f4a3f98 ⟦degrees, |x| 3.908362841289338 px, |y| 6.642545818415915 px. 10 s clip for seed 1 rendered twice⟧]
- The 10 s liveness clip rendered twice: 300 of 300 frames identical (same seed, same bytes). measured [DEVLOG.md:609 @ f4a3f98 ⟦liveness seed 1 twice: 1m 2.9s (1m4.275s) and 1m 3.0s (1m4.650s); 300 of 300 frames identical;⟧]
- No randomness without a seed and no clock in anything that affects output. rule, before data [CLAUDE.md:19 @ f4a3f98 ⟦No `Math.random` and no wall-clock time in anything that affects output.⟧]

## Voice

- Ping's voice is River (ElevenLabs library voice) through the "stronger" filter chain. author, after listening to 6 candidates [audio/voice.json:25 @ f4a3f98 ⟦"chosenBy": "the author, prompt #16: candidate 6 of round 2, River with the⟧]
- The voice is confirmed by ear. author, BY EAR [audio/voice.json:141 @ f4a3f98 ⟦"confirmedByEar": "the author, prompt #20: the voice (River with the stronger chain) is confirmed by ear"⟧]
- 9 candidate voices were offered in two rounds: 3 library voices, then 2 library, 2 designed from a text description, 2 processed. measured [DEVLOG.md:447 @ f4a3f98 ⟦  1. Miffy Mouse - Squeaky, Upbeat Cartoon (M5t0724ORuAGCh3p3DUR), 3.111474 s — provisional voice;⟧] [DEVLOG.md:498 @ f4a3f98 ⟦- `npm run voice:round2` → out/voice-candidates/round-2/ (not committed) with candidates.txt. Four ElevenLabs calls:⟧]
- ElevenLabs does not repeat itself: P1 asked twice with the same settings and seed gave different bytes; 78084 of 86016 samples differ. measured [DEVLOG.md:454 @ f4a3f98 ⟦difference at byte 219). Decoded, both are 86016 samples; 78084 differ, largest |difference| 0.06707808375358582,⟧]
- What ElevenLabs returns is kept untouched in audio/raw/; one script makes the processed file: decode, filter chain, one gain, one mp3 encode. rule by the author, before data [DEVLOG.md:621 @ f4a3f98 ⟦- `audio/raw/` holds what ElevenLabs returned, untouched, with the alignment (`P<n>.align.json`); the alignment files⟧]
- The processing is repeatable: run twice, identical bytes. measured [DEVLOG.md:640 @ f4a3f98 ⟦- Repeatable: `npm run audio:process` twice on the same raw files gave identical bytes for P1, P2, P3 and⟧]
- The filter chain does not move the sound in time: 1, 1 and 0 samples on P1-P3 (at 44100 Hz). measured [DEVLOG.md:643 @ f4a3f98 ⟦- Time shift (normalised cross-correlation of the raw samples with the processed ones, lags -2205..2205): P1 1⟧]
- After the one mp3 encode the processed voice is a little quieter than the raw take: RMS ratios 0.9510940487898364, 0.9510814817432536, 0.9495770358559552 on P1-P3; left as it is by the author. measured [DEVLOG.md:638 @ f4a3f98 ⟦  0.9510940487898364 (P1), 0.9510814817432536 (P2), 0.9495770358559552 (P3), 0.9498149057804002 (final check). Not⟧]
- Every committed mp3 carries only the encoder tag as metadata. measured [audio/raw/P1.metadata.txt:28 @ f4a3f98 ⟦--- encoder tag only: yes⟧]

## Lip sync v1 (loudness)

- v1 opens the mouth by loudness alone: RMS per frame, rest below 0.01, open from 0.07, small between; naive on purpose. rule before data, thresholds chosen after looking at P1-P3 [rig/lipsync-volume.json:4 @ f4a3f98 ⟦"openFrom": 0.07,⟧]
- Thresholds were chosen on P1-P3 of the final voice: 48 of 151 frames are silence or breath (under 0.0075). after data (development phrases only) [DEVLOG.md:657 @ f4a3f98 ⟦- v1 thresholds chosen again on the processed P1-P3 (out/lipsync-stats.txt): 48 of 151 frames under 0.0075, the⟧]
- On P1-P3 (final voice) v1 changes the mouth 8.25, 8.181818181818182 and 7.333333333333333 times a second, with 3, 7 and 2 one-frame flickers. measured [DEVLOG.md:659 @ f4a3f98 ⟦v1 report: P1 8.25 changes/s, 1-frame runs 3; P2 8.181818181818182, 7; P3⟧]
- v1 closes the lips on 2 of the 6 m, b, p in P1-P3. measured, NOT INDEPENDENT (letter times from ElevenLabs) [DEVLOG.md:665 @ f4a3f98 ⟦- Closure score (m, b, p): v1 2 of 6, v2 before 6 of 6, v2 after 6 of 6.⟧]
- v1's timing is measured against a reference made from the same loudness. NOT INDEPENDENT [MEASUREMENT.md:120 @ f4a3f98 ⟦- **v1 is made from the same loudness the reference uses.**⟧]

## Lip sync v2 (letter timings)

- v2 uses ElevenLabs' letter timings: letters with start and end times, not phonemes. rule before data [README.md:152 @ f4a3f98 ⟦audio): **letters with start and end times, not phonemes**.⟧]
- v2's rules were committed before anything was rendered with them. before data [DEVLOG.md:515 @ f4a3f98 ⟦- Rules first (rig/lipsync-text.json), committed before anything was rendered with them, as asked; this makes two⟧]
- First version (provisional voice): closures 6 of 6 against v1's 2 of 6, and no one-frame flicker. measured, NOT INDEPENDENT (closures use the same letter times) [DEVLOG.md:524 @ f4a3f98 ⟦    (2 of 6); v2 P1 2 of 2, P2 3 of 3, P3 1 of 1 (6 of 6);⟧]
- Changed after seeing output (author): "My" sounds like "I" so a word's only y is open; ou and ow go open then round. after data [DEVLOG.md:661 @ f4a3f98 ⟦- Rules changed after seeing words.txt (author's prompt #16), labelled in `rig/lipsync-text.json`⟧]
- Changed after seeing output (author): a frame takes the letter that covers most of its time. after data [DEVLOG.md:724 @ f4a3f98 ⟦- `rig/lipsync-text.json` frameRule (mode "majority"), labelled "changed after seeing output" with what the author⟧]
- After that change, P1-P3 still scored 6 of 6 closures, but "My", "am" and "you" lost their vowel. measured [DEVLOG.md:756 @ f4a3f98 ⟦  The closure score did not drop, so nothing else was changed. "My", "am" and "you" now lose their vowel the same way⟧]
- v2 is frozen from commit 3df3c97: rules, thresholds, filter chain and voice settings do not change. author [rig/frozen.json:7 @ f4a3f98 ⟦"rig/lipsync-text.json (v2 rules)"⟧]

## The first exam (H1 to H4)

- The measuring method was written and committed (5332a8c) before the four held-out phrases existed. before data [DEVLOG.md:776 @ f4a3f98 ⟦### Part B: the measurement method (committed before any held-out audio)⟧]
- The mouth is read from the pixels of the finished video, not from the program's own list. rule before data [MEASUREMENT.md:23 @ f4a3f98 ⟦The mouth is read from the pixels of each frame, not from the draw list.⟧]
- Pixels and the program's list agreed on every frame: 392 frames of P1-P3 and 672 of H1-H4. measured [DEVLOG.md:787 @ f4a3f98 ⟦- Pixels against the draw list on P1–P3 (v1 and v2, 392 frames): 0 disagreements, 0 unread, largest template⟧] [DEVLOG.md:822 @ f4a3f98 ⟦(out/measure/H.txt); a second run with `--check-drawlist` gave the same file plus: pixels and draw list agree on⟧]
- When the sound starts and stops is taken from the video's own audio: 10 ms windows, -50 dBFS, pauses of 80 ms or more (the idea of the episodes' onsets.mjs). chosen on P1-P3 before H1-H4 existed [measurement.json:8 @ f4a3f98 ⟦"minPauseS": 0.08,⟧]
- Yardsticks: one frame (33.3 ms), and 45 ms late / 125 ms early. author, before data [MEASUREMENT.md:113 @ f4a3f98 ⟦- within 45 ms late and 125 ms early: −125 ≤ offset ≤ 45 ms.⟧]
- H1-H4 closures: v1 8 of 14, v2 10 of 14. measured, NOT INDEPENDENT [DEVLOG.md:844 @ f4a3f98 ⟦- Closure score: v1 8 of 14, v2 10 of 14 (H1 0 of 1, H2 8 of 11, H3 0 of 0, H4 2 of 2). With the rules before prompt⟧]
- v2 without the majority change would have scored 14 of 14: the author's majority rule lost the short b and p. measured; the cause stated by the author [DEVLOG.md:845 @ f4a3f98 ⟦  #17's change (e2a7f56, from lipsync:compare on the draw list) v2 would have had 14 of 14: the majority rule drops⟧] [DEVLOG.md:857 @ f4a3f98 ⟦- The H1-H4 exam stands as measured: v2 scored 10 of 14 closures. The cause was the author's majority rule of prompt⟧]
- H1-H4 onsets: v1 median −12.652727891156456 ms, all 4 within one frame; v2 median −66.34920634920636 ms, 1 of 4 within one frame. measured [DEVLOG.md:839 @ f4a3f98 ⟦| v1 | onsets | 4 | −12.652727891156456 | 23.537748299319727 | 4 | 4 | 2 |⟧] [DEVLOG.md:841 @ f4a3f98 ⟦| v2 | onsets | 4 | −66.34920634920636 | 82.81179138321995 | 1 | 4 | 2 |⟧]
- H1-H4 ends: v1 median −15.53271315192739 ms, v2 median −10.634587301587285 ms; v2's worst −132.0178072562359 ms ("lamp", an end on m and p). measured [DEVLOG.md:840 @ f4a3f98 ⟦| v1 | ends | 6 | −15.53271315192739 | 65.35180725623579 | 4 | 6 | 0 |⟧] [DEVLOG.md:842 @ f4a3f98 ⟦| v2 | ends | 6 | −10.634587301587285 | 132.0178072562359 | 3 | 5 | 0 |⟧]
- Footnote: an end on m, b or p counts as early by construction (the lips are meant to close from the m on). author, after data [DEVLOG.md:860 @ f4a3f98 ⟦- Footnote to every end offset (frozen method, unchanged): a word that ends on m, b or p (H2 "lamp") is counted; its⟧]
- The resolution of every offset is one frame (33.3 ms). NOT INDEPENDENT of the frame grid [MEASUREMENT.md:125 @ f4a3f98 ⟦- **The resolution is one frame (33.333333333333336 ms).**⟧]
- The video's audio track matches the mp3 sample for sample; a player that ignored the mp4 edit list would play it 25 ms late. measured [MEASUREMENT.md:15 @ f4a3f98 ⟦the mp4 carries an edit list that skips the encoder's first 1105 samples, and ffmpeg applies it, so on P1–P3 the⟧]

## The fix (v3)

- v3 keeps v2's letters and majority rule, gives every m, b, p, f, v left without a frame the frame it overlaps most, and grows short runs before removing them. author, after data (P1-P3 and H1-H4) [rig/lipsync-v3.json:5 @ f4a3f98 ⟦"label": "changed after seeing P1 to P3 and H1 to H4",⟧]
- One more rule, decided by Claude after a test caught it on "brought": a closure run never gives away a letter's last closure frame. after data [DEVLOG.md:874 @ f4a3f98 ⟦- Found by a test before the freeze, decided without asking: rule 3 as first written let a short run grow into a⟧]
- v2 is kept byte for byte: a test holds it to its output recorded before v3 was written. tested [test/lipsync-v3.test.mjs:18 @ f4a3f98 ⟦v2 gives exactly the mouths recorded before v3 was written, on every seen phrase⟧]
- On the seven seen phrases: closures v2 16 of 20, v3 20 of 20. measured, NOT INDEPENDENT, seen data [DEVLOG.md:943 @ f4a3f98 ⟦total closure: v2 16 of 20, v3 20 of 20⟧]
- "am" still stays closed in v3 (its a wins one frame and neither neighbour can give one). measured [DEVLOG.md:880 @ f4a3f98 ⟦  "am" (P1) stays rest in v3: its a wins one frame, neither neighbour can give one (a 2-frame pause before, the⟧]
- v3 was frozen in commit 40ae504 as the last version for this episode. author [rig/frozen.json:13 @ f4a3f98 ⟦"lib/lipsync-v3.mjs (v3)"⟧]
- v3 is the episode's lip sync; v1 and v2 stay for comparison clips. author, after watching the v2 | v3 clips, BY EYE [rig/lipsync-main.json:3 @ f4a3f98 ⟦"main": "v3",⟧]

## The second exam (H5 to H8)

- Four new phrases were synthesised only after v3 was frozen, and measured with the unchanged method of 5332a8c. before data [DEVLOG.md:947 @ f4a3f98 ⟦### Part B: the second exam, H5-H8 (after the v3 freeze 40ae504)⟧]
- Closures: v1 9 of 16, v2 12 of 16, v3 16 of 16. measured, NOT INDEPENDENT (letter times from ElevenLabs) [DEVLOG.md:995 @ f4a3f98 ⟦- Closure: v1 9 of 16 (H5 0/1, H6 0/0, H7 2/4, H8 7/11), v2 12 of 16 (0/1, 0/0, 2/4, 10/11), v3 16 of 16.⟧]
- One-frame flickers: v1 4, 7, 8 and 16 per phrase; v2 and v3 none. measured [DEVLOG.md:996 @ f4a3f98 ⟦- One-frame runs (pixel mouths): v1 4, 7, 8, 16; v2 0, 0, 0, 0; v3 0, 0, 0, 0. Changes per second: v1⟧]
- Onsets: v1 median −2.925170068027283 ms, 10 of 10 within one frame; v2 median −51.15646258503398 ms, 2 of 10; v3 median −51.15646258503398 ms, 3 of 10. measured [DEVLOG.md:988 @ f4a3f98 ⟦| v1 | onsets | 10 | −2.925170068027283 | 18.68514058956916 | 10 | 10 | 0 |⟧] [DEVLOG.md:990 @ f4a3f98 ⟦| v2 | onsets | 10 | −51.15646258503398 | 134.64885941043087 | 2 | 9 | 0 |⟧] [DEVLOG.md:992 @ f4a3f98 ⟦| v3 | onsets | 10 | −51.15646258503398 | 83.80952380952381 | 3 | 10 | 0 |⟧]
- Ends: v1 median −9.727891156462555 ms (9 of 10 within one frame); v2 and v3 median 6.236160997732276 ms (7 of 10). measured [DEVLOG.md:989 @ f4a3f98 ⟦| v1 | ends | 10 | −9.727891156462555 | 37.32459637188201 | 9 | 10 | 0 |⟧] [DEVLOG.md:993 @ f4a3f98 ⟦| v3 | ends | 10 | 6.236160997732276 | 70.65759637188206 | 7 | 10 | 0 |⟧]
- Within 45 ms late / 125 ms early: v3 20 of 20, v2 19 of 20, v1 20 of 20. measured (same table lines) [DEVLOG.md:991 @ f4a3f98 ⟦| v2 | ends | 10 | 6.236160997732276 | 70.65759637188206 | 7 | 10 | 0 |⟧]
- v3's only change from v2 in timing: "Let" in H5, 134.64885941043087 ms late in v2, 1.3148594104308575 ms in v3. measured [DEVLOG.md:966 @ f4a3f98 ⟦| H5 | Let | onset | 1.3148594104308575 | 134.64885941043087 | 1.3148594104308575 |⟧]
- Pixels and the program's list agreed on all 1077 frames of the 12 clips. measured [DEVLOG.md:959 @ f4a3f98 ⟦  reportLines unchanged and adds v3's summary with the same `summary()`. Pixels against the draw list: 0⟧]
- The early mouth at phrase starts: ElevenLabs puts the first letter at 0 s, before the sound, so v2 and v3 open early there (up to 83.80952380952381 ms). observation, not fixed (author) [DEVLOG.md:850 @ f4a3f98 ⟦- Seen in the numbers, nothing changed: three of v2's four measured onsets are flagged f0 (the alignment starts the⟧] [rig/lipsync-main.json:2 @ f4a3f98 ⟦No time shift: the early mouth at phrase starts stays an observation.⟧]

## Emotions

- Three emotions besides neutral: happy, surprised, sleepy. Each is only what this face has: brows, eyes open or closed, five mouths, head tilt and shift. chosen before data; focused removed by the author after data, BY EYE [rig/emotions.json:88 @ f4a3f98 ⟦"why": "chosen by eye by the author (prompt #20): on the emotions sheet happy and focused read as the same face, so focused is removed"⟧]
- Happy tilts the head 6 degrees. author, after data, BY EYE [rig/emotions.json:22 @ f4a3f98 ⟦"chosenByEye": "tilt 6 degrees instead of 2: chosen by eye by the author (prompt #20), after looking at the emotions sheet, where happy and focused read as the same face"⟧]
- Happy keeps the closed smile: the wide mouth read as gritted teeth. after data, BY EYE (Claude) [DEVLOG.md:545 @ f4a3f98 ⟦  wide mouth read as gritted teeth, not a grin, so happy keeps the logo's closed smile (recorded in the file).⟧]
- Emotions ease over 8 frames (0.27 s at 30 fps). chosen before data [rig/emotions.json:3 @ f4a3f98 ⟦"transitionFrames": 8,⟧]
- Emotions are written into the script as tags like [happy]; unknown tags fail. before data [DEVLOG.md:550 @ f4a3f98 ⟦- lib/script-tags.mjs: parseTags (tags removed, spaces collapsed, unknown tags and unbalanced brackets fail) and⟧]
- The 10 s walk-through rendered twice: 300 of 300 frames identical. measured [DEVLOG.md:1020 @ f4a3f98 ⟦  and 1m 4.4s (1m6.066s), 300 of 300 frames identical; out/emotions-seed-1.mp4 from run 1.⟧]

## Webcam

- The page was checked with a real camera by the author on 2026-10-09: it opens, shows no camera picture, and Ping follows head, eyes, mouth and brows. BY EYE, no measurements [DEVLOG.md:1021 @ f4a3f98 ⟦- Camera page: the author tested it with a real camera on 2026-10-09. The page opens, no camera picture is shown,⟧]
- The camera picture is never drawn, stored or sent; code guards in the page and in the detector worker refuse it. tested headless with a stubbed camera, SYNTHETIC [README.md:209 @ f4a3f98 ⟦  loaded (fetch, XMLHttpRequest, WebSocket, EventSource, WebTransport, importScripts, nested workers,⟧]
- Headless test: 25 requests before the page is ready, 0 after. measured, SYNTHETIC [DEVLOG.md:698 @ f4a3f98 ⟦  and convertToBlob were all refused (5 refusals recorded) and the server saw no request; detection kept running⟧] [DEVLOG.md:699 @ f4a3f98 ⟦  after the lockdown. 25 requests before ready (worker-privacy.js is new), 0 after.⟧]
- Face tracking: MediaPipe Face Landmarker (tasks-vision 1.1.0), model 3758596 bytes, run on the CPU in a worker. measured [DEVLOG.md:563 @ f4a3f98 ⟦  web/vendor/ and downloads face_landmarker.task (3758596 bytes, sha256⟧]
- The model's three model cards each say Apache License 2.0. read by Claude on 2026-10-09 [PUBLISH-CHECKLIST.md:11 @ f4a3f98 ⟦      models in the bundle, each with a model card; every card says "LICENSED UNDER Apache License, Version 2.0":⟧]
- Head tilt follows at 0.6 times the real roll (a 20 degree roll reaches the 12 degree limit). chosen (gain by the author), not measured on a face [rig/face.json:6 @ f4a3f98 ⟦"tiltGain": 0.6,⟧]
- The detector's clock is the video's own frame times, so skipped frames keep real time. before data (author) [DEVLOG.md:763 @ f4a3f98 ⟦- `web/main.js`: with requestVideoFrameCallback (Chrome has it) each presented video frame calls back with its⟧]
- The face mesh model card lists faces tilted more than 8 degrees as a limitation. read by Claude [PUBLISH-CHECKLIST.md:22 @ f4a3f98 ⟦inclined from the vertical orientation (more than 8°)⟧]

## How it was built

- Character art: Codex CLI 0.161.0 with its built-in image tool (image_gen.imagegen), session model gpt-5.5. measured from Codex's logs [art/generations.json:67 @ f4a3f98 ⟦"codexCliVersion": "codex-cli 0.161.0",⟧] [art/generations.json:68 @ f4a3f98 ⟦"codexModel": "gpt-5.5",⟧]
- The image model is named only by the C2PA manifest in each image: "gpt-image", by "OpenAI Media Service API". measured (exiftool) [DEVLOG.md:124 @ f4a3f98 ⟦  manifest in each output names softwareAgent "ChatGPT" version "gpt-image", claim generator "OpenAI Media Service⟧]
- 8 generator prompts (G1 to G8); G3, G6 and G7 were rewritten once after attempt 1. after data [DEVLOG.md:218 @ f4a3f98 ⟦- G3, G6, G7 corrected as the author wrote them (prompt #9); the attempt-1 texts stay next to them in⟧]
- 12 generator attempts (one extract .json each in art/attempts/), all 1254 x 1254; 8 used, 4 not. measured [run: git ls-tree --name-only f4a3f98 art/attempts/ @ f4a3f98] [art/generations.json:78 @ f4a3f98 ⟦"outputSize": "1254x1254",⟧]
- Not used, G2-01 (empty head): it redrew the chevron in another colour and failed the region rule. after data [DEVLOG.md:131 @ f4a3f98 ⟦  - blob 2, box 268,280,170,125, 10753 px, 6173 red: the cursor, joined with the chevron, which G2-01 redrew in a⟧]
- Not used, G3-01 (brows): the brows sat too low and joined the eyes. after data [DEVLOG.md:203 @ f4a3f98 ⟦  - G3-01 (brows): the brows sit at y 477, close above the eyes (top 518); they reach y 497 and 498, below the brows⟧]
- Not used, G7-01 (round mouth): the ring started 50 px above the smile's top edge. after data [DEVLOG.md:201 @ f4a3f98 ⟦  - G7-01 (mouth_round): the ring starts at y 739, a block above the smile's top edge 788, 20 px above the mouth⟧]
- Not used, G6-02 (open mouth): its end blocks stuck out 12 px and it had visible seams; G6-01 was used. author, after data, BY EYE [DEVLOG.md:258 @ f4a3f98 ⟦- Sources (author's prompt #10): G2-02, G3-02, G4-01, G5-01, G6-01, G7-02, G8-01. G6-01 replaces G6-02: G6-02's end⟧]
- Animation: HyperFrames 0.8.134 (pinned), rendering HTML canvas frames. before data [DEVLOG.md:359 @ f4a3f98 ⟦  Pinned hyperframes@0.8.134, the version the episodes pipeline uses (the host preview itself pins 0.8.133).⟧]
- Audio and muxing: ffmpeg 8.1.1. measured [audio/decode-log.json:6 @ f4a3f98 ⟦"decoder": "ffmpeg version 8.1.1 Copyright (c) 2000-2026 the FFmpeg developers",⟧]
- Voice: ElevenLabs eleven_multilingual_v2, stability 0.5, similarity 0.75, seed 1. chosen before data [audio/voice.json:73 @ f4a3f98 ⟦"modelId": "eleven_multilingual_v2",⟧]
- Packages: pngjs 7.0.0, @mediapipe/tasks-vision 1.1.0, puppeteer-core 25.13.0 (tests only). before data [package.json:55 @ f4a3f98 ⟦"pngjs": "7.0.0"⟧] [package.json:54 @ f4a3f98 ⟦"@mediapipe/tasks-vision": "1.1.0",⟧] [package.json:58 @ f4a3f98 ⟦"puppeteer-core": "25.13.0"⟧]
- No Live2D and no VTuber apps or SDKs. rule [CLAUDE.md:8 @ f4a3f98 ⟦No Live2D, no VTuber apps or their SDKs⟧]
- Every author prompt is kept verbatim in PROMPTS.md: 20 prompts. measured [run: grep -c "^## Prompt #" PROMPTS.md @ f4a3f98] [PROMPTS.md:976 @ f4a3f98 ⟦## Prompt #20⟧]
- Every commit is made by Claude Code and says so in a Co-Authored-By line. [run: git log --format=%(trailers:key=Co-Authored-By) f4a3f98 @ f4a3f98]
- 160 automated tests, all passing, at the decisions commit. measured [DEVLOG.md:1035 @ f4a3f98 ⟦- `npm test`: tests 160, pass 160, fail 0, skipped 0, duration_ms 70754.36875.⟧]

## Not measured

- Anything numeric about the real camera: frame rate, CPU load, network requests, landmark alignment, tilt range (checked by eye only).
- Whether viewers see the lip sync as in sync: no viewer test; the offsets are against an acoustic reference, not against a judgement.
- Ground truth for lips: no phoneme or lip recording; closures are scored with ElevenLabs' own letter times.
- How far ElevenLabs' letter times lie from the sound itself (only the observation that the first letter starts at 0 s).
- Image generation cost: Codex and the image tool report no credits.
- The voice design previews' model and credits (not reported by that endpoint).
- That the three model cards cover the exact file face_landmarker.task (float16/1): not stated in the cards.
- Total working time and total cost of the project.
- The number of ElevenLabs calls over the whole project (each step logs its own calls; no total was counted).

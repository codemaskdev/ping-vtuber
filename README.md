# Ping VTuber

Ping is an original terminal-face character based on the CodeMask channel logo, built on camera for CodeMask
episode 3: a VTuber made with AI. Character art comes from a text-to-image generator, animation from HyperFrames
(later steps), and all code is in this repository. No Live2D and no VTuber apps. Rules: `CLAUDE.md`.

## Step 1: Ping's layers

```
art/reference/logo-5A.svg    the channel logo; logo-5A.png is the copy given to the generator
art/GENERATOR_PROMPTS.md     prompts G1…G8, run in this order by npm run generate (Codex CLI image tool)
art/raw/attempts/            every generator attempt, copied unmodified (committed only once approved)
art/attempts/                per attempt: extract of Codex's logs, metadata dump (committed)
logs/                        raw Codex event logs and session files (never committed)
art/raw/                     the generator's images, untouched
art/generations.json         generator name, version, date, prompt and metadata approval per image
art/layers.json              the layer spec: layers, parents, region and pivot rules, thresholds
art/regions.json             canvas, regions and pivots measured on the approved master, then frozen
art/layers/                  one transparent full-canvas PNG per layer (made by npm run process)
art/process-log.json         every automatic step applied, with its numbers
art/SOURCES.json             sha256 of every reference, raw and processed file, with its provenance
out/                         contact sheet, full-size composites, master review (views, never committed)
```

Layers, back to front: `glow`, `head`, `cursor`, `eyes_open` / `eyes_closed`, `brows`, and one of five mouths:
`mouth_rest` (silence, M B P, also F V), `mouth_small`, `mouth_open`, `mouth_round`, `mouth_wide`.
Why these five: `art/layers.json`.

## Commands

Node 22 or newer (`.nvmrc`: 24.15.0). One dependency, `pngjs`, pinned. Part D also uses `exiftool`.

```
npm install
npm run generate -- G1 one generator attempt through Codex CLI's image tool → art/raw/attempts/, logs/codex/
npm run attempt:extract -- G1-01   committed extract art/attempts/G1-01.json + disclosure in art/generations.json
npm run stage1 -- <G1 attempt> <G2 attempt>   regions, partial layers, check and review in out/stage1/
npm run stage2 -- regions G2-01 | calibrate <ids>   regions on the master / calibration run in out/stage2/
npm run measure:master  block size, smile top, outline inner edge of the master
npm run compare:heads -- G2-01 G2-02   chevron colour and drift of empty-screen attempts against the master
npm run metadata       embedded metadata of every raw (EXIF, XMP, PNG chunks, C2PA yes/no); prints only
npm run regions        art/regions.json from the master; -- --freeze once the master is approved
npm run review         out/master-review.png: the master with its measured regions and pivots drawn on it
npm run process        art/raw → art/layers + art/process-log.json
npm run check:layers   the layer table; exit code 1 if a pass/fail check fails
npm run sheet          out/contact-sheet.png and full-size composites in out/composites/
npm run sources        art/SOURCES.json
npm test               everything, on generated test fixtures, plus the checks on the real art
npm run fixtures       make, measure, process and sheet the fixtures (test/fixtures/build/)
```

Add `-- --fixtures` to `regions`, `review`, `process`, `check:layers` or `sheet` to run them on the fixtures, and
`-- --partial` to `process` or `check:layers` to handle only the layers whose raw is in (the master and
`02-head.png` are required).

## Known limitation: the glow layer is faint

The head silhouette (threshold 48) keeps the brightest part of the halo around the outline, so the glow layer holds
only the faint outer band: alpha up to 33 (art/layers/glow.png, 38972 pixels with alpha above 0). The author accepted
this. A glow pulse would need new processing or drawing the glow in code.

## How the layers are cut

1. The canvas is the master's pixel size. Every raw must have exactly that size; nothing is resampled. Transparency,
   if any, is composited on black (logged).
2. `npm run regions` measures the master against the empty screen (`02-head.png`): the screen box, the red cursor,
   the two eyes, the mouth. Each region is a measured box plus a margin, by the rules in `art/layers.json`. Once the
   author approves the master the file is frozen; a variant that does not fit its region is a failed generation.
3. Every variant is aligned to the master by the integer shift that best matches it outside the feature it changes,
   and shifted by that before anything is extracted. The shift is logged in `art/process-log.json`
   (`raws[].offset` and a `translate` step), together with the colour difference left over (drift).
4. `head`: the largest shape in the empty-screen image after removing the dark background connected to the image
   border. `glow`: everything outside it, with alpha from brightness.
5. Each feature: pixels inside its region where the image differs from the empty screen, colour from the image,
   alpha from the size of the difference. Pixels lit in the empty screen (the chevron) are head, never feature. The
   cursor is cut from the master's red pixels only.
6. Mouth anchors: every mouth's top edge is measured, and anchorDy = the smile's top edge minus it goes into the
   process log (`mouthAnchors`). Composites, the contact sheet and the rig draw each mouth moved down by anchorDy;
   the layers themselves are not changed. Keeping the smile's top edge is a rig rule, not a generator rule.

## Step 2: the rig

```
rig/rig.json          layers, parents, z, pivots, regions, mouth anchors, browsRest, the stage, pose limits (npm run rig)
lib/rig.mjs           pose -> draw list (pure, no imports; runs in Node and in the browser)
rig/adapter.js        paints a draw list on a canvas inside a HyperFrames composition; debug skeleton overlay
rig/preview/          the HyperFrames project (hyperframes@0.8.134, pinned like the episodes pipeline)
```

```
npm run rig                              rig/rig.json
npm run preview:build -- pose-sheet      write rig/preview/ for a sequence: pose-sheet | clip | reconstruction
(cd rig/preview && npx --yes hyperframes@0.8.134 render --format png-sequence -o ../../out/render/<name>)
npm run pose-sheet                       out/pose-sheet.png from the pose-sheet render
npm run frame-hashes -- out/render/clip-1 out/render/clip-2
npm run reconstruction                   neutral pose without brows against the master
npm run stage:renders                    every render above, the liveness and emotions clips and the face stream clip
```

Every render and the webcam page draw on one stage of 1600 x 1600 pixels with the 1254 x 1254 art centred on it
(`rig.json` stage, author's prompt #16); that room lets the head tilt up to ±12 degrees and shift ±30 px.

A pose is `{ head: { tilt, x, y }, eyes, brows: { dy } | "hidden", mouth, cursor, glow }`; every field is required
and anything outside `rig.json` limits is rejected. The draw list gives, per drawn layer in z order, its file, own
offset (mouth anchorDy, brows dy), the head's rotation and centre (art pixels), the translation (the head's shift plus
the art's place on the stage), and opacity. The adapter draws `translate + rotate(p + offset)`; the rotation is done
by the canvas, not by the rig.

## Step 3: liveness

```
rig/liveness.json     chosen blink, breathing, micro drift and cursor values, each with why
lib/liveness.mjs      livenessAt(config, seed, frame, fps) -> partial pose; same answer whatever was asked before
lib/pose.mjs          combine(rig, base, ...partials): head adds up, eyes closed and cursor off win, limits checked
```

```
npm run preview:build -- liveness --seed 1        10 s at 30 fps, rendered like the other sequences
npm run liveness:report -- --seed 1 --seconds 60  numbers and out/liveness-timeline.png
npm run liveness:strip -- --seed 1                out/liveness-strip.png, one blink from the render
```

## Step 4: voice and lip sync v1

Ping's voice is River (ElevenLabs library) with the "stronger" filter chain, chosen by the author (prompt #16).

```
audio/voice.json            the chosen voice, the processing (chain, gain rule, encode), model, settings, phrases
audio/raw/                  P1-P3 exactly as ElevenLabs returned them, and their alignment (.align.json)
audio/dev/                  P1-P3 processed: what every render uses (npm run audio:process)
audio/process-log.json      per processed file: ffmpeg version, chain, gain, RMS raw and processed, peaks, time lag
audio/SOURCES.json          per raw file: voice, model, settings, server date, text, sha256, duration, sample rate;
                            per processed file: how it was made
*.metadata.txt              exiftool dump next to every committed mp3 (npm run audio:metadata)
rig/lipsync-volume.json     chosen loudness thresholds
lib/lipsync-volume.mjs      samples -> one mouth per frame (rest, small, open); naive on purpose
```

```
npm run voice -- phrases | final-check   ElevenLabs (key read like the episodes pipeline; never written)
npm run audio:process                     audio/raw/ -> audio/dev/: decode, chain, RMS gain, one mp3 encode
npm run audio:metadata                    metadata dumps; committed audio must show the encoder tag only
npm run decode -- audio/dev/P1.mp3 ...    ffmpeg decode, logged in audio/decode-log.json
npm run lipsync:stats                     RMS percentiles of the development phrases
npm run lipsync:clips -- --seed 1         out/lipsync-v1/P<n>.mp4: HyperFrames render, audio muxed with ffmpeg (copy)
npm run lipsync:report -- P1 P2 P3 --chart P2
```

## Step 5: lip sync v2 (character timings)

Input: the character alignment ElevenLabs returns with the audio (`audio/raw/P<n>.align.json`; it belongs to the raw
audio): **letters with start and end times, not phonemes**. `rig/lipsync-text.json` maps letters, a few letter pairs, y, the silent final e and the
pronoun I to five mouths, says which mouth wins when two letters share a frame, and holds every mouth for at least
2 frames. `lib/lipsync-text.mjs` applies it. Two rules were changed by the author after seeing output (prompt #16:
y as a word's only vowel is open; ou and ow go open then round); the file says so, and `lipsync:compare` shows v2
before and after the change on the same audio.

```
npm run lipsync:clips -- --seed 1 --method v2       out/lipsync-v2/P<n>.mp4
npm run lipsync:compare                             closure score, run table, words.txt, P2 chart, side-by-side clips
```

## Step 6: emotions

`rig/emotions.json` holds four states besides neutral (happy, surprised, focused, sleepy), each a partial pose made
of what the face has. `lib/emotions.mjs` eases between marks (smootherstep over `transitionFrames`); it goes into
`combine()` after liveness, and lip sync after it, so while Ping speaks the speech mouth wins and outside speech the
emotion's mouth shows. Marks come from tags in the script text: `lib/script-tags.mjs` turns
"Hello. [happy] I am Ping." into clean text plus marks at the tagged character's start frame.

```
npm run preview:build -- emotions --seed 1    the 10 s walk-through (rig/emotions.json demoMarks)
npm run preview:build -- emotions-sheet       then render and node scripts/emotions-sheet.mjs
```

## Step 7: the webcam page — NOT VERIFIED WITH A REAL CAMERA

Nothing here has ever seen a real camera or a real face. It was built and tested overnight with the camera request
stubbed out (a synthetic canvas stream) and a face stream made by code.

```
npm run web:vendor      copy the pinned @mediapipe/tasks-vision 1.1.0 files and fetch the model (sha256 checked)
npm run web:serve       http://127.0.0.1:8317/web/index.html
npm run face:stream -- --seed 1     a synthetic face stream through lib/face-to-pose.mjs
```

- `web/privacy.js` runs first: the video can only reach the detector through one hand-off call; drawImage,
  texImage, createImageBitmap, attaching the video, MediaRecorder and captureStream refuse it; after the page is ready
  every network API refuses. `web/worker-privacy.js` does the same inside the detector worker once the model has
  loaded (fetch, XMLHttpRequest, WebSocket, EventSource, WebTransport, importScripts, nested workers,
  OffscreenCanvas convertToBlob). `test/web.test.mjs` checks this in headless Chrome, from the page and from inside the
  worker, and that the server sees no request after ready.
- MediaPipe Face Landmarker runs in a module worker (`web/detector-worker.js`, CPU delegate); the main thread gets
  numbers only. Its timestamps are the video's own frame times (requestVideoFrameCallback, mediaTime): a frame that
  arrives while the detector is busy is skipped and the clock keeps real time; no frame is sent twice. Browsers
  without it fall back to frame count / 30; the page says which is in use. `lib/face-to-pose.mjs` turns them into a pose with the chosen values in `rig/face.json`.
- Model: `face_landmarker.task` from
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task,
  sha256 and licence in `web/VENDOR.json`.

Before the page is published: `PUBLISH-CHECKLIST.md` (the real-camera checks and the model licence).

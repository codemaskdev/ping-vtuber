# Ping VTuber

Ping is an original terminal-face character based on the CodeMask channel logo, built on camera for CodeMask
episode 3: a VTuber made with AI. Character art comes from a text-to-image generator, animation from HyperFrames
(later steps), and all code is in this repository. No Live2D and no VTuber apps. Rules: `CLAUDE.md`.

## Step 1: Ping's layers

```
art/reference/logo-5A.svg    the channel logo; logo-5A.png is the copy given to the generator
art/GENERATOR_PROMPTS.md     prompts G1…G8, run by hand in this order
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
   alpha from the size of the difference.

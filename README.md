# Ping VTuber

Ping is an original terminal-face character based on the CodeMask channel logo, built on camera for CodeMask
episode 3: a VTuber made with AI. Character art comes from a text-to-image generator, animation from HyperFrames
(later steps), and all code is in this repository. No Live2D and no VTuber apps. Rules: `CLAUDE.md`.

## Step 1: Ping's layers

```
art/reference/logo-5A.svg    the channel logo (attach a PNG of it to the generator)
art/GENERATOR_PROMPTS.md     prompts G1…G7, run by hand in this order
art/raw/                     the generator's images, untouched
art/generations.json         generator name, version, date and prompt per image
art/layers.json              the layer spec: canvas, regions, parents, pivots, thresholds
art/layers/                  one transparent full-canvas PNG per layer (made by npm run process)
art/process-log.json         every automatic step applied, with its numbers
art/SOURCES.json             sha256 of every reference, raw and processed file, with its provenance
out/contact-sheet.png        all layers and mouth composites (not committed)
```

Layers, back to front: `glow`, `head`, `eyes_open` / `eyes_closed`, `brows`, and one of five mouths:
`mouth_rest` (silence, M B P, also F V), `mouth_small`, `mouth_open`, `mouth_round`, `mouth_wide`.
Why these five: `art/layers.json`.

## Commands

Node 22 or newer (`.nvmrc`: 24.15.0). One dependency, `pngjs`, pinned.

```
npm install
npm run process        art/raw → art/layers + art/process-log.json
npm run check:layers   the layer table; exit code 1 if any layer fails
npm run sheet          out/contact-sheet.png
npm run sources        art/SOURCES.json
npm test               everything, on generated test fixtures
npm run fixtures       make, process and sheet the fixtures (test/fixtures/build/)
```

Add `-- --fixtures` to `process`, `check:layers` or `sheet` to run them on the fixtures.

## How the layers are cut

1. Each raw image is composited on black if it has transparency, must be square, and is resampled to the canvas
   if its size differs.
2. Every variant is aligned to the master: the integer shift that best matches the master outside the feature the
   variant changes. The shift and the remaining colour difference (drift) are logged.
3. `head`: the largest shape in the empty-screen image (`02-head.png`) after removing the dark background connected
   to the image border. `glow`: everything outside it, with alpha from brightness.
4. Each feature: pixels inside its region where the image differs from the empty screen, colour from the image,
   alpha from the size of the difference.

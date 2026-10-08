# Generator prompts

Run these in order, all in **one chat** of the text-to-image generator. G1 makes the master from the reference logo;
every later prompt is an edit of that master and changes one feature only. Download each result as PNG, at the
generator's full size, and save it under the exact name given. Do not crop, resize or touch the files: processing is
done by `npm run process`.

For each image, note the generator name and version exactly as its UI shows them, and the date. Those go into
`art/generations.json` together with the prompt id (G1…G7).

If the generator ignores "edit the master" and edits the latest image instead, open a new chat, attach
`art/raw/01-master.png` and run the edit prompt there; say so when you report back, so it is logged.

Layout the prompts aim for (canvas 1254 × 1254 in `art/layers.json`; the generator's own pixel size may differ,
processing resamples square images to the canvas): the screen is centred and about 70 % of the image wide; brows in
the upper part of the screen, eyes just above its middle, mouth in the lower third.

## G1 · master

Save as: `art/raw/01-master.png`
Attach: `art/reference/logo-5A.png`

```text
Create an original mascot character called Ping, based on the attached logo. Use the logo for the shape language, the neon colour and the line style; do not copy any text from it.

Ping is a head only: a friendly computer terminal screen with a face. No body, no neck, no stand, no cables, no keyboard, no antenna, no hands.

Canvas and framing: square 1:1 image. Pure flat black background (#000000) everywhere outside the character: no gradient, no vignette, no texture, no stars, no particles, no code symbols, no decorations, no text, no logo, no watermark, no border. Front view, perfectly straight, not tilted, no perspective. The head is centred horizontally and vertically and is about 70% of the image width; leave at least 10% empty black margin on every side.

Head: a rounded-rectangle screen, a little wider than tall, with one continuous, unbroken, closed neon outline around its outer edge, in the neon cyan of the logo. The inside of the screen is flat, solid, very dark navy-black, with no scanlines, no reflections, no gradient and no texture. A soft cyan glow surrounds the outer outline and fades to pure black well before the image edges.

Face, drawn on the screen as glowing flat neon cyan shapes, nothing else on the screen:
- Eyes: two identical upright rounded rectangles, like text-cursor blocks, side by side, open, looking straight ahead, just above the middle of the screen.
- Brows: one short straight horizontal bar above each eye, level and neutral, as wide as the eye, separated from the eye by a clear dark gap.
- Mouth: closed, at rest: one short straight horizontal line, centred below the eyes in the lower third of the screen, about one third of the screen's width.
No face shape touches another shape or the outline.

Style: flat vector-like neon on dark, thick clean shapes, high contrast, no shading, no highlights, no 3D, simple enough to stay readable at 64 x 64 pixels. Ping is an original character: not any existing character, mascot, brand or real person.
```

## G2 · head (empty screen)

Save as: `art/raw/02-head.png`

This is the one edit that changes more than one shape: the face as a whole is the feature, because the head layer
is the screen with nothing on it.

```text
Edit the master image (the first image of Ping in this chat), not the most recent one. Keep everything else exactly as it is: the same square canvas and pixel size, the same framing, the same size and position of the head, the same outline, the same colours, the same glow, the same pure black background.

Change only this: remove the whole face. Both eyes, both brows and the mouth are gone, and the screen is completely empty: flat, solid, very dark navy-black, with no shapes, no marks, no text and no reflections. Do not add anything.
```

## G3 · eyes closed

Save as: `art/raw/03-eyes_closed.png`

```text
Edit the master image (the first image of Ping in this chat), not the most recent one. Keep everything else exactly as it is: the same square canvas and pixel size, the same framing, the same size and position of the head, the same brows, the same mouth, the same outline, the same colours, the same glow, the same pure black background.

Change only the eyes: close both of them. Each closed eye is one short straight horizontal neon cyan line, as wide as the open eye was, at the same horizontal position and at the vertical centre of where the open eye was. The brows do not move.
```

## G4 · mouth small open

Save as: `art/raw/04-mouth_small.png`

```text
Edit the master image (the first image of Ping in this chat), not the most recent one. Keep everything else exactly as it is: the same square canvas and pixel size, the same framing, the same size and position of the head, the same eyes, the same brows, the same outline, the same colours, the same glow, the same pure black background.

Change only the mouth: open it slightly. The mouth becomes a neon cyan outline of a flat rounded rectangle, dark inside, as wide as the closed mouth line and about one quarter as tall as it is wide, centred exactly where the closed mouth line was.
```

## G5 · mouth wide open

Save as: `art/raw/05-mouth_open.png`

```text
Edit the master image (the first image of Ping in this chat), not the most recent one. Keep everything else exactly as it is: the same square canvas and pixel size, the same framing, the same size and position of the head, the same eyes, the same brows, the same outline, the same colours, the same glow, the same pure black background.

Change only the mouth: open it wide, as if saying "ah". The mouth becomes a neon cyan outline of a tall rounded rectangle, dark inside, as wide as the closed mouth line and about two thirds as tall as it is wide, centred exactly where the closed mouth line was. It stays inside the screen and does not touch the eyes or the outline.
```

## G6 · mouth round

Save as: `art/raw/06-mouth_round.png`

```text
Edit the master image (the first image of Ping in this chat), not the most recent one. Keep everything else exactly as it is: the same square canvas and pixel size, the same framing, the same size and position of the head, the same eyes, the same brows, the same outline, the same colours, the same glow, the same pure black background.

Change only the mouth: make it round, as if saying "oo". The mouth becomes a neon cyan ring, dark inside, about half as wide as the closed mouth line and as tall as it is wide, centred exactly where the closed mouth line was.
```

## G7 · mouth wide

Save as: `art/raw/07-mouth_wide.png`

```text
Edit the master image (the first image of Ping in this chat), not the most recent one. Keep everything else exactly as it is: the same square canvas and pixel size, the same framing, the same size and position of the head, the same eyes, the same brows, the same outline, the same colours, the same glow, the same pure black background.

Change only the mouth: spread it wide, as if saying "ee". The mouth becomes a neon cyan outline of a long, flat rounded rectangle, dark inside, one and a half times as wide as the closed mouth line and about one fifth as tall as it is wide, with its two ends turned slightly up, centred exactly where the closed mouth line was. It stays inside the screen.
```

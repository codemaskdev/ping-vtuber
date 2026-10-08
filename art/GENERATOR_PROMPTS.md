# Generator prompts

Run by `npm run generate -- G<n>` (`scripts/generate.mjs`) through Codex CLI's built-in image tool, one fresh
session per call, the text below put byte for byte into the fixed wrapper in `lib/attempts.mjs`. G1 makes the
master from the reference logo; every later prompt is an edit of the master and changes one thing only. The script
attaches `art/reference/logo-5A.png` to G1 and `art/raw/01-master.png` to G2 to G8, and copies each result,
unmodified, to `art/raw/attempts/<id>.png`. The author chooses between attempts and promotes one to the file name
given under each prompt. Every raw must have exactly the master's pixel size.

Disclosure per attempt (`art/generations.json`, `art/attempts/<id>.json`): Codex CLI version, the session's model,
the image tool, the image model where something reports it, the prompt as passed to the tool, date, pixel size.

What the prompts aim for, from the logo: a square screen, centred, 70 % of the image wide; the prompt chevron and the
red cursor in its top-left corner; the eyes just below the middle; the pixel-block smile in the lower third. Only the
screen's outer outline glows; the face shapes and the cursor have crisp edges. A "pixel block" is the square unit
the logo's smile is built from. Every mouth keeps the closed smile's top edge and opens downward, so the mouth never
moves up towards the eyes. Regions are measured on the approved master (`npm run regions`) and then frozen.

## G1 · master

Save as: `art/raw/01-master.png`
Attach: `art/reference/logo-5A.png`

```text
Turn the attached logo into an original mascot character called Ping. Keep the logo's design: the same square screen with rounded corners, the same thin neon cyan outline, the same very dark navy-black screen, the same small terminal prompt in the top-left corner of the screen (a dim cyan ">" chevron followed by a small solid coral-red cursor block), the same two eye shapes and the same pixel-block smile, in the same places on the screen. No eyebrows. Do not copy any text.

Ping is a head only: this screen with a face. No body, no neck, no stand, no cables, no keyboard, no antenna, no hands.

Canvas and framing: square 1:1 image. Pure flat black background (#000000) everywhere outside the character: no gradient, no vignette, no texture, no stars, no particles, no code symbols, no decorations, no text, no logo, no watermark, no border. Front view, perfectly straight, not tilted, no perspective. The screen is centred horizontally and vertically and is 70% of the image width; leave 15% empty black margin on every side.

Screen: one continuous, unbroken, closed neon cyan outline around its outer edge. The inside of the screen is flat, solid, very dark navy-black, with no scanlines, no reflections, no gradient and no texture. Only this outer outline glows: a soft cyan glow surrounds it on the outside and fades to pure black well before the image edges.

Face, as flat solid neon cyan shapes with crisp, sharp edges and no glow or halo around them:
- Eyes: the logo's two eyes, solid four-sided shapes that mirror each other, flat at the bottom, their top edges sloping down toward the middle of the face, just below the middle of the screen.
- Mouth: the logo's closed smile, built from square pixel blocks: a flat bar with one block raised at each end, centred below the eyes, in the lower third of the screen.
The red cursor block also has crisp edges and no glow. No face shape touches another shape, the prompt or the outline.

Style: flat vector-like neon on dark, clean shapes, high contrast, no shading, no highlights, no 3D, simple enough to stay readable at 64 x 64 pixels. Ping is an original character: not any existing character, mascot, brand or real person.
```

## G2 · head (empty screen)

Save as: `art/raw/02-head.png`

This edit removes the whole face and the cursor at once: the head layer is the screen with only the chevron on it.

```text
Edit the attached image. Keep everything else exactly as it is: the same square canvas and pixel size, the same framing, the same size and position of the screen, the same outline, the same dim cyan ">" chevron in the top-left corner, the same colours, the same glow, the same pure black background.

Change only this: remove both eyes, the mouth and the red cursor block. The rest of the screen is empty: flat, solid, very dark navy-black, with no shapes, no marks, no text and no reflections. Keep the ">" chevron. Do not add anything.
```

## G3 · brows

Save as: `art/raw/03-brows.png`

```text
Edit the attached image. Keep everything else exactly as it is: the same square canvas and pixel size, the same framing, the same size and position of the screen, the same chevron and red cursor, the same eyes, the same mouth, the same outline, the same colours, the same glow, the same pure black background.

Change only this: add two eyebrows. Each is one thin, straight, level neon cyan bar, half a pixel block tall, as wide as the eye below it, with a clear dark gap of one pixel block between the brow and the highest point of its eye. The brows are neutral, not angled, and stay well below the red cursor. Crisp edges, no glow or halo.
```

## G4 · eyes closed

Save as: `art/raw/04-eyes_closed.png`

```text
Edit the attached image. Keep everything else exactly as it is: the same square canvas and pixel size, the same framing, the same size and position of the screen, the same chevron and red cursor, the same mouth, the same outline, the same colours, the same glow, the same pure black background.

Change only the eyes: close both of them. Each closed eye is one short, straight, horizontal neon cyan bar, one pixel block tall, as wide as the open eye was, lying along the flat bottom edge of where the open eye was. Crisp edges, no glow or halo.
```

## G5 · mouth small open

Save as: `art/raw/05-mouth_small.png`

```text
Edit the attached image. Keep everything else exactly as it is: the same square canvas and pixel size, the same framing, the same size and position of the screen, the same chevron and red cursor, the same eyes, the same outline, the same colours, the same glow, the same pure black background.

Change only the mouth: open it slightly. The mouth becomes a hollow rectangle whose outline is one pixel block thick, built from the same square pixel blocks as the closed smile: as wide as the closed smile and 3 blocks tall, so the dark inside is one block tall. Its top edge is where the top of the closed smile was, it opens downward, and it is centred horizontally where the closed smile was. Crisp edges, no glow or halo.
```

## G6 · mouth wide open

Save as: `art/raw/06-mouth_open.png`

```text
Edit the attached image. Keep everything else exactly as it is: the same square canvas and pixel size, the same framing, the same size and position of the screen, the same chevron and red cursor, the same eyes, the same outline, the same colours, the same glow, the same pure black background.

Change only the mouth: open it wide, as if saying "ah". The mouth becomes a hollow rectangle whose outline is one pixel block thick, built from the same square pixel blocks as the closed smile: as wide as the closed smile and 5 blocks tall, so the dark inside is 4 blocks wide and 3 blocks tall. Its top edge is where the top of the closed smile was, it opens downward, and it is centred horizontally where the closed smile was. It stays inside the screen. Crisp edges, no glow or halo.
```

## G7 · mouth round

Save as: `art/raw/07-mouth_round.png`

```text
Edit the attached image. Keep everything else exactly as it is: the same square canvas and pixel size, the same framing, the same size and position of the screen, the same chevron and red cursor, the same eyes, the same outline, the same colours, the same glow, the same pure black background.

Change only the mouth: make it round, as if saying "oo". The mouth becomes a pixel ring whose outline is one pixel block thick, built from the same square pixel blocks as the closed smile: 4 blocks wide and 4 blocks tall with the four corner blocks left out, so the dark inside is 2 by 2 blocks. Its top edge is where the top of the closed smile was, it opens downward, and it is centred horizontally where the closed smile was. Crisp edges, no glow or halo.
```

## G8 · mouth wide

Save as: `art/raw/08-mouth_wide.png`

```text
Edit the attached image. Keep everything else exactly as it is: the same square canvas and pixel size, the same framing, the same size and position of the screen, the same chevron and red cursor, the same eyes, the same outline, the same colours, the same glow, the same pure black background.

Change only the mouth: spread it wide, as if saying "ee". The mouth becomes a long, flat hollow rectangle whose outline is one pixel block thick, built from the same square pixel blocks as the closed smile: one and a half times as wide as the closed smile and 3 blocks tall, so the dark inside is one block tall. Its top edge is where the top of the closed smile was, and it is centred horizontally where the closed smile was. It stays inside the screen. Crisp edges, no glow or halo.
```

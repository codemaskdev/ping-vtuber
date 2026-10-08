# Generator prompts

Run these in order, all in **one chat** of the text-to-image generator. G1 makes the master from the reference logo;
every later prompt is an edit of that master and changes one feature only. Download each result as PNG, at the
generator's full size, and save it under the exact name given. Do not crop, resize or touch the files: processing is
done by `npm run process`.

For each image, note the generator name and version exactly as its UI shows them, and the date. Those go into
`art/generations.json` together with the prompt id (G1…G7).

If the generator ignores "edit the master" and edits the latest image instead, open a new chat, attach
`art/raw/01-master.png` and run the edit prompt there; say so when you report back, so it is logged.

The reference is the channel logo, `art/reference/logo-5A.svg` (64 x 64). Most generators do not accept SVG uploads;
attach it as `art/reference/logo-5A.png`.

Layout the prompts aim for, from the logo (canvas 1254 x 1254 in `art/layers.json`; processing resamples square
images to the canvas): the square screen is centred and 70 % of the image wide (x and y 188…1066); the prompt
chevron and red cursor in its top-left corner; brows just above the eyes (y 380…505); eyes y 505…705; mouth
y 705…1000.

## G1 · master

Save as: `art/raw/01-master.png`
Attach: `art/reference/logo-5A.png`

```text
Turn the attached logo into an original mascot character called Ping. Keep the logo's design: the same square screen with rounded corners, the same thin neon cyan outline, the same very dark navy-black screen, the same small terminal prompt in the top-left corner of the screen (a dim cyan ">" chevron followed by a small solid coral-red cursor block), the same two eye shapes and the same pixel-block smile, in the same places on the screen. Do not copy any text.

Ping is a head only: this screen with a face. No body, no neck, no stand, no cables, no keyboard, no antenna, no hands.

Canvas and framing: square 1:1 image. Pure flat black background (#000000) everywhere outside the character: no gradient, no vignette, no texture, no stars, no particles, no code symbols, no decorations, no text, no logo, no watermark, no border. Front view, perfectly straight, not tilted, no perspective. The screen is centred horizontally and vertically and is 70% of the image width; leave 15% empty black margin on every side.

Screen: one continuous, unbroken, closed neon cyan outline around its outer edge. The inside of the screen is flat, solid, very dark navy-black, with no scanlines, no reflections, no gradient and no texture. A soft cyan glow surrounds the outer outline and fades to pure black well before the image edges.

Face, as flat glowing neon cyan shapes on the screen:
- Eyes: the logo's two eyes, solid four-sided shapes that mirror each other, flat at the bottom, their top edges sloping down toward the middle of the face, just below the middle of the screen.
- Brows: add one short, thin, straight, level bar above each eye, as wide as the eye, separated from the eye by a clear dark gap. They are neutral: not angled.
- Mouth: the logo's closed smile, built from square pixel blocks: a short flat bar with one block raised at each end, centred below the eyes, in the lower third of the screen.
No face shape touches another shape, the prompt or the outline.

Style: flat vector-like neon on dark, clean shapes, high contrast, no shading, no highlights, no 3D, simple enough to stay readable at 64 x 64 pixels. Ping is an original character: not any existing character, mascot, brand or real person.
```

## G2 · head (empty screen)

Save as: `art/raw/02-head.png`

This is the one edit that changes more than one shape: the face as a whole is the feature, because the head layer
is the screen with nothing on it.

```text
Edit the master image (the first image of Ping in this chat), not the most recent one. Keep everything else exactly as it is: the same square canvas and pixel size, the same framing, the same size and position of the screen, the same outline, the same prompt chevron and red cursor in the top-left corner, the same colours, the same glow, the same pure black background.

Change only this: remove the whole face. Both eyes, both brows and the mouth are gone, and the rest of the screen is empty: flat, solid, very dark navy-black, with no shapes, no marks, no text and no reflections. Keep the prompt chevron and the red cursor. Do not add anything.
```

## G3 · eyes closed

Save as: `art/raw/03-eyes_closed.png`

```text
Edit the master image (the first image of Ping in this chat), not the most recent one. Keep everything else exactly as it is: the same square canvas and pixel size, the same framing, the same size and position of the screen, the same prompt and cursor, the same brows, the same mouth, the same outline, the same colours, the same glow, the same pure black background.

Change only the eyes: close both of them. Each closed eye is one short, straight, horizontal neon cyan bar, as wide as the open eye was, lying where the flat bottom edge of the open eye was. The brows do not move.
```

## G4 · mouth small open

Save as: `art/raw/04-mouth_small.png`

```text
Edit the master image (the first image of Ping in this chat), not the most recent one. Keep everything else exactly as it is: the same square canvas and pixel size, the same framing, the same size and position of the screen, the same prompt and cursor, the same eyes, the same brows, the same outline, the same colours, the same glow, the same pure black background.

Change only the mouth: open it slightly. The mouth becomes a hollow rectangle built from the same square pixel blocks as the closed smile, dark inside, as wide as the closed smile and about one quarter as tall as it is wide, centred exactly where the closed smile was.
```

## G5 · mouth wide open

Save as: `art/raw/05-mouth_open.png`

```text
Edit the master image (the first image of Ping in this chat), not the most recent one. Keep everything else exactly as it is: the same square canvas and pixel size, the same framing, the same size and position of the screen, the same prompt and cursor, the same eyes, the same brows, the same outline, the same colours, the same glow, the same pure black background.

Change only the mouth: open it wide, as if saying "ah". The mouth becomes a tall hollow rectangle built from the same square pixel blocks as the closed smile, dark inside, as wide as the closed smile and about two thirds as tall as it is wide, centred exactly where the closed smile was. It stays inside the screen and does not touch the eyes or the outline.
```

## G6 · mouth round

Save as: `art/raw/06-mouth_round.png`

```text
Edit the master image (the first image of Ping in this chat), not the most recent one. Keep everything else exactly as it is: the same square canvas and pixel size, the same framing, the same size and position of the screen, the same prompt and cursor, the same eyes, the same brows, the same outline, the same colours, the same glow, the same pure black background.

Change only the mouth: make it round, as if saying "oo". The mouth becomes a small hollow ring built from the same square pixel blocks as the closed smile, dark inside, about half as wide as the closed smile and as tall as it is wide, centred exactly where the closed smile was.
```

## G7 · mouth wide

Save as: `art/raw/07-mouth_wide.png`

```text
Edit the master image (the first image of Ping in this chat), not the most recent one. Keep everything else exactly as it is: the same square canvas and pixel size, the same framing, the same size and position of the screen, the same prompt and cursor, the same eyes, the same brows, the same outline, the same colours, the same glow, the same pure black background.

Change only the mouth: spread it wide, as if saying "ee". The mouth becomes a long, flat hollow rectangle built from the same square pixel blocks as the closed smile, dark inside, one and a half times as wide as the closed smile and about one fifth as tall as it is wide, with one block raised at each end like the closed smile, centred exactly where the closed smile was. It stays inside the screen.
```

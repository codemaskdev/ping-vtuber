# Before the webcam page is published

Tick an item only after doing it, and write in DEVLOG.md who did it and what was
seen.

## Licence (author's prompt #16)

- [x] Check the licence of the model in `web/models/face_landmarker.task` against its model card(s). Done by Claude on
      2026-10-09 (prompt #20), nothing published. The Face Landmarker page,
      https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker (Models section), lists three
      models in the bundle, each with a model card; every card says "LICENSED UNDER Apache License, Version 2.0":
      - face detector, BlazeFace short range, model date June 9, 2021:
        https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20(Short%20Range).pdf
      - face mesh, Face Mesh V2, model date September 15, 2022:
        https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf
      - blendshapes, Blendshape V2, model date November 11, 2022:
        https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf
      The sha256 of each PDF as read is in `web/VENDOR.json` (model.modelCards). Not checked: the cards do not name
      the file `face_landmarker.task` (float16/1); that they cover it rests on the documentation page. The page's own
      text is CC BY 4.0 and its code samples Apache 2.0 (its footer), which is about the page, not the model.
      Also in the cards, for the person who tunes `rig/face.json`: the Face Mesh V2 card lists as a limitation faces
      "inclined from the vertical orientation (more than 8°)"; the BlazeFace card asks for roll and pitch within
      45 degrees. Out-of-scope in the Face Mesh V2 and Blendshape V2 cards: "human life-critical decisions".
- [ ] `npm run web:vendor` on a clean checkout: every file's sha256 matches `web/VENDOR.json`. The wasm files and the
      model stay out of git (author's prompt #16).

## Real camera (the page is checked by eye by the author on 2026-10-09, no measurements)

The author's check on 2026-10-09, by eye, with no numbers: the page opens, no camera picture is shown, Ping follows
the head, eyes, mouth and brows. The items below that need DevTools, the console or numbers were not part of it and
stay open.

1. [ ] `npm install`, `npm run web:vendor`, `npm run web:serve`; open http://127.0.0.1:8317/web/index.html in Chrome;
       press **Start camera** and allow it.
2. [ ] No camera picture appears anywhere on the page. DevTools → Elements: no `<video>` element.
3. [ ] DevTools → Network: after the status says "ready", no request at all while the camera runs (the page and the
       detector worker).
4. [ ] Console: no errors, no "privacy: … refused" message during normal use.
5. [ ] Head tilt: Ping tilts the same way as your mirror image; it saturates at ±12 degrees (`rig/face.json` tiltGain
       0.6: a 20 degree roll reaches the limit).
6. [ ] Head shift left/right/up/down moves Ping the same way, about 3 px per cm.
7. [ ] Blinks: closing your eyes closes Ping's; a half-closed squint does not flicker them (hysteresis 0.55 / 0.35).
8. [ ] Mouth: open jaw → open; "oo" → round; a closed smile → wide; talking → small/open; relaxed → rest.
9. [ ] Brows: raising them shows Ping's brows high; frowning shows them low; relaxing hides them.
10. [ ] The landmark points on the second canvas sit on your face's shape (mirrored or not: note which).
11. [ ] Frames per second (`window.__pingFrames` over ten seconds), how many video frames were skipped because the
        detector was busy (`window.__pingBusySkips` against `window.__pingTicks`) or had no later time
        (`window.__pingRepeatSkips`), which timestamps the page says it uses (`window.__pingTimestamps`, the line under
        the status), and the CPU load.
12. [ ] What happens when your face leaves the frame and comes back.

Every number in `rig/face.json` is a first guess to be tuned from this.

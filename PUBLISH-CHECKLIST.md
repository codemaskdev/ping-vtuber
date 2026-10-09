# Before the webcam page is published

Nothing on this list is done yet. Tick an item only after doing it, and write in DEVLOG.md who did it and what was
seen.

## Licence (author's prompt #16)

- [ ] Check the licence of the model in `web/models/face_landmarker.task` against its model card(s). The file bundles
      the face detector, the face mesh and the blendshape models; `web/VENDOR.json` records the licence as stated by
      the MediaPipe documentation only, not as checked against the model cards. Record the cards read and the
      licence found in `web/VENDOR.json`.
- [ ] `npm run web:vendor` on a clean checkout: every file's sha256 matches `web/VENDOR.json`. The wasm files and the
      model stay out of git (author's prompt #16).

## Real camera (the page is NOT VERIFIED WITH A REAL CAMERA)

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
11. [ ] Frames per second (`window.__pingFrames` over ten seconds), how many ticks were skipped because the detector
        was busy (`window.__pingBusySkips` against `window.__pingTicks`), and the CPU load.
12. [ ] What happens when your face leaves the frame and comes back.

Every number in `rig/face.json` is a first guess to be tuned from this.

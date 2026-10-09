# Measuring lip sync

Written before any held-out phrase existed (author's prompt #17), tested on P1–P3 only, and frozen with the commit
that adds it (`rig/frozen.json`). Parameters: `measurement.json`. Code: `lib/measure.mjs` (pure) and
`scripts/measure.mjs` (decoding, report). `npm run measure -- H1 H2 H3 H4` writes `out/measure/`.

## 1. One file per clip

Everything is measured on the finished mp4 of a clip (`out/lipsync-v1/<phrase>.mp4`, `out/lipsync-v2/<phrase>.mp4`):
its video frames and its audio track are decoded from that one file with ffmpeg. Frame times are the decoded frames'
timestamps (ffprobe `best_effort_timestamp_time`, `-fps_mode passthrough`, no frame dropped or repeated); audio
sample n is at the audio stream's start time + n / sample rate. Both streams start at 0 in every clip so far.

The mp3 inside the mp4 is longer than the mp3 decoded on its own (prompt #16, question 4). Found while writing this:
the mp4 carries an edit list that skips the encoder's first 1105 samples, and ffmpeg applies it, so on P1–P3 the
mp4's audio matches the mp3 sample for sample (cross-correlation lag 0, r 0.9999999999999258 to
0.9999999999999791); the extra length is padding at the end, never louder than 0.0000012379792906358489. A player
that ignored the edit list would play the sound 1105 samples (0.02505668934240363 s) late. The measurement uses
what ffmpeg decodes.

## 2. The mouth per frame, from pixels

The mouth is read from the pixels of each frame, not from the draw list. The window is the rig's mouth region
(500 × 294 art pixels, the same for every mouth layer) moved onto the stage by `stage.artOffset`: x 550, y 892 on
the 1600 × 1600 stage. In it, a pixel is "bright" when its green channel is at least 128 (the mouths are the screen's
cyan, green 230; the screen is dark). The bright pixels' bounding box (w, h) is compared with the same box measured
on the art: the head layer with one mouth layer over it, moved by its anchorDy, on black. Templates:

| mouth | w | h | bright pixels |
|---|---|---|---|
| rest | 294 | 97 | 14237 |
| small | 294 | 125 | 23730 |
| open | 281 | 174 | 23911 |
| round | 209 | 209 | 21645 |
| wide | 422 | 101 | 30759 |

The nearest template by |w − w′| + |h − h′| wins; a frame more than 14 px from every template is "unread" (the two
closest templates, rest and small, are 28 px apart). The eyes end at art row 689 and every mouth starts at row 788,
so head motion from liveness (a few px) does not bring the eyes into the window.

Checked on P1–P3, v1 and v2 (6 clips, 392 frames): the pixel mouth equals the draw list's mouth on every frame
(0 disagreements, 0 unread, largest distance to the chosen template 4 px). The draw list's mouths are made again
with the same frozen code from the same audio and alignment, plus the 15 rest frames every clip ends with.

## 3. The acoustic reference: onsets and ends of sound

The CodeMask episodes have `episodes/tools/onsets.mjs`. It runs ffmpeg `silencedetect` (−50 dB, at least 80 ms) on a
scene's voice and uses the silences to move ElevenLabs' word edges: a silence that begins before a word's aligned
start and ends inside the word means the word really starts where the silence ends; one that begins inside a word
and runs past its end means the word really ends where the silence begins. Short silences inside a word (stop
consonants) change nothing. It is written for word cues, not for this, and it needs the alignment.

Here the same idea is written again on the mp4's own audio, without the alignment, so that the window is explicit:

- loudness at time t: the RMS of the samples in [t − 5 ms, t + 5 ms) (**window 10 ms**), every **1 ms** (hop);
- sound: loudness at or above **0.0031622776601683794** (−50 dBFS, the level onsets.mjs uses);
- quiet shorter than **80 ms** (onsets.mjs's minimum) is part of the sound around it; quiet of 80 ms or more is a
  **pause**. The start and the end of the audio are pause edges whatever their length;
- an **onset** is where a sound segment begins, an **end** is where it stops.

Chosen on P1–P3 (v2 clips' audio). These values find one sound segment in P1 (0.09378684807256236 to
0.9777777777777777 s) and in P2 (0.051882086167800455 to 1.8687528344671203 s), and two in P3, split by the only
quiet stretch of 80 ms or more inside any of the three phrases, after "wow." (0.46494331065759636 to
0.5756916099773243 s). "Hello. I" in P1 has no quiet of 80 ms at any of these levels in the processed voice. Looked
at before choosing (segments in s):

| level | min pause | P1 | P2 | P3 |
|---|---|---|---|---|
| −60 dBFS | 50 ms | 0.084–1.001 | 0.051–1.888 | 0.069–0.498, 0.573–1.249 |
| −60 dBFS | 80 ms | 0.084–1.001 | 0.051–1.888 | 0.069–1.249 |
| −50 dBFS | 50 ms | 0.094–0.978 | 0.052–1.869 | 0.071–0.465, 0.576–1.226 |
| −50 dBFS | 80 ms | 0.094–0.978 | 0.052–1.869 | 0.071–0.465, 0.576–1.226 |
| −50 dBFS | 120 ms | 0.094–0.978 | 0.052–1.869 | 0.071–1.226 |
| −40 dBFS | 50 ms | 0.115–0.685, 0.750–0.967 | 0.064–0.383, 0.481–1.373, 1.435–1.810 | 0.073–0.454, 0.578–0.846, 0.901–1.201 |
| −40 dBFS | 80 ms | 0.115–0.967 | 0.064–0.383, 0.481–1.810 | 0.073–0.454, 0.578–1.201 |

(this table is rounded to the ms for reading; the run that produced it printed toFixed(3)). At −40 dBFS the closures
of "am Ping" and "mouth moves" become pauses; at −60 dBFS with 80 ms the echo tail fills the pause after "wow". The
first onsets move by 31, 13 and 4 ms and the last ends by 34, 78 and 48 ms (P1, P2, P3) between −60 and −40 dBFS
at 80 ms, read from the table: that is how much the reference depends on its level.

## 4. Onset offset (ms)

For each pause followed by sound, the sound segment's onset is given a word: the word whose aligned start
(ElevenLabs) is nearest the onset. The alignment only names the word; no aligned time enters an offset. Words that
start with m, b, p, f or v are not measured (the mouth is meant to be closed there).

The mouth's rest in the pause is the last run of rest frames that starts before the pause ends and is still on
screen after the pause starts (frame k is on screen from t_k to t_k + 1/30 s).

**onset offset = (time of the first frame after that rest run, the first frame where the mouth is not rest) −
(acoustic onset).** Positive means the mouth is late.

- Before the first sound of a clip, a mouth that is not rest at frame 0 gives frame 0, flagged: the true value can
  only be that early or earlier.
- If the mouth does not rest in the pause at all, the onset is reported as not measured, with the reason.

## 5. End offset (ms)

For each pause that follows sound (including the end of the audio): **end offset = (time of the first frame of the
mouth's rest in that pause, the first frame from which the mouth stays rest) − (acoustic end).** Not measured if the
mouth does not rest in the pause. Flagged if that rest began before the sound segment's onset.

## 6. Closure score and changes per second

As in step 5, on the pixel mouths: for every m, b, p of the text, is the mouth rest in at least one frame that
overlaps the letter's aligned span? Changes per second, frames per shape, shortest and median run and one-frame runs,
over the frames that start before the end of the mp4's audio.

## 7. Yardsticks (chosen by the author, prompt #17)

- within one frame: |offset| ≤ 33.333333333333336 ms (1000 / 30);
- within 45 ms late and 125 ms early: −125 ≤ offset ≤ 45 ms.

Per version: count, median, largest absolute value, how many within each yardstick, and how many were not measured.
Every single value is reported too.

## What is not independent

- **v1 is made from the same loudness the reference uses.** v1 opens the mouth when a frame's RMS passes 0.01 and the
  reference finds sound at −50 dBFS RMS: both read the same audio's loudness (different windows and thresholds), so
  v1's onset and end offsets are partly measured against themselves.
- **The closure score uses the ElevenLabs letter times v2 is built from.** v2 puts rest on m, b, p from those same
  times, so its closure score checks that it did what it was told, not that the lips meet when the sound does.
- **The resolution is one frame (33.333333333333336 ms).** A mouth can only change at a frame boundary, so every
  offset carries up to one frame from where the onset happens to fall inside a frame.
- The word an onset belongs to is named with the alignment (only to skip m, b, p, f, v).
- The reference itself depends on its level: up to 78 ms for an end between −60 and −40 dBFS on P1–P3 (table
  above).

## P1–P3, the test run (before the method was frozen)

Run with `npm run measure -- P1 P2 P3 --check-drawlist --out P-check`. While writing, the first definitions left two
cases unmeasured that are now measured: a mouth already open at frame 0 (v2 "Hello", "Oh"), and a mouth that opened
for the next word before the pause ended (v1 and v2 "wow" → "We"). The definitions above are the result; the numbers
for P1–P3 are in DEVLOG.md (prompt #17).

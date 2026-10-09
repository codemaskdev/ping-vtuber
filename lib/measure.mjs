// The measurement (MEASUREMENT.md, author's prompt #17). Pure functions, no imports: the caller decodes the mp4.
// Times are seconds on the mp4's own timeline.

// Sound and pauses from loudness. Loudness at time t = RMS of the samples in [t - window/2, t + window/2), taken every
// hop. A time is sound when its loudness is at or above the threshold. A run of quiet shorter than minPause is part of
// the sound around it (a stop consonant); a longer run is a pause. The start and the end of the audio are pause edges
// whatever their length, so the first sound is always an onset and the last sound always an end.
export function soundSegments(samples, sampleRate, { windowS, hopS, threshold, minPauseS }) {
  const half = Math.round((windowS * sampleRate) / 2), hop = Math.round(hopS * sampleRate);
  const loud = [];
  for (let c = 0; c < samples.length; c += hop) {
    const a = Math.max(0, c - half), b = Math.min(samples.length, c + half);
    let sum = 0;
    for (let i = a; i < b; i++) sum += samples[i] * samples[i];
    loud.push(b > a && Math.sqrt(sum / (b - a)) >= threshold);
  }
  const t = (k) => (k * hop) / sampleRate, total = samples.length / sampleRate;
  // Runs of sound, then merge those separated by quiet shorter than minPause.
  const runs = [];
  for (let k = 0; k < loud.length; k++) {
    if (!loud[k]) continue;
    let j = k;
    while (j + 1 < loud.length && loud[j + 1]) j++;
    runs.push({ start: t(k), end: t(j + 1) });
    k = j;
  }
  const segments = [];
  for (const r of runs) {
    const last = segments.at(-1);
    if (last && r.start - last.end < minPauseS) last.end = r.end;
    else segments.push({ ...r });
  }
  for (const s of segments) s.end = Math.min(s.end, total);
  const pauses = [];
  segments.forEach((s, i) => pauses.push({ start: i ? segments[i - 1].end : 0, end: s.start, before: i, leading: i === 0 }));
  if (segments.length) pauses.push({ start: segments.at(-1).end, end: total, before: null, trailing: true });
  return { segments, pauses, duration: total };
}

// Bright pixels of a crop (rgb24): the bounding box and the count of pixels whose green channel is at or above
// `threshold`. Every mouth layer is the screen's cyan; the dark screen is far below it.
export function brightFeatures(rgb, width, height, threshold) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (rgb[(y * width + x) * 3 + 1] < threshold) continue;
    n++;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return n ? { w: x1 - x0 + 1, h: y1 - y0 + 1, n } : { w: 0, h: 0, n: 0 };
}

// The nearest template by |w - w'| + |h - h'|; "unread" when the nearest is farther than maxDistance.
export function classifyMouth(f, templates, maxDistance) {
  let best = null, dist = Infinity;
  for (const [mouth, t] of Object.entries(templates)) {
    const d = Math.abs(f.w - t.w) + Math.abs(f.h - t.h);
    if (d < dist) { dist = d; best = mouth; }
  }
  return { mouth: dist <= maxDistance ? best : "unread", nearest: best, distance: dist };
}

// The word the alignment puts nearest to a time (by the word's first character's start); used only to name the word
// an acoustic onset belongs to, never for a time that is measured.
export function wordsOf(alignment) {
  const ch = alignment.characters, out = [];
  for (let i = 0; i < ch.length; ) {
    if (!/[a-z]/i.test(ch[i])) { i++; continue; }
    let j = i;
    while (j < ch.length && /[a-z]/i.test(ch[j])) j++;
    out.push({ word: ch.slice(i, j).join(""), start: alignment.character_start_times_seconds[i], end: alignment.character_end_times_seconds[j - 1] });
    i = j;
  }
  return out;
}
export function nearestWord(words, time) {
  return words.reduce((a, b) => (Math.abs(b.start - time) < Math.abs(a.start - time) ? b : a));
}

const CLOSED_START = /^[mbpfv]/i;

// Runs of rest frames: [{ first, last }] (frame indices).
function restRuns(frames) {
  const runs = [];
  for (let k = 0; k < frames.length; k++) {
    if (frames[k].mouth !== "rest") continue;
    let j = k;
    while (j + 1 < frames.length && frames[j + 1].mouth === "rest") j++;
    runs.push({ first: k, last: j });
    k = j;
  }
  return runs;
}

// The mouth's rest in a pause [start, end): the last run of rest frames that starts before the pause ends and is
// still shown after the pause starts (a frame k is shown from t_k to t_k + 1/fps). null if the mouth does not rest
// in the pause. Its first frame is where the mouth stopped (the end offset of the sound before the pause); the frame
// after its last is where the mouth opens again (the onset offset of the sound after it).
export function restInPause(frames, pause, fps) {
  const runs = restRuns(frames).filter((r) => frames[r.first].t < pause.end - 1e-9 && frames[r.last].t + 1 / fps > pause.start + 1e-9);
  return runs.at(-1) ?? null;
}

// Onset offsets: for each sound segment after a pause whose word does not start with m, b, p, f or v: the first frame
// after the mouth's rest in the pause at which it is not rest, minus the acoustic onset. Before the first sound of the
// clip a mouth that is not rest at frame 0 gives frame 0 (flagged: the true value can only be earlier).
// End offsets: for each pause after a sound segment: the first frame of the mouth's rest in the pause (from which it
// stays rest until it opens again), minus the acoustic end. ms, positive = the mouth is late.
// frames: [{ t, mouth }] in order. Cases that cannot be measured are kept with a reason and no value.
export function offsets({ segments, pauses }, frames, words, fps) {
  const onsets = [], ends = [];
  for (const p of pauses) {
    const rest = restInPause(frames, p, fps);
    if (p.before !== null) {
      const seg = segments[p.before], word = nearestWord(words, seg.start);
      const e = { word: word.word, onsetS: seg.start, pauseS: [p.start, p.end] };
      if (CLOSED_START.test(word.word)) onsets.push({ ...e, skipped: "starts with m, b, p, f or v" });
      else if (p.leading && frames[0].mouth !== "rest") onsets.push({ ...e, frame: 0, frameS: frames[0].t, mouth: frames[0].mouth, ms: (frames[0].t - seg.start) * 1000, note: "not rest at frame 0: the mouth can only be this early or earlier" });
      else if (!rest) onsets.push({ ...e, skipped: "the mouth does not rest in the pause" });
      else if (rest.last + 1 >= frames.length) onsets.push({ ...e, skipped: "the mouth never leaves rest" });
      else { const k = rest.last + 1; onsets.push({ ...e, frame: k, frameS: frames[k].t, mouth: frames[k].mouth, ms: (frames[k].t - seg.start) * 1000 }); }
    }
    if (!p.leading) {
      const word = words.reduce((a, b) => (Math.abs(b.end - p.start) < Math.abs(a.end - p.start) ? b : a));
      const e = { word: word.word, endS: p.start, pauseS: [p.start, p.end] };
      if (!rest) ends.push({ ...e, skipped: "the mouth does not rest in the pause" });
      else {
        const seg = segments[p.trailing ? segments.length - 1 : p.before - 1], k = rest.first;
        ends.push({ ...e, frame: k, frameS: frames[k].t, ms: (frames[k].t - p.start) * 1000, ...(frames[k].t < seg.start ? { note: "the rest began before this sound segment's onset" } : {}) });
      }
    }
  }
  return { onsets, ends };
}

// For every m, b, p of the text: is the mouth rest in at least one frame overlapping that letter's aligned span?
export function closureScore(alignment, frames, fps) {
  const out = [];
  alignment.characters.forEach((c, k) => {
    if (!/^[mbp]$/i.test(c)) return;
    const s = alignment.character_start_times_seconds[k], e = alignment.character_end_times_seconds[k];
    const hit = frames.some((f) => s < f.t + 1 / fps && e > f.t && f.mouth === "rest");
    out.push({ letter: c, start: s, end: e, hit });
  });
  return { hits: out.filter((x) => x.hit).length, of: out.length, letters: out };
}

export function changesTable(mouths, fps) {
  const runs = [];
  for (let i = 0, s = 0; i <= mouths.length; i++) if (i === mouths.length || mouths[i] !== mouths[s]) { runs.push(i - s); s = i; }
  const lens = [...runs].sort((a, b) => a - b);
  const changes = mouths.slice(1).filter((x, i) => x !== mouths[i]).length;
  const per = {};
  for (const m of mouths) per[m] = (per[m] || 0) + 1;
  return { frames: mouths.length, changes, perSecond: changes / (mouths.length / fps), perShape: per, shortest: lens[0], median: median(lens), oneFrame: runs.filter((x) => x === 1).length };
}

export function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

// Yardsticks (author's prompt #17): within one frame (|x| <= 1000/30 ms), and within 45 ms late / 125 ms early.
export function summary(values) {
  const v = values.filter((x) => typeof x === "number");
  return {
    count: v.length, median: median(v), largestAbs: v.length ? Math.max(...v.map(Math.abs)) : null,
    withinOneFrame: v.filter((x) => Math.abs(x) <= 1000 / 30).length,
    within45Late125Early: v.filter((x) => x <= 45 && x >= -125).length,
  };
}

// Lip sync v2: character timings → one mouth per frame (author's prompt #15). Input: the alignment ElevenLabs returns
// with the audio (characters with start and end times; letters, not phonemes). Rules are data (rig/lipsync-text.json).
// Pure, no imports: runs in a browser too.

const isLetter = (c) => /^[a-z]$/.test(c);
const isVowel = (c) => /^[aeiou]$/.test(c);

// The class of every character of the text, with the rule that decided it.
export function letterClasses(text, rules) {
  const t = text.toLowerCase(), n = t.length;
  const out = Array.from(t, (c) => (isLetter(c) ? null : { cls: "gap", rule: "non-letter" }));
  // Words: runs of letters (an apostrophe inside a word is not a letter and splits nothing important here).
  const words = [];
  for (let i = 0; i < n; ) {
    if (!isLetter(t[i])) { i++; continue; }
    let j = i;
    while (j < n && isLetter(t[j])) j++;
    words.push([i, j]);
    i = j;
  }
  for (const [a, b] of words) {
    const w = t.slice(a, b);
    if (w === "i") { out[a] = { cls: rules.pronounI.class, rule: "pronoun i" }; continue; }
    for (let k = a; k < b; k++) {
      if (out[k]) continue;
      const pair = rules.pairs.find((p) => t.slice(k, k + 2) === p.letters && k + 1 < b);
      if (pair) {
        // A pair is one class for both letters, or (classes) one class per letter; listed words keep exceptionClass.
        const [c0, c1] = pair.exceptions?.includes(w) ? [pair.exceptionClass, pair.exceptionClass] : pair.classes || [pair.class, pair.class];
        const rule = pair.exceptions?.includes(w) ? `pair ${pair.letters} in ${w}` : `pair ${pair.letters}`;
        out[k] = { cls: c0, rule };
        out[k + 1] = { cls: c1, rule };
        continue;
      }
      const c = t[k];
      if (c === "y" && rules.y.onlyVowel && !/[aeiou]/.test(w)) { out[k] = { cls: rules.y.onlyVowel.class, rule: "y only vowel" }; continue; }
      if (c === "y") {
        const consonant = k === a && k + 1 < b && isVowel(t[k + 1]);
        out[k] = { cls: consonant ? classOfMouth(rules, rules.y.consonant) : classOfMouth(rules, rules.y.vowel), rule: consonant ? "y consonant" : "y vowel" };
        continue;
      }
      out[k] = rules.letters[c] ? { cls: rules.letters[c].class, rule: `letter ${c}` } : { cls: rules.otherLetters.class, rule: "other letter" };
    }
    // Silent final e: replaced by the class of the letter before it.
    if (b - a >= 3 && t[b - 1] === "e" && !isVowel(t[b - 2]) && !rules.silentFinalE.exceptions.includes(w)) out[b - 1] = { cls: out[b - 2].cls, rule: "silent final e" };
  }
  return out;
}

function classOfMouth(rules, mouth) {
  return Object.keys(rules.classes).find((k) => rules.classes[k].mouth === mouth && k !== "gap" && k !== "closure");
}

// One class per frame. With rules.frameRule.mode "majority" (author's prompt #17): the character that covers most of
// the frame's time window wins, spaces and punctuation included (class gap), and so does the time no character covers
// (gap); class priority only breaks exact ties. Without it (the rules before prompt #17): the highest-priority class
// among the characters overlapping the window.
export function frameClasses(alignment, fps, rules, frames) {
  const chars = alignment.characters, starts = alignment.character_start_times_seconds, ends = alignment.character_end_times_seconds;
  const cls = letterClasses(chars.join(""), rules);
  const rank = (c) => rules.priority.indexOf(c);
  const n = frames ?? Math.ceil(Math.max(0, ...ends) * fps);
  const out = new Array(n).fill("gap");
  if (rules.frameRule?.mode === "majority") {
    for (let f = 0; f < n; f++) {
      const a = f / fps, b = (f + 1) / fps;
      let best = "gap", bestCover = 0, covered = 0;
      for (let k = 0; k < chars.length; k++) {
        const cover = Math.min(ends[k], b) - Math.max(starts[k], a);
        if (cover <= 0) continue;
        covered += cover;
        if (cover > bestCover || (cover === bestCover && rank(cls[k].cls) < rank(best))) { best = cls[k].cls; bestCover = cover; }
      }
      const uncovered = b - a - covered;
      out[f] = uncovered > bestCover ? "gap" : best;
    }
    return { classes: out, letters: cls };
  }
  for (let k = 0; k < chars.length; k++) {
    const f0 = Math.max(0, Math.floor(starts[k] * fps)), f1 = Math.min(n - 1, Math.ceil(ends[k] * fps) - 1);
    for (let f = f0; f <= f1; f++) {
      const a = f / fps, b = (f + 1) / fps;
      if (!(starts[k] < b && ends[k] > a)) continue;
      if (rank(cls[k].cls) < rank(out[f])) out[f] = cls[k].cls;
    }
  }
  return { classes: out, letters: cls };
}

// Runs shorter than minFrames are removed (rule in rig/lipsync-text.json).
export function enforceMinFrames(classes, rules) {
  const out = [...classes], rank = (c) => rules.priority.indexOf(c), min = rules.minFrames;
  const runs = () => {
    const r = [];
    for (let i = 0, s = 0; i <= out.length; i++) if (i === out.length || out[i] !== out[s]) { r.push([s, i - s]); s = i; }
    return r;
  };
  for (let guard = 0; guard < out.length * 4; guard++) {
    const r = runs(), k = r.findIndex(([, len]) => len < min);
    if (k < 0 || r.length < 2) break;
    const [s, len] = r[k], next = r[k + 1], prev = r[k - 1], c = out[s];
    if (next && rank(c) < rank(out[next[0]]) && next[1] - (min - len) >= min) {
      for (let f = next[0]; f < next[0] + (min - len); f++) out[f] = c;
    } else if (prev) {
      for (let f = s; f < s + len; f++) out[f] = out[prev[0]];
    } else {
      for (let f = s; f < s + len; f++) out[f] = out[next[0]];
    }
  }
  return out;
}

export function lipsyncText(alignment, fps, rules, frames) {
  const { classes, letters } = frameClasses(alignment, fps, rules, frames);
  const held = enforceMinFrames(classes, rules);
  return { mouths: held.map((c) => rules.classes[c].mouth), classes: held, rawClasses: classes, letters };
}

// Emotion tags in script text, e.g. "Hello. [happy] I am Ping." (author's prompt #15). Pure, no imports.
//   parseTags(text, states) → { clean, tags: [{ index, state }] }: the text without tags (spaces around a removed tag
//     collapse to one), and for each tag the index in clean text of the first character it applies to.
//   marksFromAlignment(tags, alignment, fps) → [{ frame, state }]: a tag starts at the frame of that character's start;
//     a tag at the very end starts after the last character.

export function parseTags(text, states) {
  const known = new Set(["neutral", ...states]);
  let clean = "";
  const tags = [];
  const re = /\[([^\]]*)\]/g;
  let at = 0, m;
  while ((m = re.exec(text))) {
    const state = m[1].trim().toLowerCase();
    if (!known.has(state)) throw new Error(`unknown emotion tag [${m[1]}] at ${m.index}`);
    clean += text.slice(at, m.index);
    at = m.index + m[0].length;
    // One space at most between the words around a removed tag.
    if (clean.endsWith(" ") && text[at] === " ") at++;
    tags.push({ index: clean.length, state });
  }
  clean += text.slice(at);
  // A tag right after a space points at the next word; one at the start of a space points past it.
  for (const t of tags) while (t.index < clean.length && clean[t.index] === " ") t.index++;
  if (/[[\]]/.test(clean)) throw new Error("unbalanced bracket in script text");
  return { clean, tags };
}

export function marksFromAlignment(tags, alignment, fps) {
  const starts = alignment.character_start_times_seconds, ends = alignment.character_end_times_seconds;
  return tags.map((t) => ({
    frame: t.index < starts.length ? Math.floor(starts[t.index] * fps) : Math.ceil(ends[ends.length - 1] * fps),
    state: t.state,
  }));
}

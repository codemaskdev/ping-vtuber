// Lip sync v1, the naive baseline: loudness of each frame's window → rest, small or open. On purpose no smoothing,
// no hysteresis, no look-ahead (author's prompt #14); step 5 has to beat it. Pure, no imports: runs in a browser too.
//
//   frame i covers samples [floor(i * sampleRate / fps), floor((i + 1) * sampleRate / fps))
//   loudness = RMS of those samples (linear, full scale = 1; no logarithm, CLAUDE.md rule 5)
//   rms < config.restBelow → "rest";  rms >= config.openFrom → "open";  otherwise "small"

export function frameCount(sampleCount, sampleRate, fps) {
  return Math.ceil((sampleCount * fps) / sampleRate);
}

export function frameRms(samples, sampleRate, fps) {
  const n = frameCount(samples.length, sampleRate, fps), out = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * sampleRate) / fps), b = Math.min(samples.length, Math.floor(((i + 1) * sampleRate) / fps));
    let sum = 0;
    for (let k = a; k < b; k++) sum += samples[k] * samples[k];
    out[i] = b > a ? Math.sqrt(sum / (b - a)) : 0;
  }
  return out;
}

export function mouthOf(rms, config) {
  if (rms < config.restBelow) return "rest";
  if (rms >= config.openFrom) return "open";
  return "small";
}

export function lipsyncVolume(samples, sampleRate, fps, config) {
  if (!(config.restBelow < config.openFrom)) throw new Error("lipsync config: restBelow must be below openFrom");
  const rms = frameRms(samples, sampleRate, fps);
  return { rms, mouths: rms.map((r) => mouthOf(r, config)) };
}

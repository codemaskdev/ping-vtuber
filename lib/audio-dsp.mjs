// Small measurements on decoded samples (mono float, full scale 1). Pure, no imports.

export function rms(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

export function peak(samples) {
  let p = 0;
  for (let i = 0; i < samples.length; i++) { const v = Math.abs(samples[i]); if (v > p) p = v; }
  return p;
}

// The gain that brings `processed` back to the RMS of `reference`, lowered if needed so that no sample goes above
// `ceiling` (author's prompt #16: "without clipping"). Says which of the two decided it.
export function matchRmsGain(reference, processed, ceiling) {
  const want = rms(reference) / rms(processed), p = peak(processed);
  if (p * want <= ceiling) return { gain: want, limitedByCeiling: false, wanted: want };
  return { gain: ceiling / p, limitedByCeiling: true, wanted: want };
}

export function scaled(samples, gain) {
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain;
  return out;
}

// Normalised cross-correlation of b against a for every lag in -maxLag..maxLag (b[n + lag] against a[n]), over the
// samples both have. The lag with the largest value is how many samples later b's sound comes than a's.
export function crossCorrelationLag(a, b, maxLag) {
  let ea = 0, eb = 0;
  for (let i = 0; i < a.length; i++) ea += a[i] * a[i];
  for (let i = 0; i < b.length; i++) eb += b[i] * b[i];
  const norm = Math.sqrt(ea * eb);
  let best = { lag: 0, r: -Infinity };
  const at = (lag) => {
    let s = 0;
    const n0 = Math.max(0, -lag), n1 = Math.min(a.length, b.length - lag);
    for (let n = n0; n < n1; n++) s += a[n] * b[n + lag];
    return norm ? s / norm : 0;
  };
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const r = at(lag);
    if (r > best.r) best = { lag, r };
  }
  return { lag: best.lag, r: best.r, rAtZero: at(0), maxLag };
}

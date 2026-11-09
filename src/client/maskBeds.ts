// The three masking-noise beds for Can't hear (Task 93), as sample data: pure functions of a sample
// rate and a seed, so they can be tested and nothing is downloaded. Each is BED_SECS long and loops
// without a seam: it is generated a crossfade longer than its length, and the extra tail is mixed
// (equal power) into the head, so the last sample runs on into the first.
import type { MaskBed } from "./settings.ts";

export const BED_SECS = 6;
const FADE_SECS = 0.5;
const TARGET_RMS = 0.3; // every bed is as loud as the old brown noise was, so the volume slider means the same

// mulberry32: a small seeded generator.
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const white = (r: () => number) => r() * 2 - 1;

function brown(n: number, r: () => number): Float32Array {
  const out = new Float32Array(n);
  let last = 0;
  for (let i = 0; i < n; i++) {
    last = (last + 0.02 * white(r)) / 1.02;
    out[i] = last;
  }
  return out;
}

// Paul Kellet's pink-noise filter.
function pink(n: number, r: () => number): Float32Array {
  const out = new Float32Array(n);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = white(r);
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
  }
  return out;
}

const onePole = (hz: number, rate: number) => 1 - Math.exp((-2 * Math.PI * hz) / rate);

function lowpass(x: Float32Array, hz: number, rate: number): Float32Array {
  const a = onePole(hz, rate);
  const out = new Float32Array(x.length);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y += a * ((x[i] as number) - y);
    out[i] = y;
  }
  return out;
}

function bandpass(x: Float32Array, lo: number, hi: number, rate: number): Float32Array {
  const low = lowpass(x, lo, rate);
  const high = lowpass(x, hi, rate);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = (high[i] as number) - (low[i] as number);
  return out;
}

// A short decaying sine: a droplet or a clink.
function ping(
  out: Float32Array,
  at: number,
  hz: number,
  secs: number,
  level: number,
  rate: number,
): void {
  const n = Math.floor(secs * rate);
  for (let i = 0; i < n && at + i < out.length; i++) {
    const env = (1 - i / n) ** 3;
    out[at + i] = (out[at + i] as number) + level * env * Math.sin((2 * Math.PI * hz * i) / rate);
  }
}

function rain(n: number, rate: number, r: () => number): Float32Array {
  const hiss = bandpass(
    Float32Array.from({ length: n }, () => white(r)),
    900,
    7000,
    rate,
  );
  const rms = Math.sqrt(hiss.reduce((s, v) => s + v * v, 0) / n);
  const drops = new Float32Array(n);
  // sparse droplets, about 30 a second, each a few ms of a random 2 to 5 kHz pitch
  const count = Math.floor((n / rate) * 30);
  for (let d = 0; d < count; d++) {
    ping(
      drops,
      Math.floor(r() * n),
      2000 + r() * 3000,
      0.012 + r() * 0.01,
      rms * (1.5 + r() * 2),
      rate,
    );
  }
  return hiss.map((v, i) => v + (drops[i] as number));
}

function cafe(n: number, rate: number, r: () => number): Float32Array {
  // voices sit between about 250 Hz and 2.5 kHz: pink noise through that band is a murmur, not a rumble
  const murmur = bandpass(pink(n, r), 250, 2500, rate);
  const rms = Math.sqrt(murmur.reduce((s, v) => s + v * v, 0) / n);
  // a slow swell, as a room's talk comes and goes
  const swellHz = 0.5;
  const out = murmur.map(
    (v, i) => v * (0.75 + 0.25 * Math.sin((2 * Math.PI * swellHz * i) / rate)),
  );
  const clinks = new Float32Array(n);
  // a faint high clink every few seconds, never near the loop ends
  for (let t = 1.2; t < BED_SECS - 1; t += 2.4 + r() * 1.2) {
    ping(clinks, Math.floor(t * rate), 3200 + r() * 1800, 0.09, rms * 0.35, rate);
  }
  return out.map((v, i) => v + (clinks[i] as number));
}

function seamless(x: Float32Array, len: number, fade: number): Float32Array {
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = x[i] as number;
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    out[i] =
      (x[i] as number) * Math.sin((t * Math.PI) / 2) +
      (x[len + i] as number) * Math.cos((t * Math.PI) / 2);
  }
  return out;
}

export function bedSamples(bed: MaskBed, rate: number, seed = 1): Float32Array {
  const len = Math.floor(rate * BED_SECS);
  const fade = Math.floor(rate * FADE_SECS);
  const n = len + fade;
  const r = rng(seed);
  const raw = bed === "rain" ? rain(n, rate, r) : bed === "cafe" ? cafe(n, rate, r) : brown(n, r);
  const out = seamless(raw, len, fade);
  const rms = Math.sqrt(out.reduce((s, v) => s + v * v, 0) / len) || 1;
  const gain = TARGET_RMS / rms;
  for (let i = 0; i < len; i++) out[i] = Math.max(-1, Math.min(1, (out[i] as number) * gain));
  return out;
}

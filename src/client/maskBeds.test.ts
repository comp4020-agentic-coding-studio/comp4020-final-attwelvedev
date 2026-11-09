import { describe, expect, it } from "vitest";
import { bedSamples } from "./maskBeds.ts";
import type { MaskBed } from "./settings.ts";

const RATE = 16000;
const BEDS: MaskBed[] = ["brown", "rain", "cafe"];

const rms = (x: Float32Array, from: number, to: number) => {
  let s = 0;
  for (let i = from; i < to; i++) s += (x[i] as number) ** 2;
  return Math.sqrt(s / (to - from));
};

// the magnitude spectrum's centroid, over a few 2048-sample windows (a plain DFT is slow; a radix-2 FFT is short)
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] as number, re[i] as number];
      [im[i], im[j]] = [im[j] as number, im[i] as number];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const a = i + k;
        const b = i + k + len / 2;
        const xr = (re[b] as number) * wr - (im[b] as number) * wi;
        const xi = (re[b] as number) * wi + (im[b] as number) * wr;
        re[b] = (re[a] as number) - xr;
        im[b] = (im[a] as number) - xi;
        re[a] = (re[a] as number) + xr;
        im[a] = (im[a] as number) + xi;
      }
    }
  }
}

function centroid(x: Float32Array): number {
  const N = 2048;
  let num = 0;
  let den = 0;
  for (let w = 0; w < 6; w++) {
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    const off = 4000 + w * 9000;
    for (let i = 0; i < N; i++)
      re[i] = (x[off + i] as number) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const m = Math.hypot(re[k] as number, im[k] as number);
      num += m * ((k * RATE) / N);
      den += m;
    }
  }
  return num / den;
}

describe("maskBeds", () => {
  it("each bed is six seconds long", () => {
    for (const b of BEDS) expect(bedSamples(b, RATE).length, b).toBe(RATE * 6);
  });

  it("each bed's first and last 10 ms differ by less than a seam threshold", () => {
    const ten = Math.floor(RATE * 0.01);
    for (const b of BEDS) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const x = bedSamples(b, RATE, seed);
        const first = rms(x, 0, ten);
        const last = rms(x, x.length - ten, x.length);
        expect(Math.abs(first - last) / Math.max(first, last), `${b} ${seed} level`).toBeLessThan(
          0.5,
        );
        // the step across the loop point is an ordinary step: within 6x the bed's typical one
        let sum = 0;
        for (let i = 1; i < x.length; i++) sum += ((x[i] as number) - (x[i - 1] as number)) ** 2;
        const typical = Math.sqrt(sum / (x.length - 1));
        const seam = Math.abs((x[0] as number) - (x[x.length - 1] as number));
        expect(seam, `${b} ${seed} step`).toBeLessThan(6 * typical);
      }
    }
  });

  it("rain and cafe differ from brown in spectral centroid", () => {
    const brown = centroid(bedSamples("brown", RATE));
    for (const b of ["rain", "cafe"] as const) {
      const c = centroid(bedSamples(b, RATE));
      expect(Math.abs(c - brown) / brown, b).toBeGreaterThan(0.2);
    }
    expect(centroid(bedSamples("rain", RATE))).not.toBeCloseTo(
      centroid(bedSamples("cafe", RATE)),
      -1,
    );
  });

  it("a seed gives the same buffer, and another seed a different one", () => {
    for (const b of BEDS) {
      expect(bedSamples(b, RATE, 7), b).toEqual(bedSamples(b, RATE, 7));
      expect(bedSamples(b, RATE, 7), b).not.toEqual(bedSamples(b, RATE, 8));
    }
  });

  it("every bed is as loud as the others, within a quarter", () => {
    const levels = BEDS.map((b) => {
      const x = bedSamples(b, RATE);
      return rms(x, 0, x.length);
    });
    expect(Math.max(...levels) / Math.min(...levels)).toBeLessThan(1.25);
  });
});

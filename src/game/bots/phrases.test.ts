import { describe, expect, it } from "vitest";
import { MAX_TEXT } from "../channels.ts";
import { PHRASES, pickPhrase, type Situation } from "./phrases.ts";

const situations = Object.keys(PHRASES) as Situation[];

describe("pickPhrase", () => {
  it("has a list for every situation, each phrase short enough to send", () => {
    expect(situations.length).toBeGreaterThanOrEqual(4);
    for (const s of situations) {
      expect(PHRASES[s].length).toBeGreaterThanOrEqual(6);
      for (const p of PHRASES[s]) expect(p.length).toBeLessThanOrEqual(MAX_TEXT);
    }
  });

  it("never repeats a phrase until the list is used up", () => {
    for (const s of situations) {
      const used = new Set<string>();
      const seen = new Set<string>();
      for (let i = 0; i < PHRASES[s].length; i++) {
        const phrase = pickPhrase(s, used, i * 3 + 1);
        expect(seen.has(phrase)).toBe(false);
        seen.add(phrase);
      }
      expect(seen.size).toBe(PHRASES[s].length);
    }
  });

  it("starts over once the list is exhausted", () => {
    const used = new Set<string>();
    for (let i = 0; i < PHRASES.moving.length; i++) pickPhrase("moving", used, i);
    expect(PHRASES.moving).toContain(pickPhrase("moving", used, 99));
  });

  it("varies with the seed", () => {
    const a = pickPhrase("moving", new Set(), 0);
    const b = pickPhrase("moving", new Set(), 1);
    expect(a).not.toBe(b);
  });
});

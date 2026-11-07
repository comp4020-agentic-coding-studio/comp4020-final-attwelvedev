import { describe, expect, it } from "vitest";
import { loadRevealOpen, saveRevealOpen } from "./revealPrefs.ts";

const store = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    data,
  };
};

const throwing = {
  getItem: (): string | null => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("the reveal's Who perceives what memory", () => {
  it("starts folded in a fresh browser", () => {
    expect(loadRevealOpen(store())).toBe(false);
    expect(loadRevealOpen(null)).toBe(false);
  });

  it("remembers the last state it was left in, under its own key", () => {
    const s = store();
    saveRevealOpen(true, s);
    expect(loadRevealOpen(s)).toBe(true);
    expect(JSON.parse(s.data["heist.reveal"] ?? "")).toEqual({ open: true });
    expect(s.data["heist.settings"]).toBeUndefined();
    saveRevealOpen(false, s);
    expect(loadRevealOpen(s)).toBe(false);
  });

  it("reads blocked storage as folded and never throws", () => {
    expect(loadRevealOpen(throwing)).toBe(false);
    expect(() => saveRevealOpen(true, throwing)).not.toThrow();
  });

  it("reads junk as folded", () => {
    expect(loadRevealOpen(store({ "heist.reveal": "{not json" }))).toBe(false);
    expect(loadRevealOpen(store({ "heist.reveal": '{"open":"yes"}' }))).toBe(false);
    expect(loadRevealOpen(store({ "heist.reveal": "null" }))).toBe(false);
  });
});

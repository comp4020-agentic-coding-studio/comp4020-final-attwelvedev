import { describe, expect, it } from "vitest";
import { DEFAULT_SETUP } from "../game/setup.ts";
import { loadSetup, saveSetup } from "./preferences.ts";

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

describe("loadSetup", () => {
  it("is the defaults when nothing was saved", () => {
    expect(loadSetup(store())).toEqual(DEFAULT_SETUP);
  });

  it("gives back what was saved, marked as answered", () => {
    const s = store();
    saveSetup({ ...DEFAULT_SETUP, inRoom: true, mask: true, done: true }, s);
    expect(loadSetup(s)).toEqual({ ...DEFAULT_SETUP, inRoom: true, mask: true, done: true });
  });

  it("is the defaults for corrupt data, wrong types, or a store that throws", () => {
    expect(loadSetup(store({ "heist.setup": "{not json" }))).toEqual(DEFAULT_SETUP);
    expect(loadSetup(store({ "heist.setup": "7" }))).toEqual(DEFAULT_SETUP);
    expect(loadSetup(store({ "heist.setup": JSON.stringify({ inRoom: "yes", mask: 1 }) }))).toEqual(
      DEFAULT_SETUP,
    );
    expect(
      loadSetup({
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {},
      }),
    ).toEqual(DEFAULT_SETUP);
  });

  it("keeps the fields that are right and defaults the rest", () => {
    const s = store({ "heist.setup": JSON.stringify({ inRoom: true, mask: "no" }) });
    expect(loadSetup(s)).toEqual({ ...DEFAULT_SETUP, inRoom: true });
  });
});

describe("saveSetup", () => {
  it("does not throw when the store does", () => {
    expect(() =>
      saveSetup(DEFAULT_SETUP, {
        getItem: () => null,
        setItem: () => {
          throw new Error("full");
        },
      }),
    ).not.toThrow();
  });
});

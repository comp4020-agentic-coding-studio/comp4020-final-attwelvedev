import { describe, expect, it } from "vitest";
import { keyAction } from "./keys.ts";

const k = (key: string, extra: { shift?: boolean; code?: string } = {}) => ({
  key,
  shiftKey: extra.shift ?? false,
  code: extra.code ?? (/^[0-9]$/.test(key) ? `Digit${key}` : ""),
});
const idle = { wheel: false, typing: false };
const held = { wheel: true, typing: false };

describe("keyAction: the wheel", () => {
  it("Q opens the wheel, in either case, for every role", () => {
    for (const role of ["blind", "deaf", "mute"] as const) {
      expect(keyAction(role, idle, k("q"))).toEqual({ type: "wheel" });
      expect(keyAction(role, idle, k("Q"))).toEqual({ type: "wheel" });
    }
  });

  it("1 to 4 pick the page while the wheel is held", () => {
    expect(keyAction("blind", held, k("1"))).toEqual({ type: "page", page: "talk" });
    expect(keyAction("blind", held, k("2"))).toEqual({ type: "page", page: "faces" });
    expect(keyAction("blind", held, k("3"))).toEqual({ type: "page", page: "clips" });
    expect(keyAction("blind", held, k("4"))).toEqual({ type: "page", page: "marks" });
    expect(keyAction("blind", held, k("5"))).toBeNull();
  });

  it("reads the physical digit key, so Shift does not change the page", () => {
    expect(keyAction("blind", held, k("@", { shift: true, code: "Digit2" }))).toEqual({
      type: "page",
      page: "faces",
    });
  });
});

describe("keyAction: nothing is sent by a remembered number", () => {
  it("number keys do nothing without the wheel, for any role, with or without Shift", () => {
    for (const role of ["blind", "deaf", "mute"] as const) {
      for (let n = 0; n <= 9; n++) {
        expect(keyAction(role, idle, k(String(n))), `${role} ${n}`).toBeNull();
        expect(
          keyAction(role, idle, k("!", { shift: true, code: `Digit${n}` })),
          `${role} S${n}`,
        ).toBeNull();
      }
    }
  });
});

describe("keyAction: talk keys", () => {
  it("Enter opens the text field, V talks, Tab lists the keys, Esc closes", () => {
    expect(keyAction("blind", idle, k("Enter"))).toEqual({ type: "text" });
    expect(keyAction("blind", idle, k("v"))).toEqual({ type: "talk" });
    expect(keyAction("blind", idle, k("V"))).toEqual({ type: "talk" });
    expect(keyAction("blind", idle, k("Tab"))).toEqual({ type: "keys" });
    expect(keyAction("blind", idle, k("Escape"))).toEqual({ type: "close" });
  });

  it("leaves the movement keys and Space alone", () => {
    for (const key of ["w", "a", "s", "d", "W", "ArrowUp", " "]) {
      expect(keyAction("blind", idle, k(key))).toBeNull();
    }
  });
});

describe("keyAction: while typing", () => {
  const typing = { wheel: false, typing: true };
  it("reads only Esc: digits, Q, V and Enter belong to the text field", () => {
    for (const key of ["1", "5", "q", "v", "w", " ", "Tab"]) {
      expect(keyAction("deaf", typing, k(key))).toBeNull();
    }
    expect(keyAction("deaf", typing, k("Escape"))).toEqual({ type: "close" });
  });
});

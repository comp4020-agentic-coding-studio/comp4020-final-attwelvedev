import { describe, expect, it } from "vitest";
import { CALLOUTS } from "../game/channels.ts";
import { calloutAt, keyAction } from "./keys.ts";

describe("keyAction: the tray's keys", () => {
  it("1, 2, 3 open Say, Sound, Show when nothing is open", () => {
    expect(keyAction(null, "1", false)).toEqual({ type: "open", sheet: "say" });
    expect(keyAction(null, "2", false)).toEqual({ type: "open", sheet: "sound" });
    expect(keyAction(null, "3", false)).toEqual({ type: "open", sheet: "show" });
  });

  it("other digits do nothing when nothing is open", () => {
    for (const k of ["0", "4", "9"]) expect(keyAction(null, k, false)).toBeNull();
  });

  it("with a sheet open, 1..9 pick that slot, counted from 0", () => {
    for (const sheet of ["say", "sound", "show"] as const) {
      for (let n = 1; n <= 9; n++) {
        expect(keyAction(sheet, String(n), false)).toEqual({ type: "pick", index: n - 1 });
      }
    }
  });

  it("with Say open, 1..9 reach CALLOUTS in order: 1 is Push, 4 is Left, 9 is Go", () => {
    const at = (n: number) =>
      calloutAt((keyAction("say", String(n), false) as { index: number }).index);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(at)).toEqual([...CALLOUTS]);
    expect(at(4)).toBe("left");
  });

  it("0 turns the hotbar page while a sheet is open, and does nothing otherwise", () => {
    for (const sheet of ["say", "sound", "show"] as const) {
      expect(keyAction(sheet, "0", false)).toEqual({ type: "page" });
    }
    expect(keyAction(null, "0", false)).toBeNull();
    expect(keyAction("show", "0", true)).toBeNull(); // typing a 0 in a message
  });

  it("F and T pick the Faces and Stamps tabs inside Show only", () => {
    expect(keyAction("show", "f", false)).toEqual({ type: "tab", tab: "faces" });
    expect(keyAction("show", "T", false)).toEqual({ type: "tab", tab: "stamps" });
    for (const sheet of ["say", "sound", null] as const) {
      expect(keyAction(sheet, "f", false)).toBeNull();
      expect(keyAction(sheet, "t", false)).toBeNull();
    }
    expect(keyAction("show", "f", true)).toBeNull(); // an f typed into a message
  });

  it("Esc closes an open sheet, and does nothing with none open", () => {
    expect(keyAction("say", "Escape", false)).toEqual({ type: "close" });
    expect(keyAction(null, "Escape", false)).toBeNull();
  });

  it("Enter opens the text field only in Say", () => {
    expect(keyAction("say", "Enter", false)).toEqual({ type: "text" });
    expect(keyAction("sound", "Enter", false)).toBeNull();
    expect(keyAction(null, "Enter", false)).toBeNull();
  });

  it("Tab shows the key list", () => {
    expect(keyAction(null, "Tab", false)).toEqual({ type: "keys" });
  });

  it("while typing, only Esc is read: digits and movement keys belong to the text field", () => {
    for (const k of ["1", "5", "w", "a", " ", "Enter", "Tab"]) {
      expect(keyAction("say", k, true)).toBeNull();
    }
    expect(keyAction("say", "Escape", true)).toEqual({ type: "close" });
  });

  it("leaves the movement keys alone", () => {
    for (const k of ["w", "a", "s", "d", "W", "A", "S", "D", " "]) {
      for (const sheet of ["say", "sound", "show", null] as const) {
        expect(keyAction(sheet, k, false)).toBeNull();
      }
    }
  });
});

describe("calloutAt", () => {
  it("is undefined past the grid", () => {
    expect(calloutAt(9)).toBeUndefined();
  });
});

describe("keyAction: push to talk", () => {
  it("V talks whether or not a sheet is open, in either case", () => {
    for (const open of [null, "say", "sound", "show"] as const) {
      expect(keyAction(open, "v", false)).toEqual({ type: "talk" });
      expect(keyAction(open, "V", false)).toEqual({ type: "talk" });
    }
  });
  it("a v typed into a message is just a letter", () => {
    expect(keyAction("say", "v", true)).toBeNull();
  });
});

// @vitest-environment jsdom
import { h, render } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GearSlot } from "./GearSlot.tsx";
import { TalkBar } from "./TalkBar.tsx";

// Which kinds of menu sound were asked for, by a click on each thing. A fresh uiSound module each
// time: it installs its one document listener once.
const asked = (): string[] => (globalThis as unknown as { __uiSounds: string[] }).__uiSounds;

// the document outlives each test, and every fresh module adds its own listeners: take them off again
const added: [string, EventListenerOrEventListenerObject][] = [];
beforeEach(() => {
  vi.resetModules();
  const real = document.addEventListener.bind(document);
  vi.spyOn(document, "addEventListener").mockImplementation((type, fn, opts) => {
    added.push([type, fn as EventListener]);
    real(type, fn, opts);
  });
  (globalThis as unknown as { __uiSounds: string[] }).__uiSounds = [];
});
afterEach(() => {
  for (const [type, fn] of added.splice(0)) document.removeEventListener(type, fn);
  vi.restoreAllMocks();
  render(null, document.body);
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const voice = {
  status: "ready",
  talking: false,
  talk() {},
  mode: "hold",
  mic() {},
  speaking: new Set<number>(),
} as never;

describe("menu sounds never tick during play", () => {
  it("a press on the gear slot asks for no sound, and a press on a plain button does", async () => {
    const { installUiSounds } = await import("../client/uiSound.ts");
    installUiSounds(() => ({ menuSounds: true }));
    render(
      h("div", null, [
        h(GearSlot, { gear: "key", touch: true } as never),
        h("button", { type: "button", id: "plain" }, "Plain"),
      ]),
      document.body,
    );
    (document.querySelector(".gear-btn") as HTMLElement).click();
    expect(asked()).toEqual([]);
    (document.getElementById("plain") as HTMLElement).click();
    expect(asked()).toEqual(["press"]);
  });

  it("a press on the talk bar's Comms, Write and push-to-talk asks for no sound", async () => {
    const { installUiSounds } = await import("../client/uiSound.ts");
    installUiSounds(() => ({ menuSounds: true }));
    render(
      h(TalkBar, {
        role: "blind",
        voice,
        writing: false,
        field: { current: null },
        onWrite() {},
        onText() {},
        onFocus() {},
        onComms() {},
      }),
      document.body,
    );
    const buttons = [...document.querySelectorAll<HTMLElement>(".talk-bar button")];
    expect(buttons.map((b) => b.className)).toEqual([
      "btn talk-comms",
      "btn talk-write",
      "btn talk-mic",
    ]);
    for (const b of buttons) b.click();
    expect(asked()).toEqual([]);
  });
});

describe("the in-game Menu sounds switch", () => {
  it("silences the next press with storage blocked, because the live settings are passed in", async () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    });
    const { installUiSounds, savedSettings } = await import("../client/uiSound.ts");
    // the lobby page installs first, reading what is saved (nothing can be, so the default: on)
    installUiSounds(savedSettings);
    // the game mounts under it and hands in its live settings, where the switch is now off
    installUiSounds(() => ({ menuSounds: false }));
    render(h("button", { type: "button", id: "b" }, "Hello"), document.body);
    (document.getElementById("b") as HTMLElement).click();
    expect(asked()).toEqual([]);
  });
});

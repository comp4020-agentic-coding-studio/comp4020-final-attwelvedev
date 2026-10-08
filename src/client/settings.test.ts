import { describe, expect, it } from "vitest";
import { defaultsFor, loadSettings, saveSettings } from "./settings.ts";

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

describe("defaultsFor", () => {
  // Can't see's whole game is sound, so a muted phone or a loud showcase hall
  // would leave them with nothing. Captions are their backup, so they start on.
  it("has captions on for every role, Can't see included", () => {
    for (const role of ["blind", "deaf", "mute"] as const) {
      expect(defaultsFor(role).captions, role).toBe(true);
    }
  });

  it("starts with game sound and spoken lines both on, and the sheet closing after a send", () => {
    expect(defaultsFor("mute")).toMatchObject({ sound: true, speech: true, keepOpen: false });
  });
});

describe("loadSettings and saveSettings", () => {
  it("round-trips a change", () => {
    const s = store();
    saveSettings({ ...defaultsFor("blind"), captions: false }, s); // a player who turns them off
    expect(loadSettings("blind", s).captions).toBe(false);
  });

  it("keeps a person's choice across roles, falling back to the role default if unset", () => {
    const s = store();
    expect(loadSettings("blind", s).captions).toBe(true);
    saveSettings({ sound: false, speech: false, keepOpen: true, captions: null }, s);
    const loaded = loadSettings("deaf", s);
    expect(loaded).toMatchObject({ sound: false, speech: false, keepOpen: true, captions: true });
  });

  it("keeps game sound and spoken lines apart", () => {
    const s = store();
    saveSettings({ ...defaultsFor("blind"), sound: false }, s);
    expect(loadSettings("blind", s)).toMatchObject({ sound: false, speech: true });
    saveSettings({ ...defaultsFor("blind"), speech: false }, s);
    expect(loadSettings("blind", s)).toMatchObject({ sound: true, speech: false });
  });

  it("falls back to the default for a setting saved before it existed", () => {
    const s = store({ "heist.settings": JSON.stringify({ sound: false, captions: true }) });
    expect(loadSettings("blind", s)).toMatchObject({ sound: false, speech: true });
  });

  it("ignores junk and survives storage that throws", () => {
    expect(loadSettings("mute", store({ "heist.settings": "{nope" }))).toEqual(defaultsFor("mute"));
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadSettings("mute", broken)).toEqual(defaultsFor("mute"));
    expect(() => saveSettings(defaultsFor("mute"), broken)).not.toThrow();
  });
});

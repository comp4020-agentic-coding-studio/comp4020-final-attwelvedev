import { describe, expect, it } from "vitest";
import type { Role } from "../game/types.ts";
import {
  CUE_HOLD_MS,
  captionFor,
  cueCaptions,
  formatTime,
  hearCues,
  heardCues,
  lerpEntities,
  trayFor,
} from "./hud.ts";

describe("formatTime", () => {
  it("shows minutes and seconds", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(999)).toBe("0:00");
    expect(formatTime(1000)).toBe("0:01");
    expect(formatTime(102_000)).toBe("1:42");
    expect(formatTime(3_725_000)).toBe("62:05");
  });
});

describe("trayFor", () => {
  it("lists Say, Sound and Show with who receives each, from CHANNEL_RULES", () => {
    const blind = trayFor("blind");
    expect(blind.map((t) => t.label)).toEqual(["Say", "Sound", "Show"]);
    expect(blind.map((t) => t.canSend)).toEqual([true, true, true]);
    expect(blind[0]?.receivers).toEqual(["blind", "mute"]);
    expect(blind[2]?.receivers).toEqual(["deaf", "mute"]);
    expect(blind.map((t) => t.youReceive)).toEqual([true, true, false]);
  });

  it("marks a family the role can't send on, but keeps it listed", () => {
    const mute = trayFor("mute");
    expect(mute[0]).toMatchObject({ label: "Say", canSend: false, youReceive: true });
    expect(mute[1]?.canSend).toBe(true);
    const deaf = trayFor("deaf");
    expect(deaf.map((t) => t.youReceive)).toEqual([false, false, true]);
  });
});

describe("lerpEntities", () => {
  const at = (x: number, y: number) => ({
    id: "P0",
    kind: "player" as const,
    pos: { x, y },
    seat: 0 as const,
  });
  it("blends positions of entities present in both views", () => {
    const [mid] = lerpEntities([at(0, 0)], [at(0.2, 0.4)], 0.5);
    expect(mid?.pos).toEqual({ x: 0.1, y: 0.2 });
  });
  it("clamps t to [0, 1] and uses the new view for entities that have no old one", () => {
    expect(lerpEntities([at(0, 0)], [at(0.2, 0.4)], 3)[0]?.pos).toEqual({ x: 0.2, y: 0.4 });
    expect(lerpEntities([at(0, 0)], [at(0.2, 0.4)], -1)[0]?.pos).toEqual({ x: 0, y: 0 });
    expect(lerpEntities([], [at(2, 4)], 0.5)[0]?.pos).toEqual({ x: 2, y: 4 });
  });
  it("does not move a thing that jumped far (a crate pushed, a reconnect)", () => {
    expect(lerpEntities([at(0, 0)], [at(30, 0)], 0.5)[0]?.pos).toEqual({ x: 30, y: 0 });
  });
});

describe("captionFor", () => {
  const from = (role: Role, nickname = "Ana") => ({ seat: 1 as const, role, nickname });
  const at = { sentAt: 0 };

  it("gives every caption the sender's role and name, then what they said", () => {
    const callout = {
      family: "say",
      kind: "callout",
      callout: "left",
      from: from("deaf", "Bo"),
      ...at,
    } as const;
    expect(captionFor(callout)).toEqual({ role: "deaf", name: "Bo", text: "Left" });
    const text = {
      family: "say",
      kind: "text",
      text: "door east",
      from: from("blind"),
      ...at,
    } as const;
    expect(captionFor(text)).toEqual({ role: "blind", name: "Ana", text: "door east" });
    const clip = { family: "sound", clip: "airhorn", from: from("mute", "Cy"), ...at } as const;
    expect(captionFor(clip)).toEqual({ role: "mute", name: "Cy", text: "[Air horn]" });
  });

  it("writes a sound in square brackets, as captions do, and falls back to its id", () => {
    const clip = { family: "sound", clip: "not-listed", from: from("mute"), ...at } as const;
    expect(captionFor(clip)?.text).toBe("[not-listed]");
  });

  it("has no caption for faces and stamps, which are already pictures", () => {
    const face = { family: "show", kind: "face", id: "f01", from: from("blind"), ...at } as const;
    expect(captionFor(face)).toBeNull();
  });
});

describe("cueCaptions", () => {
  it("describes each sound once, with which side it came from", () => {
    const cues = [
      { kind: "footsteps", pan: -0.8, gain: 0.5 },
      { kind: "footsteps", pan: -0.5, gain: 0.4 },
      { kind: "footsteps", pan: 0.9, gain: 0.3 },
      { kind: "hum", pan: 0, gain: 1 },
      { kind: "door", pan: 0.05, gain: 0.7 },
    ] as const;
    expect(cueCaptions([...cues])).toEqual([
      "[footsteps, left]",
      "[footsteps, right]",
      "[hum]",
      "[door click, ahead]",
    ]);
  });

  it("captions the hazard cues, and names no side for team-wide ones", () => {
    const cues = [
      { kind: "guard", pan: -0.6, gain: 0.7 },
      { kind: "camera", pan: 0.5, gain: 0.5 },
      { kind: "laser", pan: 0.1, gain: 0.5 },
      { kind: "loot", pan: -0.9, gain: 1 },
      { kind: "checkpoint", pan: 0, gain: 1 },
      { kind: "caught", pan: 0, gain: 1 },
      { kind: "alarm", pan: 0, gain: 1 },
    ] as const;
    expect(cueCaptions([...cues])).toEqual([
      "[guard footsteps, left]",
      "[camera whir, right]",
      "[laser hum, ahead]",
      "[loot chime, left]",
      "[checkpoint chime]",
      "[siren]",
      "[alarm]",
    ]);
  });

  it("does not caption your own steps (you made them), but does caption a bump", () => {
    expect(cueCaptions([{ kind: "step", pan: 0, gain: 0.6 }])).toEqual([]);
    expect(cueCaptions([{ kind: "bump", pan: 0, gain: 0.8 }])).toEqual([
      "[you bump into something]",
    ]);
    expect(
      cueCaptions([
        { kind: "step", pan: 0, gain: 0.6 },
        { kind: "footsteps", pan: -0.7, gain: 0.5 },
      ]),
    ).toEqual(["[footsteps, left]"]);
  });

  it("is empty when nothing is audible", () => {
    expect(cueCaptions([])).toEqual([]);
  });
});

// A one-shot sound (the camera starting to watch, a plate click) is in a single
// 50 ms view. If captions only showed the newest view they would almost never be
// seen, so each caption is held for a moment after it was last heard.
describe("held cue captions", () => {
  it("keeps a one-tick sound on screen for a while, then lets it go", () => {
    const held = new Map<string, number>();
    hearCues(held, ["[camera whir, right]"], 1000);
    expect(heardCues(held, 1000)).toEqual(["[camera whir, right]"]);
    expect(heardCues(held, 1000 + CUE_HOLD_MS - 1)).toEqual(["[camera whir, right]"]);
    expect(heardCues(held, 1000 + CUE_HOLD_MS + 1)).toEqual([]);
  });

  it("keeps a repeated or continuous sound up for as long as it keeps coming", () => {
    const held = new Map<string, number>();
    for (let t = 0; t < 5000; t += 50) hearCues(held, ["[footsteps, left]"], t);
    expect(heardCues(held, 5000)).toEqual(["[footsteps, left]"]);
  });

  it("shows a few at once, newest last, and forgets the old ones", () => {
    const held = new Map<string, number>();
    for (const [i, w] of ["a", "b", "c", "d", "e", "f"].entries())
      hearCues(held, [`[${w}]`], 1000 + i);
    expect(heardCues(held, 1010)).toEqual(["[c]", "[d]", "[e]", "[f]"]);
    expect(held.size).toBeLessThanOrEqual(6); // old entries are dropped, not kept forever
    heardCues(held, 1000 + CUE_HOLD_MS * 3);
    expect(held.size).toBe(0);
  });
});

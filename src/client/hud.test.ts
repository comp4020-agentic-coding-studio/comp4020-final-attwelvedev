import { describe, expect, it } from "vitest";
import type { SoundCue } from "../game/perception.ts";
import type { Role } from "../game/types.ts";
import {
  CUE_HOLD_MS,
  CUE_WORD,
  captionFor,
  caughtText,
  crewChangeText,
  cueCaptions,
  dirOf,
  formatTime,
  type HeldCues,
  hearCues,
  heardCues,
  hostChangeText,
  lerpEntities,
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
      method: "callout",
      callout: "left",
      from: from("deaf", "Bo"),
      ...at,
    } as const;
    expect(captionFor(callout)).toEqual({ role: "deaf", name: "Bo", text: "Left" });
    const text = {
      method: "text",
      text: "door east",
      from: from("blind"),
      ...at,
    } as const;
    expect(captionFor(text)).toEqual({ role: "blind", name: "Ana", text: "door east" });
    const clip = { method: "clip", clip: "airhorn", from: from("mute", "Cy"), ...at } as const;
    expect(captionFor(clip)).toEqual({ role: "mute", name: "Cy", text: "[Air horn]" });
  });

  it("writes a sound in square brackets, as captions do, and falls back to its id", () => {
    const clip = { method: "clip", clip: "not-listed", from: from("mute"), ...at } as const;
    expect(captionFor(clip)?.text).toBe("[not-listed]");
  });

  it("has no caption for faces and marks, which are already pictures", () => {
    const face = { method: "face", id: "f01", from: from("blind"), ...at } as const;
    expect(captionFor(face)).toBeNull();
  });
});

describe("dirOf", () => {
  it("buckets a unit vector into eight 45 degree sectors, screen up being north", () => {
    expect(dirOf({ x: 0, y: -1 })).toBe("N");
    expect(dirOf({ x: 0.7, y: -0.7 })).toBe("NE");
    expect(dirOf({ x: 1, y: 0 })).toBe("E");
    expect(dirOf({ x: 0.7, y: 0.7 })).toBe("SE");
    expect(dirOf({ x: 0, y: 1 })).toBe("S");
    expect(dirOf({ x: -0.7, y: 0.7 })).toBe("SW");
    expect(dirOf({ x: -1, y: 0 })).toBe("W");
    expect(dirOf({ x: -0.7, y: -0.7 })).toBe("NW");
  });

  it("switches sector at 22.5 degrees either side of each direction", () => {
    const at = (deg: number) => ({
      x: Math.sin((deg * Math.PI) / 180),
      y: -Math.cos((deg * Math.PI) / 180),
    });
    expect(dirOf(at(22))).toBe("N");
    expect(dirOf(at(23))).toBe("NE");
    expect(dirOf(at(67))).toBe("NE");
    expect(dirOf(at(68))).toBe("E");
    expect(dirOf(at(-22))).toBe("N");
    expect(dirOf(at(-23))).toBe("NW");
    expect(dirOf(at(179))).toBe("S");
    expect(dirOf(at(-179))).toBe("S");
  });
});

describe("cueCaptions", () => {
  const east = { x: 1, y: 0 };
  const west = { x: -1, y: 0 };

  it("describes each sound once per direction, with the direction as data", () => {
    const cues = [
      { kind: "footsteps", pan: -0.8, gain: 0.5, dir: west },
      { kind: "footsteps", pan: -0.5, gain: 0.4, dir: west },
      { kind: "footsteps", pan: 0.9, gain: 0.3, dir: east },
      { kind: "hum", pan: 0, gain: 1 },
      { kind: "door", pan: 0.05, gain: 0.7, dir: { x: 0, y: -1 } },
    ] as const;
    expect(cueCaptions([...cues])).toEqual([
      { text: "footsteps", dir: "W" },
      { text: "footsteps", dir: "E" },
      { text: "hum", dir: null },
      { text: "door click", dir: "N" },
    ]);
  });

  it("gives team-wide sounds, the hum and a sound with no direction dir null", () => {
    const cues = [
      { kind: "checkpoint", pan: 0, gain: 1 },
      { kind: "caught", pan: 0, gain: 1 },
      { kind: "alarm", pan: 0, gain: 1 },
      { kind: "cleared", pan: 0, gain: 1 },
      { kind: "bump", pan: 0, gain: 0.8 },
      { kind: "hum", pan: 0, gain: 1 },
      { kind: "guard", pan: 0.5, gain: 0.5, dir: { x: 0, y: 1 } },
    ] as const;
    expect(cueCaptions([...cues])).toEqual([
      { text: "checkpoint chime", dir: null },
      { text: "siren", dir: null },
      { text: "alarm", dir: null },
      { text: "room cleared", dir: null },
      { text: "you bump into something", dir: null },
      { text: "hum", dir: null },
      { text: "guard footsteps", dir: "S" },
    ]);
  });

  it("never writes left, right or ahead", () => {
    const kinds = Object.keys(CUE_WORD) as SoundCue["kind"][];
    for (const kind of kinds) {
      for (const c of cueCaptions([{ kind, pan: 0.5, gain: 1, n: 2, dir: east }])) {
        expect(c.text).not.toMatch(/\b(left|right|ahead)\b/);
      }
    }
  });

  it("does not caption your own steps (you made them), but does caption a bump", () => {
    expect(cueCaptions([{ kind: "step", pan: 0, gain: 0.6 }])).toEqual([]);
    expect(cueCaptions([{ kind: "bump", pan: 0, gain: 0.8 }])).toEqual([
      { text: "you bump into something", dir: null },
    ]);
    expect(
      cueCaptions([
        { kind: "step", pan: 0, gain: 0.6 },
        { kind: "footsteps", pan: -0.7, gain: 0.5, dir: west },
      ]),
    ).toEqual([{ text: "footsteps", dir: "W" }]);
  });

  it("is empty when nothing is audible", () => {
    expect(cueCaptions([])).toEqual([]);
  });
});

// A one-shot sound (the camera starting to watch, a plate click) is in a single
// 50 ms view. If captions only showed the newest view they would almost never be
// seen, so each caption is held for a moment after it was last heard.
describe("held cue captions", () => {
  const cam = { text: "camera whir", dir: "E" } as const;

  it("keeps a one-tick sound on screen for a while, then lets it go", () => {
    const held: HeldCues = new Map();
    hearCues(held, [cam], 1000);
    expect(heardCues(held, 1000)).toEqual([cam]);
    expect(heardCues(held, 1000 + CUE_HOLD_MS - 1)).toEqual([cam]);
    expect(heardCues(held, 1000 + CUE_HOLD_MS + 1)).toEqual([]);
  });

  it("keeps a repeated or continuous sound up for as long as it keeps coming", () => {
    const held: HeldCues = new Map();
    const steps = { text: "footsteps", dir: "W" } as const;
    for (let t = 0; t < 5000; t += 50) hearCues(held, [steps], t);
    expect(heardCues(held, 5000)).toEqual([steps]);
  });

  it("holds the same sound from two directions as two captions", () => {
    const held: HeldCues = new Map();
    hearCues(
      held,
      [
        { text: "footsteps", dir: "W" },
        { text: "footsteps", dir: "E" },
      ],
      1000,
    );
    expect(heardCues(held, 1000)).toHaveLength(2);
  });

  it("shows a few at once, newest last, and forgets the old ones", () => {
    const held: HeldCues = new Map();
    for (const [i, w] of ["a", "b", "c", "d", "e", "f"].entries())
      hearCues(held, [{ text: w, dir: null }], 1000 + i);
    expect(heardCues(held, 1010).map((c) => c.text)).toEqual(["c", "d", "e", "f"]);
    expect(held.size).toBeLessThanOrEqual(6); // old entries are dropped, not kept forever
    heardCues(held, 1000 + CUE_HOLD_MS * 3);
    expect(held.size).toBe(0);
  });
});

describe("caughtText", () => {
  const crew = [{ nickname: "Ana" }, { nickname: "Bo" }, { nickname: "Cy" }];

  it("says what got whom, in words for any role", () => {
    expect(caughtText({ hazard: "laser", seat: 1, checkpoint: 0 }, crew, 0)).toBe(
      "Bo walked into a laser. Back to the start.",
    );
    expect(caughtText({ hazard: "guard", seat: 2, checkpoint: 2 }, crew, 0)).toBe(
      "The guard saw Cy. Back to checkpoint 2.",
    );
    expect(caughtText({ hazard: "camera", seat: 0, checkpoint: 1 }, crew, 1)).toBe(
      "A camera saw Ana. Back to checkpoint 1.",
    );
  });

  it("says you when it was you", () => {
    expect(caughtText({ hazard: "laser", seat: 1, checkpoint: 0 }, crew, 1)).toBe(
      "You walked into a laser. Back to the start.",
    );
    expect(caughtText({ hazard: "guard", seat: 0, checkpoint: 0 }, crew, 0)).toBe(
      "The guard saw you. Back to the start.",
    );
  });
});

describe("hostChangeText", () => {
  const none = { name: null, you: false };
  const bo = { name: "Bo", you: false };
  const ana = { name: "Ana", you: false };
  const me = { name: "Cy", you: true };

  it("says nothing the first time the host is known, or while it is the same", () => {
    expect(hostChangeText(none, bo)).toBeNull();
    expect(hostChangeText(bo, bo)).toBeNull();
    expect(hostChangeText(me, me)).toBeNull();
  });

  it("names the new host to everyone else", () => {
    expect(hostChangeText(ana, bo)).toBe("Bo is now the host.");
  });

  it("tells the new host it is them", () => {
    expect(hostChangeText(ana, me)).toBe("You are now the host.");
  });

  it("says nothing if the host is gone and nobody is yet", () => {
    expect(hostChangeText(ana, none)).toBeNull();
  });
});

describe("crewChangeText", () => {
  const person = (seat: number, nickname: string) => ({ seat, nickname, bot: false });
  const bot = (seat: number) => ({ seat, nickname: `Bot ${seat}`, bot: true });

  it("says a person left and a bot took their seat", () => {
    expect(
      crewChangeText(
        [person(0, "Ana"), person(1, "Bo"), person(2, "Cy")],
        [person(0, "Ana"), person(1, "Bo"), bot(2)],
      ),
    ).toBe("Cy left the game. A bot took their seat.");
  });

  it("says a person is back when they take their seat from a bot", () => {
    expect(
      crewChangeText(
        [person(0, "Ana"), person(1, "Bo"), bot(2)],
        [person(0, "Ana"), person(1, "Bo"), person(2, "Cy")],
      ),
    ).toBe("Cy is back.");
  });

  it("says nothing when the crew is the same", () => {
    const crew = [person(0, "Ana"), person(1, "Bo"), bot(2)];
    expect(crewChangeText(crew, crew)).toBeNull();
  });
});

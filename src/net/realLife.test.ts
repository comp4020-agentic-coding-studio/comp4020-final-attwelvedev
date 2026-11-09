import { describe, expect, it } from "vitest";
import type { Role } from "../game/types.ts";
import { DEFAULT_SETUP, type Setup } from "./lobbies.ts";
import { realLifeFor } from "./realLife.ts";

const setup = (over: Partial<Setup> = {}): Setup => ({ ...DEFAULT_SETUP, ...over });
const remote = setup({ inRoom: false });
const together = setup({ inRoom: true });
const crewOf = (...s: Setup[]) => s;

describe("realLifeFor: masking noise", () => {
  it("is for Can't hear with headphones, and nobody else", () => {
    expect(realLifeFor("deaf", setup({ headphones: true }), crewOf(remote)).maskNoise).toBe(true);
    expect(realLifeFor("deaf", setup({ headphones: false }), crewOf(remote)).maskNoise).toBe(false);
    for (const role of ["blind", "mute"] as Role[]) {
      expect(realLifeFor(role, setup({ headphones: true }), crewOf(remote)).maskNoise).toBe(false);
    }
  });
});

describe("realLifeFor: sound off and captions", () => {
  it.each(["blind", "mute"] as Role[])(
    "%s without headphones, in the room with others, gets captions instead of game sound",
    (role) => {
      const me = setup({ inRoom: true, headphones: false });
      const r = realLifeFor(role, me, crewOf(me, together));
      expect(r.soundOff).toBe(true);
      expect(r.captions).toBe(true);
    },
  );

  it.each(["blind", "mute"] as Role[])(
    "%s with headphones keeps sound, and captions only if they asked",
    (role) => {
      expect(realLifeFor(role, setup({ headphones: true }), crewOf(remote))).toMatchObject({
        soundOff: false,
        captions: false,
      });
      expect(
        realLifeFor(role, setup({ headphones: true, captions: true }), crewOf(remote)).captions,
      ).toBe(true);
    },
  );

  it("Can't hear is never given sound or captions to switch", () => {
    for (const headphones of [true, false]) {
      for (const captions of [true, false]) {
        const r = realLifeFor("deaf", setup({ headphones, captions }), crewOf(remote));
        expect(r.soundOff).toBe(false);
        expect(r.captions).toBe(false);
      }
    }
  });
});

describe("realLifeFor: remote players keep game sound", () => {
  it.each(["blind", "mute"] as Role[])(
    "%s, remote and without headphones, keeps game sound, with captions only if they asked",
    (role) => {
      expect(
        realLifeFor(role, setup({ inRoom: false, headphones: false }), crewOf(remote)),
      ).toMatchObject({
        soundOff: false,
        captions: false,
      });
      expect(
        realLifeFor(
          role,
          setup({ inRoom: false, headphones: false, captions: true }),
          crewOf(remote),
        ).captions,
      ).toBe(true);
    },
  );

  it("a hearing role without headphones, in the room with two others, gets captions instead", () => {
    const me = setup({ inRoom: true, headphones: false });
    expect(realLifeFor("blind", me, crewOf(me, together, together)).soundOff).toBe(true);
  });
});

describe("realLifeFor: masking noise default", () => {
  it("starts off for a remote Can't hear, and on in the room with company", () => {
    const me = setup({ inRoom: false, headphones: true });
    expect(realLifeFor("deaf", me, crewOf(me, remote, remote))).toMatchObject({
      maskNoise: true,
      maskDefault: false,
    });
    const there = setup({ inRoom: true, headphones: true });
    expect(realLifeFor("deaf", there, crewOf(there, together, together))).toMatchObject({
      maskNoise: true,
      maskDefault: true,
    });
  });
});

describe("realLifeFor: in-app voice", () => {
  it("is on unless the whole crew is in one room", () => {
    expect(realLifeFor("blind", together, crewOf(together, together, together)).voice).toBe(false);
    expect(realLifeFor("blind", together, crewOf(together, together, remote)).voice).toBe(true);
    expect(realLifeFor("blind", remote, crewOf(remote, remote, remote)).voice).toBe(true);
  });

  it("is the same for everyone in the crew, however each of them answered", () => {
    const crew = crewOf(together, together, together);
    for (const role of ["blind", "deaf", "mute"] as Role[]) {
      expect(realLifeFor(role, together, crew).voice).toBe(false);
    }
  });
});

describe("realLifeFor: lines", () => {
  it("has none for someone who is remote", () => {
    for (const role of ["blind", "deaf", "mute"] as Role[]) {
      expect(
        realLifeFor(role, setup({ inRoom: false, mask: true, earplugs: true }), crewOf(remote))
          .lines,
      ).toEqual([]);
    }
  });

  it("has none for someone who says they are in the room when no one else in the crew is", () => {
    for (const role of ["blind", "deaf", "mute"] as Role[]) {
      expect(realLifeFor(role, together, crewOf(together, remote, remote)).lines).toEqual([]);
    }
  });

  it("tells Can't hear to put earplugs in, or else to wear headphones, or else to ask for quiet", () => {
    const lines = (over: Partial<Setup>) =>
      realLifeFor("deaf", setup({ inRoom: true, ...over }), crewOf(together, together)).lines;
    expect(lines({ earplugs: true, headphones: true })).toEqual([
      "Earplugs in now.",
      "Sit where you can't see the others' mouths, so you can't lip-read.",
    ]);
    expect(lines({ earplugs: false, headphones: true })).toEqual([
      "No earplugs? Headphones on with the noise playing.",
      "Sit where you can't see the others' mouths, so you can't lip-read.",
    ]);
    expect(lines({ earplugs: false, headphones: false })).toEqual([
      "No earplugs or headphones: ask the others to keep the table quiet near you.",
      "Sit where you can't see the others' mouths, so you can't lip-read.",
    ]);
  });

  it("tells Can't see to put the mask on and find the keys, or else to keep their eyes on their own screen", () => {
    const lines = (mask: boolean) =>
      realLifeFor("blind", setup({ inRoom: true, mask }), crewOf(together, together)).lines;
    expect(lines(true)).toEqual(["Mask on. Find WASD and Space first."]);
    expect(lines(false)).toEqual(["Keep your eyes on your own screen."]);
  });

  it("tells Can't speak not to mouth words or point at screens", () => {
    expect(realLifeFor("mute", together, crewOf(together, together)).lines).toEqual([
      "Don't mouth words or point at screens. Waving and miming are fine.",
    ]);
  });
});

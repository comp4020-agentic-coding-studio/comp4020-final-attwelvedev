import { type Setup, sharesRoom } from "../game/setup.ts";
import type { Role } from "../game/types.ts";

// What a person's own answers and this room's role mean for how they play and what the reveal
// tells them (ADR 0013). Recomputed every room, since roles rotate. Pure.
export interface RealLife {
  maskNoise: boolean; // Can't hear with headphones: masking noise can play
  maskDefault: boolean; // masking noise starts on: only in the room with company, where others' talk leaks in
  soundOff: boolean; // a hearing role without headphones, in the room with others: captions instead of game sound
  captions: boolean; // captions are on for this person (not for Can't hear)
  voice: boolean; // in-app voice is on for this person
  lines: string[]; // the reveal's real-life lines for this role and setup
}

export function realLifeFor(role: Role, me: Setup, crew: readonly Setup[]): RealLife {
  // remote: not sitting with anyone, so game sound from a speaker bothers nobody and gives nothing away
  const remote = !(me.inRoom && sharesRoom(crew));
  const soundOff = role !== "deaf" && !me.headphones && !remote;
  return {
    maskNoise: role === "deaf" && me.headphones,
    maskDefault: !remote,
    soundOff,
    captions: role !== "deaf" && (me.captions || soundOff),
    // in-app voice goes off only when the whole crew is in one room
    voice: !(me.inRoom && crew.every((s) => s.inRoom)),
    lines: remote ? [] : linesFor(role, me),
  };
}

function linesFor(role: Role, me: Setup): string[] {
  if (role === "deaf") {
    return [
      me.earplugs
        ? "Earplugs in now."
        : me.headphones
          ? "No earplugs? Headphones on with the noise playing."
          : "No earplugs or headphones: ask the others to keep the table quiet near you.",
      "Sit where you can't see the others' mouths, so you can't lip-read.",
    ];
  }
  if (role === "blind") {
    return [me.mask ? "Mask on. Find WASD and Space first." : "Keep your eyes on your own screen."];
  }
  return ["Don't mouth words or point at screens. Waving and miming are fine."];
}

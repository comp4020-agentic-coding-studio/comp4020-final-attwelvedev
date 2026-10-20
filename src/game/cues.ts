import type { Room } from "./rooms/format.ts";

// The sounds Can't see should learn before a room, in the order the reveal lists them: the
// hazards that carry a sound, then a plate's hum and a door's click. Only what the room has.
export type BriefingCue = "camera" | "laser" | "guard" | "hum" | "door";

const ORDER: readonly { cue: BriefingCue; kind: Room["objects"][number]["kind"] }[] = [
  { cue: "camera", kind: "camera" },
  { cue: "laser", kind: "laser" },
  { cue: "guard", kind: "guard" },
  { cue: "hum", kind: "plate" },
  { cue: "door", kind: "door" },
];

export const cuesIn = (room: Room): BriefingCue[] =>
  ORDER.filter(({ kind }) => room.objects.some((o) => o.kind === kind)).map(({ cue }) => cue);

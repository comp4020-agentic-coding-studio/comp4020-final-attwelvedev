import type { Room } from "./rooms/format.ts";

// The sounds Can't see should learn before a room, in the order the reveal lists them: the
// hazards that carry a sound, a plate's hum and a door's click, then the stations' own (a dial's
// tick and the tumbler at its back, a radio's static) and the bell. Only what the room has.
export type BriefingCue =
  | "camera"
  | "laser"
  | "guard"
  | "hum"
  | "door"
  | "tick"
  | "tumbler"
  | "static"
  | "bell";

type RoomObject = Room["objects"][number];
const ORDER: readonly { cue: BriefingCue; has: (o: RoomObject) => boolean }[] = [
  { cue: "camera", has: (o) => o.kind === "camera" },
  { cue: "laser", has: (o) => o.kind === "laser" },
  { cue: "guard", has: (o) => o.kind === "guard" },
  { cue: "hum", has: (o) => o.kind === "plate" },
  { cue: "door", has: (o) => o.kind === "door" },
  { cue: "tick", has: (o) => o.kind === "station" && o.params?.type === "dial" },
  { cue: "tumbler", has: (o) => o.kind === "station" && o.params?.type === "dial" },
  { cue: "static", has: (o) => o.kind === "station" && o.params?.type === "radio" },
  { cue: "bell", has: (o) => o.kind === "bell" },
];

export const cuesIn = (room: Room): BriefingCue[] =>
  ORDER.filter(({ has }) => room.objects.some(has)).map(({ cue }) => cue);

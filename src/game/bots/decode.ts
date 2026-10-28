import type { ChannelMessage } from "../channels.ts";
import type { RoleView } from "../perception.ts";
import type { RoomObject } from "../rooms/format.ts";
import { stationParts } from "../sim/stations.ts";
import type { StationType } from "../sim/world.ts";
import type { Vec } from "../types.ts";

// What a bot has worked out about one station (clues FR5), from its own view and what teammates
// send it, never from the simulation. A station type's decoder (phases 05 to 10) turns this into
// the answer, position by position.
export interface StationBelief {
  answer: (number | null)[]; // what this bot has worked out of the answer so far
  solved: boolean; // seen solved, or heard "solved"
  told: Set<number>; // positions it has passed on
  shows: number[]; // what the station showed when last in sight (stations.ts: stationShows)
  marked: Vec[]; // part tiles a teammate put an `x` mark on: "press this"
  numbers: number[]; // one-digit texts received, in order
}

export type Decoder = (
  view: RoleView,
  inbox: ChannelMessage[],
  belief: StationBelief,
  o: RoomObject,
  now: number,
) => void;

// One decoder per station type, added with the room that first needs it. A bot does not work a
// station whose type has none.
export const DECODERS: Partial<Record<StationType, Decoder>> = {};

export const emptyBelief = (): StationBelief => ({
  answer: [],
  solved: false,
  told: new Set(),
  shows: [],
  marked: [],
  numbers: [],
});

// The only text a bot reads (P3): a single digit.
export function readNumber(text: string): number | null {
  return /^\d$/.test(text.trim()) ? Number(text.trim()) : null;
}

const same = (a: Vec, b: Vec) => a.x === b.x && a.y === b.y;

// The belief after this tick: `prior` updated with the station as seen (if it is in sight), the
// `x` marks on its parts and the digits received. Solved stays solved.
export function beliefFrom(
  view: RoleView,
  inbox: ChannelMessage[],
  o: RoomObject,
  prior: StationBelief,
): StationBelief {
  const b: StationBelief = {
    ...prior,
    told: new Set(prior.told),
    marked: [...prior.marked],
    numbers: [...prior.numbers],
  };
  const e = view.entities.find((x) => x.id === o.id && x.kind === "station");
  if (e?.station) {
    if (e.station.solved) b.solved = true;
    if (!e.station.furniture) b.shows = [...e.station.shows];
  }
  const parts = stationParts(o)
    .filter((p) => p.key !== "anchor" || o.params?.type === "dial" || o.params?.type === "vault")
    .flatMap((p) => p.at);
  for (const m of inbox) {
    if (m.method === "mark" && m.id === "x") {
      const tile = { x: Math.floor(m.at.x), y: Math.floor(m.at.y) };
      if (parts.some((t) => same(t, tile)) && !b.marked.some((t) => same(t, tile)))
        b.marked.push(tile);
    } else if (m.method === "text") {
      const n = readNumber(m.text);
      if (n !== null) b.numbers.push(n);
    }
  }
  return b;
}

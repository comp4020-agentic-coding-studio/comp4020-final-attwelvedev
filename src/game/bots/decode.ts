import type { ChannelMessage } from "../channels.ts";
import type { RoleView } from "../perception.ts";
import type { RoomObject } from "../rooms/format.ts";
import { NOTE_TICKS, stationParts, tilesOf, WIRE_RULES } from "../sim/stations.ts";
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
  changedAt: number; // the tick `shows` last changed while in sight (a dial's turner waits on it)
  rule: number | null; // a wire panel's plaque, read: which of WIRE_RULES it says
  heard: { tick: number; n: number }[]; // a keypad's code notes heard (n: the key), latest last
}

export type Decoder = (
  view: RoleView,
  inbox: ChannelMessage[],
  belief: StationBelief,
  o: RoomObject,
  now: number,
) => void;

export const emptyBelief = (): StationBelief => ({
  answer: [],
  solved: false,
  told: new Set(),
  shows: [],
  marked: [],
  numbers: [],
  changedAt: Number.NEGATIVE_INFINITY,
  rule: null,
  heard: [],
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
    heard: [...prior.heard],
  };
  const e = view.entities.find((x) => x.id === o.id && x.kind === "station");
  if (e?.station) {
    if (e.station.solved) b.solved = true;
    if (!e.station.furniture) {
      if (e.station.shows.join() !== prior.shows.join()) {
        b.changedAt = view.tick;
        if (prior.shows.length > 0 && o.params?.type === "wires") b.rule = null; // drawn again
      }
      b.shows = [...e.station.shows];
    }
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

// --- The safe (dial) ------------------------------------------------------------------------
// A teaching safe's lamp (shows[1]) lights while the dial sits on its number: a sighted turner
// reads it itself. A real safe's number is heard, not seen: the tumbler reaches only a hearing
// holder of the stethoscope at the safe's back. Can't see, holding it there, says "stop" (a
// callout, which Can't speak receives): the dial is on the number now.
export const TURN_WAIT_TICKS = 8; // after a turn the turner waits this long for the listener's word

const dial: Decoder = (_view, inbox, b, o) => {
  if (o.params?.teach === true) {
    if (b.shows.length === 2) b.answer = [b.shows[1] === 1 ? (b.shows[0] as number) : null];
    return;
  }
  const pos = b.shows.length - 1;
  const setting = b.shows[pos];
  if (setting === undefined) return;
  const word = inbox.some(
    (m) => m.method === "callout" && m.callout === "stop" && m.from.role === "blind",
  );
  // the digits entered so far are on the face; the one being searched for is what was heard
  const answer: (number | null)[] = [...b.shows.slice(0, pos), b.answer[pos] ?? null];
  if (word) answer[pos] = setting;
  b.answer = answer;
};

// Where a safe's turner stands next: on the face to enter the number once the dial is on it, else
// on the right-hand pad to turn it a notch. Null when the safe has no pads.
export function dialStep(o: RoomObject, b: StationBelief): Vec | null {
  const teach = o.params?.teach === true;
  const pos = teach ? 0 : b.shows.length - 1;
  const setting = b.shows[teach ? 0 : pos];
  const want = b.answer[pos];
  if (want !== null && want !== undefined && want === setting) return o.tiles[0] as Vec;
  return tilesOf(o.params?.pads)[1] ?? null;
}

// --- Wires and their plaque -------------------------------------------------------------------
// A sighted bot reads the plaque (a sign whose text is one of the rules) and sees the wires'
// colours, and applies the rule it read, as a person would. Wires seen to change colour (a panel
// drawn again after a wrong cut) make the rule read before stale: beliefFrom forgets it.
const wires: Decoder = (view, _inbox, b, o) => {
  const plaque = view.entities.find((e) => e.id === o.params?.plaque && e.text);
  const read = plaque ? WIRE_RULES.findIndex((r) => r.text === plaque.text) : -1;
  if (read >= 0) b.rule = read;
  const cut = b.rule === null || b.shows.length === 0 ? null : WIRE_RULES[b.rule]?.cut(b.shows);
  b.answer = [cut ?? null];
};

// --- The keypad -------------------------------------------------------------------------------
// Its code plays at its clue, one note a key (a `clue` chime with n = key + 1), every note
// NOTE_TICKS after the last, then a pause. A hearing bot takes the code once it has heard the same
// whole tune twice running: the first may have been caught half-way through.
const keypad: Decoder = (view, _inbox, b, _o, now) => {
  for (const s of view.sounds)
    if (s.kind === "clue" && s.n !== undefined) b.heard.push({ tick: view.tick, n: s.n - 1 });
  const tunes: number[][] = [];
  b.heard.forEach((h, i) => {
    const before = b.heard[i - 1];
    if (!before || h.tick - before.tick > NOTE_TICKS) tunes.push([]);
    tunes.at(-1)?.push(h.n);
  });
  const last = b.heard.at(-1);
  if (last && now - last.tick <= NOTE_TICKS) tunes.pop(); // still playing
  const [a, c] = tunes.slice(-2);
  if (a && c && a.join() === c.join()) b.answer = [...c];
  b.heard = b.heard.slice(-12);
};

// The keypad key to press next: the code's next note after the keys already entered (seen on the
// pad), once the code is known.
export function keypadStep(o: RoomObject, b: StationBelief): Vec | null {
  const key = b.answer[b.shows.length];
  if (key === null || key === undefined) return null;
  return tilesOf(o.params?.keys)[key] ?? null;
}

// One decoder per station type, added with the room that first needs it. A bot does not work a
// station whose type has none.
export const DECODERS: Partial<Record<StationType, Decoder>> = { dial, wires, keypad };

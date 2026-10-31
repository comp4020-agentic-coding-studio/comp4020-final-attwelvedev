import type { ChannelMessage } from "../channels.ts";
import type { RoleView } from "../perception.ts";
import type { Room, RoomObject } from "../rooms/format.ts";
import { CHIME_TICKS, GROUP_GAP_TICKS, TUNE_PAUSE_TICKS } from "../sim/chimes.ts";
import { stationParts, tilesOf, toggled, WIRE_RULES } from "../sim/stations.ts";
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
  shownAt: number; // the tick the station's state was last in sight
  card: number[] | null; // a switches station's target card, read where it stands
  fed: number | null; // a keypad slot's digit, from the radio with the same motif (as worked out)
  used: number; // how many of `marked` this bot has pressed (switches: one press a mark)
  symbols: Partial<Record<string, number>>; // a vault: each solved wing's symbol, by its motif
  order: string[] | null; // a vault's order clue, read: the wings' motifs in socket order
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
  shownAt: Number.NEGATIVE_INFINITY,
  card: null,
  fed: null,
  used: 0,
  symbols: {},
  order: null,
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
    symbols: { ...prior.symbols },
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
      b.shownAt = view.tick;
    }
  }
  const parts = stationParts(o)
    .filter((p) => p.key !== "anchor" || o.params?.type === "dial" || o.params?.type === "vault")
    .flatMap((p) => p.at);
  // switches and bells take their marks as a queue, one press a mark (a part may be marked again)
  const queue = o.params?.type === "switches" || o.params?.type === "bells";
  for (const m of inbox) {
    if (m.method === "mark" && m.id === "x") {
      const tile = { x: Math.floor(m.at.x), y: Math.floor(m.at.y) };
      if (parts.some((t) => same(t, tile)) && (queue || !b.marked.some((t) => same(t, tile))))
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
// Its code plays at its clue as groups of chimes, one group a key (a `clue` cue with n = key + 1 on
// the group's first chime), a gap between groups, then a longer pause before the tune starts again.
// A hearing bot takes the code once it has heard the same whole tune twice running: the first may
// have been caught half-way through. A slot fed by a radio
// (clues FR3) rests in the tune: its key is the radio's digit d (key d, the (d - 1)th), worked out
// by this bot or sent to it as text.
// From a group's first chime to the next group's: the group's own length (note chimes after the
// first), a gap, and a rest's second gap. A new tune starts the pause later instead. Both depend on
// the group just heard, so the line between "same tune" and "new tune" is drawn from that group's
// note: halfway between the longest same-tune gap (a rest) and the new-tune gap.
const sameTuneMax = (note: number) => note * CHIME_TICKS + 2 * GROUP_GAP_TICKS;
const newTuneFrom = (note: number) => note * CHIME_TICKS + TUNE_PAUSE_TICKS;
const tuneBreak = (note: number) => Math.round((sameTuneMax(note) + newTuneFrom(note)) / 2);

export function slotOf(o: RoomObject): number | null {
  const slot = o.params?.slot as { at?: unknown } | undefined;
  return typeof slot?.at === "number" ? slot.at : null;
}

// The tune last heard twice running in `heard` (one entry a group, at the tick its first chime
// sounded; groups at most TUNE_GAP apart, tunes a longer pause apart), or null: the first may have
// been caught half-way through, and one still playing is not over.
export function tuneOf(heard: { tick: number; n: number }[], now: number): number[] | null {
  const tunes: number[][] = [];
  heard.forEach((h, i) => {
    const before = heard[i - 1];
    if (!before || h.tick - before.tick > tuneBreak(before.n)) tunes.push([]);
    tunes.at(-1)?.push(h.n);
  });
  const last = heard.at(-1);
  if (last && now - last.tick <= tuneBreak(last.n)) tunes.pop(); // still playing
  const [a, c] = tunes.slice(-2);
  return a && c && a.join() === c.join() ? c : null;
}

// A keypad whose clue is gear (an id `g<n>`, rooms/format.ts) is the earpiece's: only its holder
// hears the code, and Can't see, who holds it, texts it a digit a key (earStep). The keypad's
// presser takes the code from the last digits it was sent.
const KEYPAD_LENGTH = (o: RoomObject) =>
  Math.max(3, Math.min(4, typeof o.params?.length === "number" ? o.params.length : 3));

const keypad: Decoder = (view, _inbox, b, o, now) => {
  if (String(o.params?.clue ?? "").startsWith("g")) {
    const len = KEYPAD_LENGTH(o);
    if (b.numbers.length >= len) b.answer = b.numbers.slice(-len).map((d) => d - 1);
    return;
  }
  for (const s of view.sounds)
    if (s.kind === "clue" && s.n !== undefined) b.heard.push({ tick: view.tick, n: s.n - 1 });
  const tune = tuneOf(b.heard, now);
  const slot = slotOf(o);
  if (tune) {
    const code: (number | null)[] = [...tune];
    if (slot !== null) code.splice(slot, 0, null);
    b.answer = code;
  }
  if (slot !== null && b.answer.length > slot) {
    const d = b.fed ?? b.numbers.at(-1);
    b.answer[slot] = d === undefined || d === null ? null : d - 1;
  }
  b.heard = b.heard.slice(-12);
};

// The keypad key to press next: the code's next note after the keys already entered (seen on the
// pad), once the code is known.
export function keypadStep(o: RoomObject, b: StationBelief): Vec | null {
  const key = b.answer[b.shows.length];
  if (key === null || key === undefined) return null;
  return tilesOf(o.params?.keys)[key] ?? null;
}

// Whether a sound heard came from `at`, by its direction (loosely within a tile and a half): two
// stations sounding in one room are told apart by where each sound comes from.
function fromTile(view: RoleView, s: { dir?: Vec }, at: Vec): boolean {
  const me = view.you.pos;
  if (!me) return false;
  const to = { x: at.x + 0.5 - me.x, y: at.y + 0.5 - me.y };
  const d = Math.hypot(to.x, to.y);
  if (s.dir === undefined || d < 0.01) return d < 1.5; // on its tile: no direction to tell by
  return (s.dir.x * to.x + s.dir.y * to.y) / d > (d < 1.5 ? 0.5 : 0.9);
}

// --- The radio --------------------------------------------------------------------------------
// Turned until it is tuned (seen solved, or its static heard giving way to a tone); a turn is never a
// wrong answer, so the turner searches. Once tuned, every PIP_TICKS it gives its digit: on its face
// for the sighted (shows[1]) and as `n` pips for hearers, from where it stands.
const radio: Decoder = (view, _inbox, b, o) => {
  if (b.shows.length === 2) b.answer = [b.shows[1] as number];
  for (const s of view.sounds)
    if (s.kind === "pip" && s.n !== undefined && fromTile(view, s, o.tiles[0] as Vec))
      b.answer = [s.n];
};

// The pip count of a radio, once known, is sent as a digit by a seat that can text it to the one at
// the keypad (P3); a radio whose digit feeds nothing is never told.
export function radioToTell(o: RoomObject, b: StationBelief): number | null {
  const d = b.answer[0];
  if (o.params?.type !== "radio" || typeof o.params.yields !== "string") return null;
  return d === null || d === undefined || b.told.has(0) ? null : d;
}

// --- Switches, their lamps and the target card -------------------------------------------------
// The card (lit and hollow lamps) is read where it stands and remembered; the lamps are behind
// glass elsewhere. With both, the buttons that turn the lamps into the card are a lights-out
// search; a bot that sees the lamps now presses (or marks) the first of them.
export function lightsOut(lamps: number[], target: number[], cols: number): number[] | null {
  const n = lamps.length;
  let best: number[] | null = null;
  for (let mask = 0; mask < 1 << n; mask++) {
    const set = Array.from({ length: n }, (_, i) => i).filter((i) => mask & (1 << i));
    if (best && set.length >= best.length) continue;
    let at = lamps;
    for (const i of set) at = toggled(at, i, cols);
    if (at.join() === target.join()) best = set;
  }
  return best;
}

export const colsOf = (o: RoomObject): number =>
  typeof o.params?.cols === "number" ? o.params.cols : 3;

// The buttons still to press from the lamps as seen this tick, or null while the lamps or the card
// are not known.
export function switchesLeft(o: RoomObject, b: StationBelief, tick: number): number[] | null {
  if (b.shownAt !== tick || !b.card || b.shows.length !== b.card.length) return null;
  return lightsOut(b.shows, b.card, colsOf(o));
}

const switches: Decoder = (view, _inbox, b, o) => {
  b.answer = [switchesLeft(o, b, view.tick)?.[0] ?? null];
};

// --- The music box (bells) ----------------------------------------------------------------------
// Its tune plays at its tune box, one bell a note (a `bellnote` with n = the bell), then a pause;
// no bell lights as it plays, so the tune is learnt by ear, the same tune twice running. The box
// stands behind glass from its bells: who hears it strikes the bells after walking round, or marks
// them in order (an `x` each) for a striker, who strikes the marks as a queue. A tune once learnt
// is kept: the bot's own strikes ring the same bells.
const tuneLength = (o: RoomObject) => (o.params?.teach === true ? 2 : 4);

const bells: Decoder = (view, _inbox, b, o, now) => {
  if (b.answer.length === tuneLength(o) && b.answer.every((n) => n !== null)) return;
  const box =
    (Array.isArray(o.params?.tune) ? tilesOf([o.params.tune])[0] : undefined) ?? o.tiles[0];
  for (const s of view.sounds)
    if (s.kind === "bellnote" && s.n !== undefined && box && fromTile(view, s, box))
      b.heard.push({ tick: view.tick, n: s.n });
  const tune = tuneOf(b.heard, now);
  if (tune && tune.length === tuneLength(o)) b.answer = [...tune];
  b.heard = b.heard.slice(-12);
};

// The bell to strike next: the tune's next note after the bells struck so far (seen, through the
// glass or beside them), or the next bell a teammate marked.
export function bellsStep(o: RoomObject, b: StationBelief): Vec | null {
  const tiles = tilesOf(o.params?.bells);
  const own = b.answer[Math.max(0, b.shows.length - 1)];
  if (b.answer.length > 0) return own === null || own === undefined ? null : (tiles[own] ?? null);
  return b.marked[b.used] ?? null;
}

// The bell a marker at the tune box marks next, once it knows the tune: the first note not yet
// marked. Null when the whole tune is marked or not yet known.
export function bellToMark(o: RoomObject, b: StationBelief): { i: number; at: Vec } | null {
  if (b.answer.length !== tuneLength(o) || b.answer.some((n) => n === null)) return null;
  const i = b.answer.findIndex((_, k) => !b.told.has(k));
  const at = i >= 0 ? tilesOf(o.params?.bells)[b.answer[i] as number] : undefined;
  return at ? { i, at } : null;
}

// --- The earpiece -----------------------------------------------------------------------------
// Only its holder hears it: the keypad's code as a tune, one key a note (n = the key). Once Can't
// see has heard the same tune twice it tells the code, key n as the digit n + 1, one text a key;
// a code is told once (a new one after a send-back is told again).
export interface Ear {
  heard: { tick: number; n: number }[];
  told: string | null;
}
export const emptyEar = (): Ear => ({ heard: [], told: null });

export function earStep(view: RoleView, ear: Ear): number[] {
  if (view.gear !== "earpiece") return [];
  for (const s of view.sounds)
    if (s.kind === "earpiece" && s.n !== undefined) ear.heard.push({ tick: view.tick, n: s.n });
  ear.heard = ear.heard.slice(-12);
  const tune = tuneOf(ear.heard, view.tick);
  if (!tune || tune.join() === ear.told) return [];
  ear.told = tune.join();
  return tune.map((k) => k + 1);
}

// --- The vault -------------------------------------------------------------------------------
// Each wing, once solved, shows a symbol beside its motif (`reveal`); the vault's order clue shows
// the wings' motifs in socket order. A sighted bot remembers every revealed symbol it sees, by its
// motif (never by which station it is), reads the order clue, and so knows each socket's symbol.
const vault: Decoder = (view, _inbox, b, o) => {
  for (const e of view.entities)
    if (e.kind === "station" && e.station?.reveal !== undefined && e.station.motif)
      b.symbols[e.station.motif] = e.station.reveal;
  const clue = view.entities.find((e) => e.kind === "order" && e.id === o.params?.symbols);
  if (clue?.motifs && clue.motifs.length > 0) b.order = [...clue.motifs];
  b.answer = b.order ? b.order.map((m) => b.symbols[m] ?? null) : [];
};

// Where a vault's worker stands next: the first socket whose symbol (as seen) is not yet the one
// worked out (each Act steps it on one), then the handle once every socket shows its symbol. Null
// until every socket's symbol is known: it never turns a socket on a guess.
export function vaultStep(o: RoomObject, b: StationBelief): Vec | null {
  const sockets = tilesOf(o.params?.sockets);
  if (b.answer.length !== sockets.length || b.answer.some((v) => v === null)) return null;
  if (b.shows.length !== sockets.length) return sockets[0] ?? null; // go and look at them
  const i = b.answer.findIndex((v, k) => b.shows[k] !== v);
  return i < 0 ? (o.tiles[0] as Vec) : (sockets[i] ?? null);
}

// --- The sync lock ----------------------------------------------------------------------------
// Its keys must be turned together, too far apart for one body. It has no secret: the key holders
// agree on the moment. One who can text counts down ("3", "2", "1", COUNT_TICKS apart) once it sees
// every key stood on, and turns on its "1"; the others turn when they read the "1". A miss starts
// the count again after a pause.
export const COUNT_TICKS = 10;
const RECOUNT_TICKS = 60;
export interface Count {
  n: number; // the digit last said
  at: number; // the tick it was said
}

// What the counter says this tick (a digit, or nothing) and its count after: a count starts only
// once every key is stood on, and a stale one (the "1" said long ago, the lock still shut) restarts.
export function countStep(
  count: Count | null,
  ready: boolean,
  tick: number,
): { say: number | null; count: Count | null } {
  if (count && count.n === 1 && tick - count.at < RECOUNT_TICKS) return { say: null, count };
  if (count && count.n > 1) {
    if (tick - count.at < COUNT_TICKS) return { say: null, count };
    return { say: count.n - 1, count: { n: count.n - 1, at: tick } };
  }
  return ready ? { say: 3, count: { n: 3, at: tick } } : { say: null, count: null };
}

// A key holder who reads the count: the digits texted to it, with when they came.
const sync: Decoder = (view, inbox, b) => {
  for (const m of inbox) {
    const n = m.method === "text" ? readNumber(m.text) : null;
    if (n !== null) b.heard.push({ tick: view.tick, n });
  }
  b.heard = b.heard.slice(-6);
};

// Whether a key holder who reads the count turns now: a "1" came in the last few ticks.
export function syncGo(b: StationBelief, tick: number): boolean {
  const last = b.heard.at(-1);
  return last?.n === 1 && tick - last.tick <= 4;
}

// What a station learns from another object of the room (what the bot holds of the room's static
// plan says which): a switches station's card, read where it stands; a keypad slot's digit, from
// the radio drawn with the same motif.
export function linkedFrom(room: Room, view: RoleView, stations: Record<string, StationBelief>) {
  for (const o of room.objects) {
    const b = stations[o.id];
    if (o.kind !== "station" || !b) continue;
    if (o.params?.type === "switches") {
      const cards = room.objects.filter((c) => c.kind === "card" && c.params?.of === o.id);
      const seen = view.entities.find((e) => e.kind === "card" && cards.some((c) => c.id === e.id));
      if (seen?.card) b.card = [...seen.card];
    }
    if (slotOf(o) !== null) {
      const from = room.objects.find(
        (r) =>
          r.kind === "station" && r.params?.type === "radio" && r.params.motif === o.params?.motif,
      );
      const d = from ? stations[from.id]?.answer[0] : undefined;
      if (d !== undefined && d !== null) b.fed = d;
    }
  }
}

// One decoder per station type, added with the room that first needs it. A bot does not work a
// station whose type has none.
export const DECODERS: Partial<Record<StationType, Decoder>> = {
  dial,
  wires,
  keypad,
  radio,
  switches,
  bells,
  vault,
  sync,
};

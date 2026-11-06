// Stations (spec FR5-FR14): puzzles worked by standing on a tile and pressing Act. Pure: the
// answers come from a seeded generator, and a wrong answer is reported to `step`, which sends the
// team back (FR15). Each type's parts are tiles named in the station's metadata.
import { cacheOf, type RoomObject, secretDoors } from "../rooms/format.ts";
import type { Seat, Vec } from "../types.ts";
import { platePart } from "./braille.ts";
import { syncCacheDoors, takeKeepsake } from "./cache.ts";
import { groupStartingOn, restStartingOn, tuneGroups } from "./chimes.ts";
import { rng } from "./rng.ts";
import { type StationState, type StationType, TICK_MS, type World } from "./world.ts";

export const DYE_MS = 1200; // the splatter shows this long before the reset is complete
export const SYMBOLS = 6; // a vault socket steps through this many symbols
export const WIRE_COLOURS = ["red", "blue", "yellow", "green", "white", "black"] as const;
const RED = 0;
const BLUE = 1;
const YELLOW = 2;
const WHITE = 4;

// The rule plaque (FR8): the first rule that applies to the wires names the one to cut. The last
// always applies, so every set of colours has an answer.
// From room 04 on a plaque shows one of a rule's `riddles` instead of its plain `text` (FR11).
export const WIRE_RULES: {
  text: string;
  riddles: readonly string[];
  cut: (c: number[]) => number | null;
}[] = [
  {
    text: "No red wires: cut the second wire.",
    riddles: [
      "Where no blood runs, the second falls.",
      "No crimson in the bundle? The second one parts.",
      "Bare of red, the bundle gives up its second.",
    ],
    cut: (c) => (c.includes(RED) ? null : 1),
  },
  {
    text: "More than one red wire: cut the last red wire.",
    riddles: [
      "Blood run double: the last of the red pays.",
      "Crimson in company: sever the one that came last.",
      "Two reds or more, and the final red is the debt.",
    ],
    cut: (c) => (c.filter((x) => x === RED).length > 1 ? c.lastIndexOf(RED) : null),
  },
  {
    text: "The last wire is white: cut the last wire.",
    riddles: [
      "A tail pale as bone is a tail to cut.",
      "If the end has gone to ghost, the end goes.",
      "Should the last be white as salt, take the last.",
    ],
    cut: (c) => (c.at(-1) === WHITE ? c.length - 1 : null),
  },
  {
    text: "Exactly one blue wire: cut the blue wire.",
    riddles: [
      "One sky among them: sever it.",
      "A lone blue hangs, and so it hangs no more.",
      "A single blue in the dark is the one to cut.",
    ],
    cut: (c) => (c.filter((x) => x === BLUE).length === 1 ? c.indexOf(BLUE) : null),
  },
  {
    text: "More than one yellow wire: cut the first yellow wire.",
    riddles: [
      "Gold in plenty: the first of the gold goes.",
      "Where the yellow crowds, the earliest sun sets.",
      "Many suns, one dawn: cut the sun that rose first.",
    ],
    cut: (c) => (c.filter((x) => x === YELLOW).length > 1 ? c.indexOf(YELLOW) : null),
  },
  {
    text: "Exactly one red wire: cut the first wire.",
    riddles: [
      "One red drop, and the first wire pays for it.",
      "A lone red keeps watch; the wire at the head falls.",
    ],
    cut: () => 0,
  },
];

// A numbered plaque's phrasings (FR12): each resolves to a 1-based wire, with no sum beyond one.
const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];
export const NUMBER_RIDDLES: readonly ((n: number) => string)[] = [
  (n) => `Cut the wire that has ${n - 1} before it.`,
  (n) => `Step past ${n - 1}; the next one bleeds.`,
  (n) => `The knife waits at the ${ORDINALS[n - 1]} wire from the left.`,
];

// What a bot reads: the plain rule or any of its riddles, exactly as written. Null if none.
export function ruleOfText(text: string): number | null {
  const i = WIRE_RULES.findIndex((r) => r.text === text || r.riddles.includes(text));
  return i < 0 ? null : i;
}

// What a bot reads on a numbered plaque: a bare digit or any phrasing. Null if none.
export function numberOfText(text: string): number | null {
  for (let n = 1; n <= ORDINALS.length; n++) {
    if (text === String(n) || NUMBER_RIDDLES.some((f) => f(n) === text)) return n;
  }
  return null;
}

export function ruleFor(colours: number[]): { rule: number; cut: number } {
  for (const [rule, r] of WIRE_RULES.entries()) {
    const cut = r.cut(colours);
    if (cut !== null) return { rule, cut };
  }
  return { rule: WIRE_RULES.length - 1, cut: 0 };
}

const num = (v: unknown, fallback: number): number => (typeof v === "number" ? v : fallback);

export function tilesOf(v: unknown): Vec[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((t) =>
    Array.isArray(t) && typeof t[0] === "number" && typeof t[1] === "number"
      ? [{ x: t[0], y: t[1] }]
      : [],
  );
}

// Lights-out (FR11): pressing button i toggles lamp i and its grid neighbours.
export function toggled(lamps: number[], i: number, cols: number): number[] {
  const out = [...lamps];
  const flip = (j: number) => {
    if (j >= 0 && j < out.length) out[j] = 1 - (out[j] as number);
  };
  flip(i);
  flip(i - cols);
  flip(i + cols);
  if (i % cols > 0) flip(i - 1);
  if (i % cols < cols - 1) flip(i + 1);
  return out;
}

// The secret for one attempt. Wires: [cut, rule, ...colours]; radio: [setting, digit];
// switches: the lamp pattern to reach; the others: the numbers to enter, in order.
export function drawAnswer(
  type: StationType,
  params: Record<string, unknown>,
  r: () => number,
  plated = false,
): number[] {
  const int = (n: number) => Math.floor(r() * n);
  switch (type) {
    case "dial": {
      // a teaching safe has one number (clues FR7)
      const digits = params.teach ? 1 : Math.max(1, Math.min(3, num(params.digits, 1)));
      const range = num(params.range, 10);
      return Array.from({ length: digits }, () => int(range));
    }
    case "wires": {
      const colours = tilesOf(params.wires).map(() => int(WIRE_COLOURS.length));
      const { rule, cut } = ruleFor(colours);
      return [cut, rule, ...colours];
    }
    case "keypad":
      return Array.from({ length: Math.max(3, Math.min(4, num(params.length, 3))) }, () => int(9));
    case "radio":
      // never 0, where the knob starts: a radio is never tuned before anyone turns it
      if (plated) return platedRadio(num(params.range, 10), r);
      return [1 + int(num(params.range, 10) - 1), 1 + int(3)];
    case "switches": {
      // pressed from dark, so it is always reachable; never the all-dark pattern it starts at
      const n = tilesOf(params.buttons).length;
      const cols = num(params.cols, 3);
      for (;;) {
        let lamps = Array.from({ length: n }, () => 0);
        for (let i = 0; i < n; i++) if (r() < 0.5) lamps = toggled(lamps, i, cols);
        if (lamps.some((v) => v === 1)) return lamps;
      }
    }
    case "bells":
      // a teaching music box plays a two-note tune (clues FR7)
      return Array.from({ length: params.teach ? 2 : 4 }, () => int(tilesOf(params.bells).length));
    case "vault":
      return tilesOf(params.sockets).map(() => int(SYMBOLS));
    case "sync":
      return [];
  }
}

// A radio a braille plate names (FR10): three tuned bands, one real and two decoys that pip a wrong
// digit. [setting, digit, decoySetting, decoyDigit, decoySetting, decoyDigit], settings distinct
// and never 0, digits 1 to 3 with the decoys' never the real one.
function platedRadio(range: number, r: () => number): number[] {
  const int = (n: number) => Math.floor(r() * n);
  const digit = 1 + int(3);
  const settings: number[] = [];
  while (settings.length < 3) {
    const v = 1 + int(range - 1);
    if (!settings.includes(v)) settings.push(v);
  }
  const wrong = () => {
    const others = [1, 2, 3].filter((d) => d !== digit);
    return others[int(others.length)] as number;
  };
  return [
    settings[0] as number,
    digit,
    settings[1] as number,
    wrong(),
    settings[2] as number,
    wrong(),
  ];
}

// The digit a radio pips at its current setting, if it is tuned there: the real band's, or a decoy's.
export function bandDigit(s: StationState): number | undefined {
  for (let i = 0; i + 1 < s.answer.length; i += 2) {
    if (s.answer[i] === s.input[0]) return s.answer[i + 1];
  }
  return undefined;
}

function startInput(type: StationType, params: Record<string, unknown>): number[] {
  if (type === "dial" || type === "radio") return [0];
  if (type === "switches") return tilesOf(params.buttons).map(() => 0);
  if (type === "vault") return tilesOf(params.sockets).map(() => 0);
  if (type === "sync") return tilesOf(params.keys).map(() => 0);
  return [];
}

// Whether a braille plate in the room is for station `id`.
const isPlated = (world: World, id: string): boolean =>
  world.room.objects.some((o) => o.kind === "braille" && o.params?.for === id);

const stationObjects = (world: World): RoomObject[] =>
  world.room.objects.filter((o) => o.kind === "station");

// A cache is hidden until its motif tile is pressed (caches FR1, FR4): until then it is in no view,
// no hint and no sound, and an Act on its parts does nothing. A solved cache is open for good.
export const cacheOpen = (world: World, id: string): boolean => {
  const o = world.room.objects.find((x) => x.id === id);
  return !o || cacheOf(o) === null || world.cacheUncovered.includes(id);
};

// A fresh answer and empty input for every unsolved station, from rng(seed * 1000 + attempt): at
// room start and on every send-back (FR5). A solved station stays solved.
export function drawStations(world: World): void {
  const r = rng(world.seed * 1000 + world.attempt);
  for (const o of stationObjects(world)) {
    if (world.stations[o.id]?.solved) continue;
    const params = o.params ?? {};
    const type = params.type as StationType;
    world.stations[o.id] = {
      id: o.id,
      type,
      answer: drawAnswer(type, params, r, isPlated(world, o.id)),
      input: startInput(type, params),
      solved: false,
    };
    if (type === "sync") world.syncAt[o.id] = tilesOf(params.keys).map(() => -1);
  }
  fixFeeds(world);
}

// Answers that feed (clues FR3): a solved station that yields fixes the fed station's slot to its
// digit (a radio's digit d is key d, the (d - 1)th), and a vault's socket i is the symbol `from[i]`
// revealed once solved. Run after every draw and every solve, so a re-draw keeps what is true.
function fixFeeds(world: World): void {
  for (const o of stationObjects(world)) {
    const s = world.stations[o.id];
    const p = o.params ?? {};
    if (!s || s.solved) continue;
    const slot = p.slot as { from?: unknown; at?: unknown } | undefined;
    const from = typeof slot?.from === "string" ? world.stations[slot.from] : undefined;
    if (from?.solved && from.type === "radio" && typeof slot?.at === "number") {
      s.answer[slot.at] = (from.answer[1] as number) - 1;
    }
    if (s.type === "vault" && Array.isArray(p.from)) {
      p.from.forEach((id, i) => {
        const wing = typeof id === "string" ? world.stations[id] : undefined;
        if (wing?.solved && wing.reveal !== undefined) s.answer[i] = wing.reveal;
      });
    }
  }
}

// A station is solved: a wing (`reveal`) draws the symbol it shows from now on.
function revealOn(world: World, o: RoomObject, s: StationState): void {
  if (!o.params?.reveal || s.reveal !== undefined) return;
  const i = stationObjects(world).indexOf(o);
  s.reveal = Math.floor(rng(world.seed * 1000 + world.attempt + 500 + i)() * SYMBOLS);
}

// How long a teaching station or cache ignores input after a wrong answer (FR13).
export const JAM_TICKS = Math.round(3000 / 50); // 3 s at TICK_MS = 50

// A teaching station's wrong answer (clues FR7): this station alone is drawn again, from the tick,
// with nothing entered. No dye and no send-back.
export function redrawOne(world: World, o: RoomObject, s: StationState): void {
  const params = o.params ?? {};
  s.answer = drawAnswer(
    s.type,
    params,
    rng(world.seed * 1000 + world.attempt + 7 * world.tick + 1),
    isPlated(world, o.id),
  );
  s.input = startInput(s.type, params);
  delete s.tuned;
  if (s.type === "sync") world.syncAt[o.id] = tilesOf(params.keys).map(() => -1);
  fixFeeds(world);
}

// The text on a wire panel's plaque: the rule this attempt's wires follow (FR8), or, for a
// `numbered` panel, only the 1-based wire to cut (the colours are then decoys).
export function plaqueText(world: World, id: string): string | undefined {
  const o = stationObjects(world).find((s) => s.params?.type === "wires" && s.params.plaque === id);
  const s = o && world.stations[o.id];
  if (!s) return undefined;
  // a wire a braille plate names is told by the plate alone: its ink or plaque says nothing (FR5)
  if (platePart(world.room, o.id) !== undefined) return undefined;
  return plaqueWording(world, o, s);
}

// Rooms 04 on, a plaque that is not a teaching station's reads as a riddle: one of the rule's (or
// the number's) pool, seeded the way the answers are, so each read within an attempt agrees. Rooms
// 01 to 03 and the teaching stations stay plain.
function plaqueWording(world: World, o: RoomObject, s: StationState): string {
  const numbered = o.params?.numbered === true;
  const n = (s.answer[0] as number) + 1;
  const rule = WIRE_RULES[s.answer[1] as number];
  const plain = numbered ? String(n) : (rule?.text ?? "");
  if (o.params?.teach === true || !/^(0[4-9]|[1-9]\d)/.test(world.room.id)) return plain;
  let h = 0;
  for (const c of o.id) h = (h * 31 + c.charCodeAt(0)) | 0;
  const r = rng(world.seed * 1000 + world.attempt + h)();
  if (numbered) {
    const f = NUMBER_RIDDLES[Math.floor(r * NUMBER_RIDDLES.length)];
    return f ? f(n) : plain;
  }
  const pool = rule?.riddles ?? [];
  return pool[Math.floor(r * pool.length)] ?? plain;
}

const same = (a: Vec, b: Vec) => a.x === b.x && a.y === b.y;
const centre = (t: Vec): Vec => ({ x: t.x + 0.5, y: t.y + 0.5 });

export interface Wrong {
  id: string;
  seat: Seat;
}

// The station part under `tile` that an Act would work, by the same rules as `act`: an unsolved
// station, and a wire not yet cut. `index` is the part's place in its list (-1 for the anchor).
export interface Part {
  station: StationState;
  object: RoomObject;
  key: "pads" | "wires" | "keys" | "bells" | "buttons" | "sockets" | "anchor";
  index: number;
}

const PART_KEYS: Record<StationType, Part["key"][]> = {
  dial: ["pads", "anchor"],
  radio: ["pads"],
  wires: ["wires"],
  keypad: ["keys"],
  bells: ["bells"],
  switches: ["buttons"],
  vault: ["sockets", "anchor"],
  sync: ["keys"],
};

export function partAt(world: World, tile: Vec): Part | null {
  for (const object of stationObjects(world)) {
    const station = world.stations[object.id];
    if (!station || station.solved || !cacheOpen(world, object.id)) continue;
    for (const key of PART_KEYS[station.type]) {
      const index =
        key === "anchor"
          ? same(object.tiles[0] as Vec, tile)
            ? -1
            : -2
          : tilesOf(object.params?.[key]).findIndex((t) => same(t, tile));
      if (index === -2 || (key !== "anchor" && index < 0)) continue;
      if (station.type === "wires" && station.input.includes(index)) continue;
      return { station, object, key, index };
    }
  }
  return null;
}

// One Act by `seat` on `tile`, for the first station with a part there. Returns true if a station
// took it. A wrong answer is recorded in `wrong` (the first one this tick wins).
function act(
  world: World,
  o: RoomObject,
  tile: Vec,
  seat: Seat,
  wrong: { w: Wrong | null },
): boolean {
  const s = world.stations[o.id];
  if (!s || s.solved || !cacheOpen(world, o.id)) return false;
  // jammed after a wrong answer (FR13): every part ignores Act until the jam ends
  if (world.tick < (world.jammedUntil[o.id] ?? 0)) return false;
  const p = o.params ?? {};
  const anchor = o.tiles[0] as Vec;
  const cache = cacheOf(o) !== null;
  // While its practice lever is on a station only plays (Task 38): a keypad key or a bell sounds as
  // it always does, and nothing counts: no input kept, nothing solved, no wrong answer.
  const practising = typeof p.practice === "string" && world.levers[p.practice] === true;
  if (practising && (s.type === "keypad" || s.type === "bells")) {
    const i = tilesOf(p[s.type === "keypad" ? "keys" : "bells"]).findIndex((t) => same(t, tile));
    if (i < 0) return false;
    world.events.push({
      kind: "station",
      id: o.id,
      result: "press",
      n: i,
      practice: true,
      at: centre(tile),
    });
    return true;
  }
  const say = (result: "turn" | "press" | "cut" | "solved" | "wrong" | "jam", n?: number) =>
    world.events.push({
      kind: "station",
      id: o.id,
      result,
      ...(n === undefined ? {} : { n }),
      at: centre(result === "turn" || result === "press" || result === "cut" ? tile : anchor),
    });
  const solve = () => {
    s.solved = true;
    world.solvedBy[o.id] = seat;
    revealOn(world, o, s);
    say("solved");
    if (cache) {
      // the vault's secret door slides open; the loot waits for the owner to take the item
      world.cacheBy[o.id] = seat;
      syncCacheDoors(world);
      const vaultDoor = secretDoors(world.room).find((d) => d.id === o.id)?.vault.tiles[0] as Vec;
      world.events.push({ kind: "cache", id: o.id, result: "solved", seat, at: centre(vaultDoor) });
    }
  };
  const fail = () => {
    say("wrong");
    // a cache's wrong answer, like a teaching station's, draws only itself again (caches FR5)
    // and jams for 3 s, so a guess per tick cannot brute-force it (FR13)
    if (p.teach || cache) {
      redrawOne(world, o, s);
      world.jammedUntil[o.id] = world.tick + JAM_TICKS;
      say("jam");
    } else wrong.w ??= { id: o.id, seat };
  };
  const partIndex = (key: string) => tilesOf(p[key]).findIndex((t) => same(t, tile));

  switch (s.type) {
    case "dial":
    case "radio": {
      const pad = partIndex("pads");
      const range = num(p.range, 10);
      if (pad >= 0) {
        const value = ((s.input.at(-1) ?? 0) + (pad === 0 ? -1 : 1) + range) % range;
        s.input[s.input.length - 1] = value;
        say("turn", value);
        if (s.type === "radio") {
          // a decoy band is tuned (tone and pips) but never solves; only the real one does
          s.tuned = bandDigit(s) !== undefined;
          if (value === s.answer[0]) solve();
        }
        return true;
      }
      if (s.type === "dial" && same(anchor, tile)) {
        const value = s.input.at(-1) ?? 0;
        const confirmed = s.input.length - 1;
        say("press", value);
        if (value !== s.answer[confirmed]) fail();
        else if (confirmed + 1 >= s.answer.length) solve();
        else s.input.push(value);
        return true;
      }
      return false;
    }
    case "wires": {
      const i = partIndex("wires");
      if (i < 0 || s.input.includes(i)) return false;
      s.input.push(i);
      say("cut", i);
      if (i === s.answer[0]) solve();
      else fail();
      return true;
    }
    case "keypad":
    case "bells": {
      const i = partIndex(s.type === "keypad" ? "keys" : "bells");
      if (i < 0) return false;
      s.input.push(i);
      say("press", i);
      if (i !== s.answer[s.input.length - 1]) fail();
      else if (s.input.length >= s.answer.length) solve();
      return true;
    }
    case "switches": {
      const i = partIndex("buttons");
      if (i < 0) return false;
      s.input = toggled(s.input, i, num(p.cols, 3));
      say("press", i);
      if (s.input.join() === s.answer.join()) solve();
      return true;
    }
    case "vault": {
      const i = partIndex("sockets");
      if (i >= 0) {
        s.input[i] = ((s.input[i] ?? 0) + 1) % SYMBOLS;
        say("turn", s.input[i]);
        return true;
      }
      if (!same(anchor, tile)) return false;
      say("press");
      if (s.input.join() === s.answer.join()) solve();
      else fail();
      return true;
    }
    case "sync": {
      const i = partIndex("keys");
      if (i < 0) return false;
      const at = world.syncAt[o.id] ?? [];
      at[i] = world.tick;
      world.syncAt[o.id] = at;
      s.input[i] = 1;
      say("turn", i);
      const window = Math.round(num(p.windowMs, 500) / TICK_MS);
      if (at.every((t) => t >= 0 && world.tick - t <= window)) solve();
      return true;
    }
  }
}

// A sync lock whose first key was turned longer than its window ago starts again: a miss resets
// the lock only, never the team (FR14).
function expireSync(world: World): void {
  for (const o of stationObjects(world)) {
    const s = world.stations[o.id];
    const at = world.syncAt[o.id];
    if (!s || s.solved || s.type !== "sync" || !at) continue;
    const window = Math.round(num(o.params?.windowMs, 500) / TICK_MS);
    const turned = at.filter((t) => t >= 0);
    if (turned.length > 0 && world.tick - Math.min(...turned) > window) {
      world.syncAt[o.id] = at.map(() => -1);
      s.input = s.input.map(() => 0);
    }
  }
}

// An Act on the tile of a cache's matching motif uncovers it (caches FR4); a decoy, or a cache that
// is open already, does nothing and says nothing. True if it took the press.
function uncover(world: World, tile: Vec, seat: Seat): boolean {
  for (const o of stationObjects(world)) {
    const cache = cacheOf(o);
    if (!cache || world.cacheUncovered.includes(o.id) || world.stations[o.id]?.solved) continue;
    if (!cache.tiles.some((t) => t.motif === cache.motif && same(t.at, tile))) continue;
    world.cacheUncovered.push(o.id);
    syncCacheDoors(world);
    const door = secretDoors(world.room).find((d) => d.id === o.id)?.chamber.tiles[0] as Vec;
    world.events.push({ kind: "cache", id: o.id, result: "uncover", seat, at: centre(door) });
    return true;
  }
  return false;
}

// The Acts pressed this tick (seats in order) worked on the stations under them. Returns the first
// wrong answer, for `step` to send the team back; the seats a station took are added to `used`.
export function updateStations(
  world: World,
  acts: Seat[],
  used: Set<Seat> = new Set(),
): Wrong | null {
  expireSync(world);
  const wrong: { w: Wrong | null } = { w: null };
  for (const seat of acts) {
    const pos = world.players[seat].pos;
    const tile = { x: Math.floor(pos.x), y: Math.floor(pos.y) };
    if (uncover(world, tile, seat) || takeKeepsake(world, seat)) {
      used.add(seat);
      continue;
    }
    for (const o of stationObjects(world)) {
      if (act(world, o, tile, seat, wrong)) {
        used.add(seat);
        break;
      }
    }
  }
  fixFeeds(world);
  return wrong.w;
}

export const solved = (world: World, id: string): boolean => world.stations[id]?.solved === true;

// A code played as a tune: a group of chimes a note (chimes.ts), the whole tune again after a pause.
export const PIP_TICKS = 40; // a tuned radio pips its digit this often

// The unsolved station whose clue (`clue`, or a music box's `tune` tile) is `id`.
export function stationNaming(world: World, id: string): StationState | undefined {
  const o = stationObjects(world).find((s) => s.params?.clue === id);
  const s = o && world.stations[o.id];
  return s && !s.solved ? s : undefined;
}

// Whether a clue object belongs to a cache that is still hidden: it is silent until the chamber
// opens, so a hidden cache gives nothing away (caches FR1).
export function hiddenCacheClue(world: World, id: string): boolean {
  const o = stationObjects(world).find((s) => s.params?.clue === id);
  return o !== undefined && !cacheOpen(world, o.id);
}

// The note of `station`'s code whose group of chimes starts this tick, if one does. A keypad's slot
// (clues FR3) rests: its note is the digit of the radio that feeds it, found there and nowhere else.
export function noteOf(world: World, station: StationState): number | undefined {
  return groupStartingOn(world.tick, tuneOf(world, station))?.note;
}

// The tune of a station's code, its rests (a slot fed by a radio, a key a plate carries) left out of
// the groups.
function tuneOf(world: World, station: StationState) {
  const slot = world.room.objects.find((o) => o.id === station.id)?.params?.slot as
    | { at?: unknown }
    | undefined;
  const rests = typeof slot?.at === "number" ? [slot.at] : [];
  // a key a braille plate carries is no note either: it rests, so only Can't see's plate tells it (FR5)
  const plated = station.type === "keypad" ? platePart(world.room, station.id) : undefined;
  if (plated !== undefined) rests.push(plated);
  return tuneGroups(station.answer, rests);
}

// Whether a rest of `station`'s tune falls on this tick: a quiet marker plays there (FR14).
export function restOf(world: World, station: StationState): boolean {
  return restStartingOn(world.tick, tuneOf(world, station));
}

// The note of the code a clue or an earpiece plays this tick, if one does.
export function tuneNote(world: World, id: string): number | undefined {
  const s = stationNaming(world, id);
  return s && noteOf(world, s);
}

// Whether the tune a clue or an earpiece plays rests on this tick.
export function tuneRest(world: World, id: string): boolean {
  const s = stationNaming(world, id);
  return s !== undefined && restOf(world, s);
}

// The tiles that show a station's state to someone who can see them: the dial or radio face,
// the wires, the keys, the lamps, the bells and the music box, the sockets.
export function displayTiles(o: RoomObject): Vec[] {
  const p = o.params ?? {};
  const anchor = o.tiles[0] as Vec;
  switch (p.type as StationType) {
    case "dial":
    case "radio":
      return [anchor];
    case "wires":
      return tilesOf(p.wires);
    case "keypad":
    case "sync":
      return tilesOf(p.keys);
    case "switches":
      return tilesOf(p.lamps);
    case "bells":
      return [...tilesOf(p.bells), ...tilesOf([p.tune])];
    case "vault":
      return tilesOf(p.sockets);
  }
}

// What a station shows someone who can see it: dial and radio, the setting (and, on a radio's
// pip, the digit after it); wires, their colours; switches, the lamps; vault, the sockets; keypad,
// bells and sync, what has been entered (a music box first: 1 while a note of its tune plays).
// Where each part of a station stands, by its metadata key, for drawing: furniture, never state.
// The anchor first, then the parts in the order the type names them.
export type StationPartKey =
  | "anchor"
  | "pads"
  | "back"
  | "wires"
  | "keys"
  | "buttons"
  | "lamps"
  | "bells"
  | "tune"
  | "sockets";
const DRAWN: Record<StationType, StationPartKey[]> = {
  dial: ["pads", "back"],
  radio: ["pads"],
  wires: ["wires"],
  keypad: ["keys"],
  bells: ["bells", "tune"],
  switches: ["buttons", "lamps"],
  vault: ["sockets"],
  sync: ["keys"],
};
export function stationParts(o: RoomObject): { key: StationPartKey; at: Vec[] }[] {
  const p = o.params ?? {};
  const parts: { key: StationPartKey; at: Vec[] }[] = [{ key: "anchor", at: [o.tiles[0] as Vec] }];
  for (const key of DRAWN[p.type as StationType] ?? []) {
    const raw = p[key];
    // a single tile (back, tune) is written [x, y]; a list is [[x, y], ...]
    const at = tilesOf(Array.isArray(raw) && typeof raw[0] === "number" ? [raw] : raw);
    if (at.length > 0) parts.push({ key, at });
  }
  return parts;
}

export function stationShows(world: World, s: StationState): number[] {
  if (s.type === "wires") return s.answer.slice(2);
  // a teaching safe's lamp (clues FR7): shows[1] is 1 while the dial sits on the right number
  const teach = world.room.objects.find((o) => o.id === s.id)?.params?.teach === true;
  if (s.type === "dial" && teach && !s.solved) {
    const at = s.input[0] ?? 0;
    return [at, at === s.answer[0] ? 1 : 0];
  }
  if (s.type === "radio") {
    const digit = s.solved ? (s.answer[1] as number) : s.tuned ? bandDigit(s) : undefined;
    const pip = digit !== undefined && world.tick % PIP_TICKS === 0;
    return pip ? [s.input[0] ?? 0, digit] : [s.input[0] ?? 0];
  }
  if (s.type === "bells") return [!s.solved && noteOf(world, s) !== undefined ? 1 : 0, ...s.input];
  return [...s.input];
}

export type { StationState };

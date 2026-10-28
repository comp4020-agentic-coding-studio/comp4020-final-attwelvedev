// Stations (spec FR5-FR14): puzzles worked by standing on a tile and pressing Act. Pure: the
// answers come from a seeded generator, and a wrong answer is reported to `step`, which sends the
// team back (FR15). Each type's parts are tiles named in the station's metadata.
import type { RoomObject } from "../rooms/format.ts";
import type { Seat, Vec } from "../types.ts";
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
export const WIRE_RULES: { text: string; cut: (c: number[]) => number | null }[] = [
  { text: "No red wires: cut the second wire.", cut: (c) => (c.includes(RED) ? null : 1) },
  {
    text: "More than one red wire: cut the last red wire.",
    cut: (c) => (c.filter((x) => x === RED).length > 1 ? c.lastIndexOf(RED) : null),
  },
  {
    text: "The last wire is white: cut the last wire.",
    cut: (c) => (c.at(-1) === WHITE ? c.length - 1 : null),
  },
  {
    text: "Exactly one blue wire: cut the blue wire.",
    cut: (c) => (c.filter((x) => x === BLUE).length === 1 ? c.indexOf(BLUE) : null),
  },
  {
    text: "More than one yellow wire: cut the first yellow wire.",
    cut: (c) => (c.filter((x) => x === YELLOW).length > 1 ? c.indexOf(YELLOW) : null),
  },
  { text: "Otherwise: cut the first wire.", cut: () => 0 },
];

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
function toggled(lamps: number[], i: number, cols: number): number[] {
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
): number[] {
  const int = (n: number) => Math.floor(r() * n);
  switch (type) {
    case "dial": {
      const digits = Math.max(1, Math.min(3, num(params.digits, 1)));
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
      return Array.from({ length: 4 }, () => int(tilesOf(params.bells).length));
    case "vault":
      return tilesOf(params.sockets).map(() => int(SYMBOLS));
    case "sync":
      return [];
  }
}

function startInput(type: StationType, params: Record<string, unknown>): number[] {
  if (type === "dial" || type === "radio") return [0];
  if (type === "switches") return tilesOf(params.buttons).map(() => 0);
  if (type === "vault") return tilesOf(params.sockets).map(() => 0);
  if (type === "sync") return tilesOf(params.keys).map(() => 0);
  return [];
}

const stationObjects = (world: World): RoomObject[] =>
  world.room.objects.filter((o) => o.kind === "station");

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
      answer: drawAnswer(type, params, r),
      input: startInput(type, params),
      solved: false,
    };
    if (type === "sync") world.syncAt[o.id] = tilesOf(params.keys).map(() => -1);
  }
}

// The text on a wire panel's plaque: the rule this attempt's wires follow (FR8).
export function plaqueText(world: World, id: string): string | undefined {
  const o = stationObjects(world).find((s) => s.params?.type === "wires" && s.params.plaque === id);
  const s = o && world.stations[o.id];
  return s ? WIRE_RULES[s.answer[1] as number]?.text : undefined;
}

const same = (a: Vec, b: Vec) => a.x === b.x && a.y === b.y;
const centre = (t: Vec): Vec => ({ x: t.x + 0.5, y: t.y + 0.5 });

export interface Wrong {
  id: string;
  seat: Seat;
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
  if (!s || s.solved) return false;
  const p = o.params ?? {};
  const anchor = o.tiles[0] as Vec;
  const say = (result: "turn" | "press" | "cut" | "solved" | "wrong", n?: number) =>
    world.events.push({
      kind: "station",
      id: o.id,
      result,
      ...(n === undefined ? {} : { n }),
      at: centre(result === "turn" || result === "press" || result === "cut" ? tile : anchor),
    });
  const solve = () => {
    s.solved = true;
    say("solved");
  };
  const fail = () => {
    say("wrong");
    wrong.w ??= { id: o.id, seat };
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
        if (s.type === "radio" && value === s.answer[0]) solve();
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

// The Acts pressed this tick (seats in order) worked on the stations under them. Returns the first
// wrong answer, for `step` to send the team back.
export function updateStations(world: World, acts: Seat[]): Wrong | null {
  expireSync(world);
  const wrong: { w: Wrong | null } = { w: null };
  for (const seat of acts) {
    const pos = world.players[seat].pos;
    const tile = { x: Math.floor(pos.x), y: Math.floor(pos.y) };
    for (const o of stationObjects(world)) {
      if (act(world, o, tile, seat, wrong)) break;
    }
  }
  return wrong.w;
}

export const solved = (world: World, id: string): boolean => world.stations[id]?.solved === true;

export type { StationState };

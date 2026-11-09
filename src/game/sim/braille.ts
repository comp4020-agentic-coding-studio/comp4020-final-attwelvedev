// Braille plates (ADR 0023, overview §4.1): a plate carries one number from a station's answer, and
// only Can't see can read it. Pure: the number is read live from the station, so a redraw changes it.
import type { Seat, Vec } from "../types.ts";
import type { World } from "./world.ts";

const NUMBER_SIGN = [3, 4, 5, 6];
// a to j: the digits 1 to 9, then 0
const DIGIT_DOTS: readonly number[][] = [
  [2, 4, 5], // 0 (j)
  [1], // 1 (a)
  [1, 2], // 2 (b)
  [1, 4], // 3 (c)
  [1, 4, 5], // 4 (d)
  [1, 5], // 5 (e)
  [1, 2, 4], // 6 (f)
  [1, 2, 4, 5], // 7 (g)
  [1, 2, 5], // 8 (h)
  [2, 4], // 9 (i)
];

// The number a plate carries this attempt, from its station's answer (overview §4.1 table).
export function plateNumber(world: World, plateId: string): number | undefined {
  const plate = world.room.objects.find((o) => o.id === plateId && o.kind === "braille");
  const of = plate?.params?.for;
  const part = Number(plate?.params?.part ?? 0);
  const s = typeof of === "string" ? world.stations[of] : undefined;
  if (!s) return undefined;
  if (s.type === "dial") return s.answer[part];
  const plusOne = (v: number | undefined) => (v === undefined ? undefined : v + 1);
  if (s.type === "keypad") return plusOne(s.answer[part]); // keys are numbered 1 to 9
  if (s.type === "radio") return s.answer[0];
  if (s.type === "wires") return plusOne(s.answer[0]); // the wire to cut, counted from 1
  return undefined;
}

// Which piece of a station's answer a plate in the room carries, if one does: that piece is told by
// the plate alone (a dial's tumbler stays silent for it).
export function platePart(room: World["room"], stationId: string): number | undefined {
  const plate = room.objects.find((o) => o.kind === "braille" && o.params?.for === stationId);
  return plate ? Number(plate.params?.part ?? 0) : undefined;
}

// Grade-1 braille for a non-negative integer: the number sign (dots 3 4 5 6), then a to j for each digit.
// Each cell is its raised dots, ascending, from 1..6.
export function brailleCells(n: number): number[][] {
  const digits = String(Math.max(0, Math.floor(n))).split("");
  return [[...NUMBER_SIGN], ...digits.map((d) => [...(DIGIT_DOTS[Number(d)] as number[])])];
}

// The fixed key the card shows: digits 1..9, 0 and the number sign, as cells.
export const BRAILLE_KEY: readonly { label: string; dots: number[] }[] = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => ({
    label: String(d),
    dots: [...(DIGIT_DOTS[d] as number[])],
  })),
  { label: "#", dots: [...NUMBER_SIGN] },
];

// Within reach of a plate: on its tile or one of the 8 around it.
export function besidePlate(world: World, at: Vec): string | undefined {
  const tile = { x: Math.floor(at.x), y: Math.floor(at.y) };
  return world.room.objects.find(
    (o) =>
      o.kind === "braille" &&
      o.tiles.some((t) => Math.abs(t.x - tile.x) <= 1 && Math.abs(t.y - tile.y) <= 1),
  )?.id;
}

// Act by a Can't-see seat beside a plate opens it: recorded in `reading`, and the room hears a tap.
// Returns whether the Act was taken. A world with no roles (old tests) treats nobody as blind.
export function readPlate(world: World, seat: Seat): boolean {
  if (world.roles?.[seat] !== "blind") return false;
  const id = besidePlate(world, world.players[seat].pos);
  const plate = world.room.objects.find((o) => o.id === id);
  if (!id || !plate) return false;
  world.reading[seat] = id;
  const t = plate.tiles[0] as Vec;
  world.events.push({ kind: "braille", id, seat, at: { x: t.x + 0.5, y: t.y + 0.5 } });
  return true;
}

// A seat that has stepped out of reach lets go of the plate it was reading.
export function dropReading(world: World): void {
  for (const seat of [0, 1, 2] as const) {
    const id = world.reading[seat];
    if (id !== undefined && besidePlate(world, world.players[seat].pos) !== id) {
      delete world.reading[seat];
    }
  }
}

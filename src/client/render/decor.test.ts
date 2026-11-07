import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { spectatorView, viewFor } from "../../game/perception.ts";
import { loadRooms } from "../../game/rooms/load.ts";
import { createWorld } from "../../game/sim/world.ts";
import type { Role, Vec } from "../../game/types.ts";
import {
  type DecorItem,
  decorAt,
  decorFor,
  KIND_FACES,
  THEME_KINDS,
  THEME_OF,
  type Theme,
} from "./decor.ts";

// A wide room of plain walls: a long north wall over open floor, then inner walls in a grid, so
// there are plenty of eligible fronts and tops.
function hall(w = 60, h = 30): string[] {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) {
      const edge = y === 0 || y === h - 1 || x === 0 || x === w - 1;
      row += edge || (y % 4 === 0 && x % 7 !== 3) ? "#" : ".";
    }
    rows.push(row);
  }
  return rows;
}

const cheb = (a: Vec, b: Vec) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const isBlock = (c: string | undefined) => c === "#" || c === "=" || c === "%" || c === "H";

function eligible(tiles: readonly string[]) {
  let fronts = 0;
  let tops = 0;
  tiles.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== "#") continue;
      tops++;
      const s = tiles[y + 1]?.[x];
      if (s !== undefined && !isBlock(s) && s !== "D") fronts++;
    }
  });
  return { fronts, tops };
}

describe("decorFor: placement", () => {
  it("the same room and tiles give the same decor; another room id gives another", () => {
    const t = hall();
    const a = decorFor("09-the-vault", t);
    expect(a.length).toBeGreaterThan(0);
    expect(decorFor("09-the-vault", t)).toEqual(a);
    expect(decorFor("05-the-gallery", t)).not.toEqual(a);
  });

  it("no item on a front whose south tile is a block, a door, or past the last row", () => {
    const t = hall();
    // put a door, glass, a vent and a hatch under parts of the north wall
    const row1 = [...(t[1] as string)];
    for (const [x, c] of [
      [10, "D"],
      [20, "="],
      [30, "%"],
      [40, "H"],
    ] as const)
      row1[x] = c;
    t[1] = row1.join("");
    for (const room of ["05-the-gallery", "08-music-room", "09-the-vault"])
      for (const it of decorFor(room, t).filter((i) => i.face === "front")) {
        expect(it.y).toBeLessThan(t.length - 1);
        const south = t[it.y + 1]?.[it.x];
        expect(isBlock(south) || south === "D", `${room} ${it.x},${it.y}`).toBe(false);
      }
  });

  it("no item within 1 tile of D, H, =, %, night, or a wire route", () => {
    const t = hall();
    const put = (x: number, y: number, c: string) => {
      const r = [...(t[y] as string)];
      r[x] = c;
      t[y] = r.join("");
    };
    // a door in each wall line, glass, a vent, a hatch, a patch of night
    for (let x = 2; x < 58; x += 5) put(x, 1, "D");
    put(5, 8, "=");
    put(12, 12, "%");
    put(20, 16, "H");
    put(30, 20, " ");
    put(31, 20, " ");
    const wires: Vec[][] = [
      [
        { x: 2.5, y: 4.5 },
        { x: 50.5, y: 4.5 },
      ],
      [
        { x: 44.5, y: 2.5 },
        { x: 44.5, y: 26.5 },
      ],
    ];
    const near = (it: DecorItem, test: (x: number, y: number) => boolean) => {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) if (test(it.x + dx, it.y + dy)) return true;
      return false;
    };
    const onWire = (x: number, y: number) =>
      wires.some((w) =>
        w.some((p, i) => {
          const q = w[i + 1] ?? p;
          const minX = Math.floor(Math.min(p.x, q.x));
          const maxX = Math.floor(Math.max(p.x, q.x));
          const minY = Math.floor(Math.min(p.y, q.y));
          const maxY = Math.floor(Math.max(p.y, q.y));
          return x >= minX && x <= maxX && y >= minY && y <= maxY;
        }),
      );
    let seen = 0;
    for (const room of ["05-the-gallery", "08-music-room", "09-the-vault"])
      for (const it of decorFor(room, t, wires)) {
        seen++;
        expect(
          near(it, (x, y) => "DH=% ".includes(t[y]?.[x] ?? "#")),
          `${room} ${it.x},${it.y}`,
        ).toBe(false);
        expect(near(it, onWire), `${room} ${it.x},${it.y} by a wire`).toBe(false);
      }
    expect(seen).toBeGreaterThan(0);
  });

  it("fronts: at most 1 per 6 eligible, and items are at least 3 apart; tops at most 1 per 8", () => {
    const t = hall(80, 40);
    const { fronts, tops } = eligible(t);
    for (const room of ["05-the-gallery", "08-music-room", "09-the-vault"]) {
      const items = decorFor(room, t);
      const f = items.filter((i) => i.face === "front");
      const p = items.filter((i) => i.face === "top");
      expect(f.length).toBeGreaterThan(0);
      expect(f.length).toBeLessThanOrEqual(fronts / 6);
      expect(p.length).toBeLessThanOrEqual(tops / 8);
      for (const list of [f, p])
        for (let i = 1; i < list.length; i++)
          expect(cheb(list[i - 1] as DecorItem, list[i] as DecorItem), room).toBeGreaterThanOrEqual(
            3,
          );
    }
    // the strongroom's rivets are the one kind that goes on a top
    expect(decorFor("09-the-vault", t).some((i) => i.face === "top")).toBe(true);
  });

  describe("room 01", () => {
    const saved = THEME_KINDS.pavilion;
    afterEach(() => {
      (THEME_KINDS as Record<Theme, unknown>).pavilion = saved;
    });
    it("room 01 places at most half of what the same tiles would get under another id", () => {
      // the pavilion's kinds come in phase 8; lend it the strongroom's for the count
      (THEME_KINDS as Record<Theme, unknown>).pavilion = THEME_KINDS.strongroom;
      const t = hall(120, 60);
      const { fronts, tops } = eligible(t);
      const one = decorFor("01-first-steps", t);
      const f = one.filter((i) => i.face === "front").length;
      const p = one.filter((i) => i.face === "top").length;
      expect(f).toBeGreaterThan(0);
      expect(f).toBeLessThanOrEqual(fronts / 12);
      expect(p).toBeLessThanOrEqual(tops / 16);
    });
  });

  it("every room's theme has at least one front kind", () => {
    for (const [room, theme] of Object.entries(THEME_OF))
      expect(
        THEME_KINDS[theme].some((k) => KIND_FACES[k].includes("front")),
        room,
      ).toBe(true);
  });

  it("decorFor never reads anything but its arguments", () => {
    const t = Object.freeze(hall().map((r) => r));
    const a = decorFor("08-music-room", t, Object.freeze([]));
    expect(decorFor("08-music-room", t)).toEqual(a);
    const src = readFileSync(new URL("./decor.ts", import.meta.url), "utf8");
    const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1] as string);
    for (const spec of imports) {
      expect(spec).not.toMatch(/perception|sim|net|protocol|document|window/);
      expect(spec === "../../game/types.ts", spec).toBe(true);
    }
    expect(src).not.toMatch(/\b(document|window|globalThis|localStorage)\b/);
  });

  it("decorAt finds an item by its wall tile and face", () => {
    const items = decorFor("09-the-vault", hall(80, 40));
    for (const it of items) expect(decorAt(items, it.x, it.y)[it.face]).toBe(it);
    expect(decorAt(items, -5, -5)).toEqual({});
  });
});

// R2: decor reads layout only, so it cannot know where a station stands. Stations, plaques and the
// like are drawn after the wall, but an item beside one could still read as part of it: in every
// shipped room, no item is within 1 tile of one. A failing room has its SALT raised in decor.ts.
describe("R2: no decor beside a station, plaque, camera, bell, lamp, lever or ink", () => {
  const ROLES: [Role, Role, Role] = ["blind", "deaf", "mute"];
  for (const room of loadRooms("./rooms")) {
    it(`room ${room.id}`, () => {
      const world = createWorld(room, 1, ROLES);
      const view = viewFor(world, 1, "deaf", true);
      const tiles = view.tiles ?? room.grid;
      const wires = view.entities.filter((e) => e.kind === "wire").map((e) => e.route ?? []);
      const items = decorFor(room.id, tiles, wires);
      const anchors: Vec[] = [];
      for (const e of spectatorView(world, null, ROLES, true).entities) {
        if (e.station) for (const p of e.station.parts) anchors.push(...p.at);
        if (["sign", "camera", "bell", "lamp", "lever"].includes(e.kind))
          anchors.push({ x: Math.floor(e.pos.x), y: Math.floor(e.pos.y) });
      }
      for (const o of room.objects) if (o.kind === "ink") anchors.push(...o.tiles);
      for (const it of items)
        for (const a of anchors)
          expect(
            cheb(it, { x: Math.floor(a.x), y: Math.floor(a.y) }),
            `${it.kind} at ${it.x},${it.y}`,
          ).toBeGreaterThan(1);
    });
  }
});

describe("the banned list", () => {
  it("no theme kind is named as a banned thing", () => {
    const banned =
      /clock|dial|bell|horn|window|slat|rail|lantern|ray|blind|deaf|mute|ear|eye|mouth|moon|star|wave|key|leaf|note/i;
    const kinds = Object.values(THEME_KINDS).flat();
    expect(kinds.length).toBeGreaterThan(0);
    for (const k of kinds) expect(k, k).not.toMatch(banned);
    // every room maps to a theme
    for (const room of loadRooms("./rooms")) expect(THEME_OF[room.id], room.id).toBeDefined();
  });
});

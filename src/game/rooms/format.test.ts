import { describe, expect, it } from "vitest";
import { cacheOf, inRect, parseRoom, RoomFormatError, secretDoors } from "./format.ts";

const header = (extra = "") =>
  `{"id":"t-room","name":"Test room","version":1,"beats":[{"name":"Three hands","x":[8,19],"intent":{"blind":"b","deaf":"d","mute":"m"}}],"objects":{"D1":{"opensWhen":["p1","p2","p3"]}${extra}}}`;

const GRID = [
  "####################",
  "#1.#.........D...E.#",
  "#2.#....p....D.....#",
  "#3.B....p....D.....#",
  "#..#....p..........#",
  "####################",
];

const text = (grid = GRID, head = header()) => `${head}\n---\n${grid.join("\n")}\n`;

describe("parseRoom", () => {
  it("parses header, grid and objects", () => {
    const room = parseRoom(text());
    expect(room).toMatchObject({
      id: "t-room",
      name: "Test room",
      version: 1,
      width: 20,
      height: 6,
    });
    expect(room.beats).toHaveLength(1);
    expect(room.beats[0]?.name).toBe("Three hands");
    expect(room.objects.map((o) => o.id).sort()).toEqual(
      ["B1", "D1", "E1", "p1", "p2", "p3", "s1", "s2", "s3"].sort(),
    );
    const door = room.objects.find((o) => o.id === "D1");
    expect(door?.kind).toBe("door");
    expect(door?.opensWhen).toEqual(["p1", "p2", "p3"]);
    expect(room.objects.find((o) => o.id === "B1")?.tiles).toEqual([{ x: 3, y: 3 }]);
    expect(room.meta.id).toBe("t-room");
  });

  it("replaces object letters with floor but keeps walls and doors in the grid", () => {
    const room = parseRoom(text());
    expect(room.grid[2]?.[8]).toBe(".");
    expect(room.grid[3]?.[3]).toBe(".");
    expect(room.grid[1]?.[1]).toBe(".");
    expect(room.grid[1]?.[17]).toBe(".");
    expect(room.grid[1]?.[13]).toBe("D");
    expect(room.grid[0]?.[0]).toBe("#");
  });

  it("numbers objects in reading order, left to right then top to bottom", () => {
    const room = parseRoom(
      text(["#####", "#1pp#", "#2.p#", "#3..#", "#####"].map((r) => r.padEnd(5, "#"))),
    );
    const at = (id: string) => room.objects.find((o) => o.id === id)?.tiles[0];
    expect(at("p1")).toEqual({ x: 2, y: 1 });
    expect(at("p2")).toEqual({ x: 3, y: 1 });
    expect(at("p3")).toEqual({ x: 3, y: 2 });
  });

  it("merges adjacent D tiles in a row or column into one door", () => {
    const room = parseRoom(text());
    const doors = room.objects.filter((o) => o.kind === "door");
    expect(doors).toHaveLength(1);
    expect(doors[0]?.tiles).toEqual([
      { x: 13, y: 1 },
      { x: 13, y: 2 },
      { x: 13, y: 3 },
    ]);
    const two = parseRoom(text(["#######", "#1D.D3#", "#2D.D.#", "#######"]));
    expect(two.objects.filter((o) => o.kind === "door").map((o) => o.id)).toEqual(["D1", "D2"]);
  });

  it("fails an unknown character with its line number", () => {
    const bad = [...GRID];
    bad[2] = "#2.#....x....D.....#";
    const err = (() => {
      try {
        parseRoom(text(bad));
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(RoomFormatError);
    // line 1 header, line 2 "---", grid row 2 is line 5
    expect((err as RoomFormatError).line).toBe(5);
  });

  it("fails when the --- line is missing", () => {
    expect(() => parseRoom(`${header()}\n${GRID.join("\n")}`)).toThrow(RoomFormatError);
  });

  it("applies metadata overrides to visibility, and defaults to deaf and mute", () => {
    const room = parseRoom(
      text(GRID, header(`,"p1":{"visible_to":["blind"],"audible_to":["deaf"]}`)),
    );
    const p1 = room.objects.find((o) => o.id === "p1");
    expect(p1?.visibleTo).toEqual(["blind"]);
    expect(p1?.audibleTo).toEqual(["deaf"]);
    const p2 = room.objects.find((o) => o.id === "p2");
    expect(p2?.visibleTo).toEqual(["deaf", "mute"]);
    expect(p2?.audibleTo).toEqual([]);
  });
});

describe("parseRoom: hazards, checkpoints, loot and signs", () => {
  const head = (objects: Record<string, unknown>) =>
    JSON.stringify({ id: "t", name: "T", version: 1, beats: [], objects });
  const grid = [
    "####################",
    "#1.G...C..L..K..$..#",
    "#2.....h.......$..S#",
    "#3.G..K.....D..E...#",
    "####################",
  ];
  const parsed = (objects: Record<string, unknown> = {}) =>
    parseRoom(`${head(objects)}\n---\n${grid.join("\n")}\n`);

  it("numbers each new letter in reading order and replaces it with floor", () => {
    const room = parsed();
    const ids = (kind: string) => room.objects.filter((o) => o.kind === kind).map((o) => o.id);
    expect(ids("guard")).toEqual(["G1", "G2"]);
    expect(ids("camera")).toEqual(["C1"]);
    expect(ids("laser")).toEqual(["L1"]);
    expect(ids("hide")).toEqual(["h1"]);
    expect(ids("checkpoint")).toEqual(["K1", "K2"]);
    expect(ids("loot")).toEqual(["$1", "$2"]);
    expect(ids("sign")).toEqual(["S1"]);
    expect(room.grid.join("")).not.toMatch(/[GCLhK$S]/);
    expect(room.objects.find((o) => o.id === "G2")?.tiles).toEqual([{ x: 3, y: 3 }]);
  });

  it("carries a hazard's metadata as params and a door's mode", () => {
    const room = parsed({
      G1: {
        patrol: [
          [3, 1],
          [8, 1],
        ],
        speedTps: 2,
      },
      D1: { mode: "sequence", opensWhen: ["p1"] },
    });
    expect(room.objects.find((o) => o.id === "G1")?.params).toMatchObject({ speedTps: 2 });
    expect(room.objects.find((o) => o.id === "D1")?.mode).toBe("sequence");
  });

  it("defaults a door to mode all", () => {
    expect(parsed({ D1: { opensWhen: ["p1"] } }).objects.find((o) => o.id === "D1")?.mode).toBe(
      "all",
    );
  });
});

describe("parseRoom: lead beats were removed", () => {
  const withBeat = (extra: string) =>
    `{"id":"t-room","name":"Test room","version":1,"beats":[{"name":"Three hands","x":[8,19]${extra},"intent":{"blind":"b","deaf":"d","mute":"m"}}],"objects":{"D1":{"opensWhen":["p1","p2","p3"]}}}\n---\n${GRID.join("\n")}\n`;

  it("fails a beat that names a lead or a cue", () => {
    expect(() => parseRoom(withBeat(',"lead":"deaf"'))).toThrow(/lead beats were removed/);
    expect(() => parseRoom(withBeat(',"cue":"twin"'))).toThrow(/lead beats were removed/);
  });

  it("parses a beat with neither", () => {
    expect(parseRoom(withBeat("")).beats[0]?.name).toBe("Three hands");
  });
});

describe("parseRoom: glass and vents", () => {
  it("keeps = (glass) and % (vent) in the grid, like walls", () => {
    const grid = [...GRID];
    grid[4] = "#..#=...%.........#";
    const room = parseRoom(text(grid));
    expect(room.grid[4]?.[4]).toBe("=");
    expect(room.grid[4]?.[8]).toBe("%");
  });
});

describe("parseRoom: stations", () => {
  const grid = ["#######", "#1.Q..#", "#2....#", "#3....#", "#######"];
  const withQ = (q: unknown) => header(`,"Q1":${JSON.stringify(q)}`);

  it("parses v as a lever with its metadata, and a station's practice lever (Task 38)", () => {
    const room = parseRoom(
      `${JSON.stringify({ id: "t", name: "T", version: 1, beats: [], objects: { Q1: { type: "bells", bells: [[3, 1]], tune: [5, 1], practice: "v1" } } })}\n---\n#######\n#1.Qv.#\n#2....#\n#3....#\n#######\n`,
    );
    const lever = room.objects.find((o) => o.id === "v1");
    expect(lever?.kind).toBe("lever");
    expect(lever?.tiles).toEqual([{ x: 4, y: 1 }]);
    expect(room.objects.find((o) => o.id === "Q1")?.params?.practice).toBe("v1");
  });

  it("parses o as a braille plate: id o1, its for and part kept, the tile floor (Task 72)", () => {
    const room = parseRoom(
      `${JSON.stringify({
        id: "t",
        name: "T",
        version: 1,
        beats: [],
        objects: {
          Q1: {
            type: "dial",
            pads: [
              [2, 2],
              [4, 2],
            ],
          },
          o1: { for: "Q1", part: 0 },
        },
      })}\n---\n#######\n#1.Q.o#\n#2....#\n#3....#\n#######\n`,
    );
    const plate = room.objects.find((o) => o.id === "o1");
    expect(plate?.kind).toBe("braille");
    expect(plate?.tiles).toEqual([{ x: 5, y: 1 }]);
    expect(plate?.params).toMatchObject({ for: "Q1", part: 0 });
    expect(plate?.visibleTo).toEqual(["deaf", "mute"]);
    expect(room.grid[1]?.[5]).toBe(".");
  });

  it("keeps a plate's crateOnly flag as a param (Task 33)", () => {
    const room = parseRoom(
      `${JSON.stringify({ id: "t", name: "T", version: 1, beats: [], objects: { p1: { crateOnly: true } } })}\n---\n#####\n#1.p#\n#2..#\n#3..#\n#####\n`,
    );
    expect(room.objects.find((o) => o.id === "p1")?.params).toMatchObject({ crateOnly: true });
  });

  it("parses Q as a station with its metadata as params", () => {
    const room = parseRoom(
      text(
        grid,
        withQ({
          type: "dial",
          pads: [
            [2, 2],
            [4, 2],
          ],
          back: [3, 0],
        }),
      ),
    );
    const q = room.objects.find((o) => o.id === "Q1");
    expect(q?.kind).toBe("station");
    expect(q?.tiles).toEqual([{ x: 3, y: 1 }]);
    expect(q?.params?.type).toBe("dial");
    expect(room.grid[1]?.[3]).toBe(".");
  });

  it("fails a station with an unknown type", () => {
    expect(() => parseRoom(text(grid, withQ({ type: "toaster" })))).toThrow(RoomFormatError);
    expect(() => parseRoom(text(grid, withQ({})))).toThrow(/station Q1/);
  });
});

describe("parseRoom: gear, hatch, bell, lamp and ink", () => {
  const grid = ["#########", "#1.g.#..#", "#2..bH.l#", "#3.u.#..#", "#########"];
  const head = (objects: Record<string, unknown>) =>
    header(
      `,${Object.entries(objects)
        .map(([k, v]) => `"${k}":${JSON.stringify(v)}`)
        .join(",")}`,
    );

  it("numbers g, H, b, l and u, keeps H in the grid and the others as floor", () => {
    const room = parseRoom(text(grid, head({ g1: { item: "goggles" }, u1: { text: "4 7" } })));
    const kinds = Object.fromEntries(room.objects.map((o) => [o.id, o.kind]));
    expect(kinds).toMatchObject({ g1: "gear", H1: "hatch", b1: "bell", l1: "lamp", u1: "ink" });
    expect(room.objects.find((o) => o.id === "g1")?.params?.item).toBe("goggles");
    expect(room.objects.find((o) => o.id === "u1")?.params?.text).toBe("4 7");
    expect(room.grid[2]).toBe("#....H..#");
  });

  it("fails gear with no item or an unknown one", () => {
    expect(() => parseRoom(text(grid, head({ g1: { item: "jetpack" } })))).toThrow(/gear g1/);
    expect(() => parseRoom(text(grid))).toThrow(RoomFormatError);
  });
});

describe("parseRoom: clue keys (escape-room Task 11)", () => {
  const grid = ["#########", "#1.Q.t..#", "#2.Q.Y..#", "#3......#", "#########"];
  const head = (objects: Record<string, unknown>) =>
    header(
      `,${Object.entries(objects)
        .map(([k, v]) => `"${k}":${JSON.stringify(v)}`)
        .join(",")}`,
    );
  const SWITCHES = { type: "switches", buttons: [[2, 3]], cols: 1, lamps: [[4, 3]] };
  const VAULT = { type: "vault", sockets: [[6, 3]], from: ["Q1"], symbols: "Y1" };

  it("parses t as a target card and Y as an order clue, with their metadata", () => {
    const room = parseRoom(
      text(grid, head({ Q1: SWITCHES, Q2: VAULT, T1: { of: "Q1" }, Y1: { of: "Q2" } })),
    );
    const t = room.objects.find((o) => o.id === "T1");
    expect(t?.kind).toBe("card");
    expect(t?.params?.of).toBe("Q1");
    expect(room.objects.find((o) => o.id === "Y1")?.kind).toBe("order");
    expect(room.grid[1]).toBe("#.......#");
  });

  it("keeps teach, motif and slot on a station, and fails a motif it does not know", () => {
    const room = parseRoom(
      text(
        grid,
        head({
          Q1: { ...SWITCHES, teach: true, motif: "moon" },
          Q2: { ...VAULT, slot: { from: "Q1", at: 0 } },
        }),
      ),
    );
    const q1 = room.objects.find((o) => o.id === "Q1");
    expect(q1?.params).toMatchObject({ teach: true, motif: "moon" });
    expect(room.objects.find((o) => o.id === "Q2")?.params?.slot).toEqual({ from: "Q1", at: 0 });
    expect(() =>
      parseRoom(text(grid, head({ Q1: { ...SWITCHES, motif: "sun" }, Q2: VAULT }))),
    ).toThrow(/Q1.*motif/);
  });
});

describe("parseRoom: caches (escape-room phase 14, Task 51)", () => {
  const grid = [
    "#########",
    "#1.Q....#",
    "#2......#",
    "#3......#",
    "##D######",
    "#..D.####",
    "#########",
  ];
  const DIAL = {
    type: "dial",
    pads: [
      [2, 2],
      [4, 2],
    ],
    digits: 2,
    range: 10,
  };
  const CACHE = {
    owner: 2,
    motif: "moon",
    riddle: "Where the moon watches, listen twice.",
    item: "watch",
    tiles: [
      { at: [5, 1], motif: "moon" },
      { at: [6, 1], motif: "star" },
    ],
    chamber: {
      rect: [1, 5, 4, 5],
      door: [2, 4],
      vault: { rect: [4, 5, 4, 5], door: [3, 5], item: [4, 5] },
    },
  };
  const withCache = (cache: unknown) =>
    parseRoom(text(grid, header(`,"Q1":${JSON.stringify({ ...DIAL, cache })}`)));

  it("cacheOf gives a CacheSpec for a cache and null for a plain station", () => {
    const room = withCache(CACHE);
    expect(cacheOf(room.objects.find((o) => o.id === "Q1") as never)).toEqual({
      owner: 2,
      motif: "moon",
      riddle: "Where the moon watches, listen twice.",
      item: "watch",
      tiles: [
        { at: { x: 5, y: 1 }, motif: "moon" },
        { at: { x: 6, y: 1 }, motif: "star" },
      ],
      chamber: {
        rect: [1, 5, 4, 5],
        door: { x: 2, y: 4 },
        vault: { rect: [4, 5, 4, 5], door: { x: 3, y: 5 }, item: { x: 4, y: 5 } },
      },
    });
    const plain = parseRoom(text(grid, header(`,"Q1":${JSON.stringify(DIAL)}`)));
    expect(cacheOf(plain.objects.find((o) => o.id === "Q1") as never)).toBeNull();
  });

  it("fails a cache with two matching tiles, an owner of 4, an unknown item, or too many tiles", () => {
    const tile = (x: number, motif: string) => ({ at: [x, 1], motif });
    expect(() => withCache({ ...CACHE, tiles: [tile(5, "moon"), tile(6, "moon")] })).toThrow(
      /Q1.*exactly one/,
    );
    expect(() => withCache({ ...CACHE, tiles: [tile(5, "star")] })).toThrow(/Q1.*exactly one/);
    expect(() => withCache({ ...CACHE, owner: 4 })).toThrow(/Q1.*owner/);
    expect(() => withCache({ ...CACHE, item: "jetpack" })).toThrow(/Q1.*item/);
    expect(() => withCache({ ...CACHE, motif: "sun" })).toThrow(/Q1.*motif/);
    const many = ["moon", "star", "wave", "key", "eye", "leaf", "star"].map((m, i) =>
      tile(i + 1, m),
    );
    expect(() => withCache({ ...CACHE, tiles: many })).toThrow(/Q1.*at most 6/);
  });

  it("no longer knows the j tile", () => {
    expect(() => parseRoom(text(["#####", "#123#", "#.j.#", "#####"]))).toThrow(/unknown tile "j"/);
  });
});

describe("parseRoom: a cache's chamber (escape-room phase 14, Task 62)", () => {
  const grid = [
    "#########",
    "#1.Q....#",
    "#2......#",
    "#3......#",
    "##D######",
    "#..D.####",
    "#########",
  ];
  const DIAL = {
    type: "dial",
    pads: [
      [2, 2],
      [4, 2],
    ],
    digits: 2,
    range: 10,
  };
  const CHAMBER = {
    rect: [1, 5, 4, 5],
    door: [2, 4],
    vault: { rect: [4, 5, 4, 5], door: [3, 5], item: [4, 5] },
  };
  const cache = (chamber?: unknown) => ({
    owner: 2,
    motif: "moon",
    riddle: "r",
    item: "watch",
    tiles: [{ at: [5, 1], motif: "moon" }],
    ...(chamber === undefined ? {} : { chamber }),
  });
  const parse = (chamber?: unknown, g = grid) =>
    parseRoom(
      `${JSON.stringify({ id: "t", name: "T", version: 1, beats: [], objects: { Q1: { ...DIAL, cache: cache(chamber) } } })}\n---\n${g.join("\n")}\n`,
    );
  const swap = (g: string[], x: number, y: number, ch: string) =>
    g.map((r, i) => (i === y ? r.slice(0, x) + ch + r.slice(x + 1) : r));

  it("accepts a valid chamber", () => {
    expect(() => parse(CHAMBER)).not.toThrow();
  });

  it("throws naming the cache and the field", () => {
    expect(() => parse()).toThrow(/cache Q1 needs a chamber/);
    expect(() => parse({ ...CHAMBER, rect: [1, 5, 40, 5] })).toThrow(
      /Q1 chamber rect is not inside the grid/,
    );
    expect(() => parse({ ...CHAMBER, rect: [4, 5, 1, 5] })).toThrow(/Q1 chamber rect has x0 > x1/);
    expect(() => parse(CHAMBER, swap(grid, 1, 5, "="))).toThrow(/Q1 chamber rect .* not allowed/);
    expect(() => parse({ ...CHAMBER, door: [2, 3] })).toThrow(/Q1 chamber door is not a D tile/);
    expect(() => parse({ ...CHAMBER, vault: { ...CHAMBER.vault, door: [4, 5] } })).toThrow(
      /Q1 chamber vault.door is not a D tile/,
    );
    expect(() => parse({ ...CHAMBER, vault: { ...CHAMBER.vault, rect: [0, 5, 4, 5] } })).toThrow(
      /Q1 chamber vault.rect/,
    );
    expect(() => parse({ ...CHAMBER, vault: { ...CHAMBER.vault, item: [1, 5] } })).toThrow(
      /Q1 chamber vault.item is not in vault.rect/,
    );
  });

  it("allows interior walls in rect but not in vault.rect", () => {
    expect(() => parse(CHAMBER, swap(grid, 2, 5, "#"))).not.toThrow();
    expect(() => parse(CHAMBER, swap(grid, 4, 5, "#"))).toThrow(/vault.rect/);
  });

  it("throws when the two doors touch and would be one door", () => {
    const touching = swap(swap(grid, 2, 5, "D"), 3, 5, "."); // (2,4) and (2,5) are one component
    expect(() =>
      parse({ ...CHAMBER, vault: { ...CHAMBER.vault, door: [2, 5] } }, touching),
    ).toThrow(/Q1 chamber door and vault.door touch/);
  });

  it("secretDoors gives, per cache, the chamber door and the vault door with their ids and tiles", () => {
    const room = parse(CHAMBER);
    const [one] = secretDoors(room);
    expect(secretDoors(room)).toHaveLength(1);
    expect(one?.id).toBe("Q1");
    expect(one?.chamber.kind).toBe("door");
    expect(one?.chamber.tiles).toEqual([{ x: 2, y: 4 }]);
    expect(one?.vault.tiles).toEqual([{ x: 3, y: 5 }]);
    expect(one?.chamber.id).not.toBe(one?.vault.id);
  });

  it("inRect is inclusive on all four edges", () => {
    const r: [number, number, number, number] = [1, 2, 3, 4];
    expect(inRect(r, { x: 1, y: 2 })).toBe(true);
    expect(inRect(r, { x: 3, y: 4 })).toBe(true);
    expect(inRect(r, { x: 0, y: 2 })).toBe(false);
    expect(inRect(r, { x: 3, y: 5 })).toBe(false);
  });
});

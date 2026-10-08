import { describe, expect, it } from "vitest";
import { parseRoom, RoomFormatError } from "./format.ts";

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

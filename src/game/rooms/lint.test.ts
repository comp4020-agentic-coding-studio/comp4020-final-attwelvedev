import { describe, expect, it } from "vitest";
import { parseRoom } from "./format.ts";
import { lintRoom } from "./lint.ts";

const header = (opensWhen = `["p1","p2","p3"]`, beatX = "[8,19]") =>
  `{"id":"t-room","name":"Test room","version":1,"beats":[{"name":"Three hands","x":${beatX},"intent":{"blind":"b","deaf":"d","mute":"m"}}],"objects":{"D1":{"opensWhen":${opensWhen}}}}`;

const GOOD = [
  "####################",
  "#1.#.........D...E.#",
  "#2.#....p....D.....#",
  "#3.B....p....D.....#",
  "#..#....p..........#",
  "####################",
];

const room = (grid = GOOD, head = header()) => parseRoom(`${head}\n---\n${grid.join("\n")}\n`);
const messages = (r = room()) => lintRoom(r).map((i) => i.message);

describe("lintRoom", () => {
  it("passes a good room", () => {
    expect(lintRoom(room())).toEqual([]);
  });

  it("names the room in every issue", () => {
    const bad = room(GOOD.map((r) => r.replace("E", ".")));
    expect(lintRoom(bad).every((i) => i.room === "t-room")).toBe(true);
  });

  it("flags a missing spawn", () => {
    expect(messages(room(GOOD.map((r) => r.replace("3", "."))))).toContainEqual(
      expect.stringMatching(/spawn 3/i),
    );
  });

  it("flags a duplicate spawn", () => {
    expect(messages(room(GOOD.map((r) => r.replace("#..#", "#1.#"))))).toContainEqual(
      expect.stringMatching(/spawn 1.*(more than once|duplicate)/i),
    );
  });

  it("flags a room with no exit", () => {
    expect(messages(room(GOOD.map((r) => r.replace("E", "."))))).toContainEqual(
      expect.stringMatching(/no exit/i),
    );
  });

  it("flags a door opensWhen that names an unknown id", () => {
    expect(messages(room(GOOD, header(`["p1","p2","p9"]`)))).toContainEqual(
      expect.stringMatching(/p9/),
    );
  });

  it("flags a door with no opensWhen", () => {
    const noOpens = `{"id":"t-room","name":"T","version":1,"beats":[{"name":"b","x":[8,19],"intent":{"blind":"b","deaf":"d","mute":"m"}}]}`;
    expect(messages(room(GOOD, noOpens))).toContainEqual(expect.stringMatching(/D1.*opensWhen/i));
  });

  it("flags a room with no beat whose door needs three plates (FR10)", () => {
    expect(messages(room(GOOD, header(`["p1","p2"]`)))).toContainEqual(
      expect.stringMatching(/three-plate|three plates|3 plates/i),
    );
    expect(messages(room(GOOD, header(`["p1","p2","p3"]`, "[0,5]")))).toContainEqual(
      expect.stringMatching(/three-plate|three plates|3 plates/i),
    );
  });

  it("flags a non-rectangular grid", () => {
    const ragged = [...GOOD];
    ragged[4] = "#..#....p.........#";
    expect(messages(room(ragged))).toContainEqual(expect.stringMatching(/rectang/i));
  });

  it("flags an exit unreachable from the spawns, assuming doors are open", () => {
    const walled = [...GOOD];
    walled[1] = "#1.#.........D#..E.#";
    walled[2] = "#2.#....p....D#....#";
    walled[3] = "#3.B....p....D#....#";
    walled[4] = "#..#....p.....#....#";
    expect(messages(room(walled))).toContainEqual(expect.stringMatching(/exit.*reach/i));
    // the same room with the wall opened is clean, so reachability goes through doors
    expect(messages(room())).toEqual([]);
  });
});

describe("lintRoom: hazards", () => {
  const head = (objects: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      id: "t-room",
      name: "Test room",
      version: 1,
      beats: [{ name: "Three hands", x: [8, 19], intent: { blind: "b", deaf: "d", mute: "m" } }],
      objects: { D1: { opensWhen: ["p1", "p2", "p3"] }, ...objects },
      ...extra,
    });
  const GRID = [
    "####################",
    "#1.K.C.......D...E.#",
    "#2.........p.D.....#",
    "#3.B.L.....p.D.....#",
    "#..#.......p.......#",
    "####################",
  ];
  const lint = (objects: Record<string, unknown>, grid = GRID, extra = {}) =>
    lintRoom(parseRoom(`${head(objects, extra)}\n---\n${grid.join("\n")}\n`)).map((i) => i.message);
  const GOOD = {
    C1: { zone: [4, 1, 8, 3], periodS: 6, watchingS: 3, offsetS: 0 },
    L1: { dir: "right", onS: 2, offS: 2, offsetS: 0 },
  };

  it("passes a room whose hazards give safe windows and have a checkpoint first", () => {
    expect(lint(GOOD)).toEqual([]);
  });

  it("flags a camera with under 2 s of safe time", () => {
    expect(lint({ ...GOOD, C1: { ...GOOD.C1, periodS: 4, watchingS: 3 } })).toContainEqual(
      expect.stringMatching(/camera C1.*2 s/i),
    );
  });

  it("flags a laser that is off for under 2 s", () => {
    expect(lint({ ...GOOD, L1: { ...GOOD.L1, offS: 1 } })).toContainEqual(
      expect.stringMatching(/laser L1.*2 s/i),
    );
  });

  it("flags a guard whose patrol point is not floor", () => {
    const grid = GRID.map((r, y) => (y === 2 ? "#2....G....p.D.....#" : r));
    expect(
      lint(
        {
          ...GOOD,
          G1: {
            patrol: [
              [6, 2],
              [0, 0],
            ],
          },
        },
        grid,
      ),
    ).toContainEqual(expect.stringMatching(/guard G1.*patrol/i));
    expect(
      lint(
        {
          ...GOOD,
          G1: {
            patrol: [
              [6, 2],
              [7, 2],
            ],
          },
        },
        grid,
      ),
    ).toEqual([]);
  });

  it("flags a sequence door with no sign, or a sign that lists the wrong plates", () => {
    const seq = { D1: { mode: "sequence", opensWhen: ["p2", "p1", "p3"] } };
    expect(lint({ ...GOOD, ...seq })).toContainEqual(expect.stringMatching(/door D1.*sign/i));
    const signed = GRID.map((r, y) => (y === 4 ? "#..#S......p.......#" : r));
    expect(lint({ ...GOOD, ...seq, S1: { shows: ["p1", "p2", "p3"] } }, signed)).toContainEqual(
      expect.stringMatching(/door D1.*sign/i),
    );
    expect(lint({ ...GOOD, ...seq, S1: { shows: ["p2", "p1", "p3"] } }, signed)).toEqual([]);
  });

  it("flags a flip zone outside the grid", () => {
    expect(lint(GOOD, GRID, { flips: [{ kind: "dark", zone: [0, 0, 99, 3] }] })).toContainEqual(
      expect.stringMatching(/flip.*zone/i),
    );
    expect(lint(GOOD, GRID, { flips: [{ kind: "dark", zone: [2, 1, 9, 3] }] })).toEqual([]);
  });

  it("flags a room whose first hazard comes before any checkpoint", () => {
    const noK = GRID.map((r) => r.replace("K", "."));
    expect(lint(GOOD, noK)).toContainEqual(
      expect.stringMatching(/checkpoint before the first hazard/i),
    );
    const lateK = GRID.map((r, y) => (y === 1 ? "#1...C..K....D...E.#" : r));
    expect(lint(GOOD, lateK)).toContainEqual(
      expect.stringMatching(/checkpoint before the first hazard/i),
    );
  });
});

import { describe, expect, it } from "vitest";
import { giveChambers } from "../sim/testing.ts";
import type { Role } from "../types.ts";
import { parseRoom, type Room } from "./format.ts";
import { cacheTypeFaults, lintPlates, lintRoom, uncoverSplitFault } from "./lint.ts";
import { loadRooms } from "./load.ts";

const header = (opensWhen = `["p1","p2","p3"]`, beatX = "[8,19]") =>
  `{"id":"t-room","name":"Test room","version":1,"beats":[{"name":"Three hands","x":${beatX},"intent":{"blind":"b","deaf":"d","mute":"m"}}],"objects":{"D1":{"opensWhen":${opensWhen}}},"hints":{"jobs":[{"beat":1,"goTo":"p1"}]}}`;

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
      hints: { jobs: [{ beat: 1, goTo: "p1" }] },
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
    C1: { facingDeg: 0, fovDeg: 90, range: 8, periodS: 6, watchingS: 3, offsetS: 0 },
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
    // (the plates sit 3 tiles apart: this test is about the sign, not the spacing)
    const signed = [
      "####################",
      "#1.K.C.......D...E.#",
      "#2......p....D.....#",
      "#3.B.L.....p.D.....#",
      "#..#S...........p..#",
      "####################",
    ];
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

  it("flags an alarm whose trigger is not a plate in the room", () => {
    const flip = (trigger: string) => ({ flips: [{ kind: "alarm", trigger, durationS: 8 }] });
    expect(lint(GOOD, GRID, flip("caught"))).toContainEqual(
      expect.stringMatching(/alarm.*caught/i),
    );
    expect(lint(GOOD, GRID, flip("p9"))).toContainEqual(expect.stringMatching(/alarm.*p9/i));
    expect(lint(GOOD, GRID, flip("p1"))).toEqual([]);
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

describe("lintRoom hints", () => {
  const withHints = (jobs: unknown[], extra = "") =>
    room(
      GOOD,
      header().replace(/,"hints":\{.*\}\}$/, `,"hints":{"jobs":${JSON.stringify(jobs)}}${extra}}`),
    );
  const ok = [
    { beat: 1, goTo: "p1", prefer: "blind" },
    { beat: 1, goTo: "p2", prefer: "deaf" },
    { beat: 1, goTo: "p3", prefer: "mute" },
  ];

  it("passes a room whose jobs all name things in it", () => {
    expect(messages(withHints(ok))).toEqual([]);
  });

  it("asks a room with beats for hints", () => {
    const bare = header().replace(/,"hints":\{.*\}\}$/, "}");
    expect(messages(room(GOOD, bare))).toContainEqual(expect.stringMatching(/no "hints"/));
  });

  it("flags a job that names a plate, crate or door that is not there", () => {
    expect(messages(withHints([...ok, { beat: 1, goTo: "p9" }]))).toContainEqual(
      expect.stringMatching(/p9.*not a plate/),
    );
    expect(messages(withHints([...ok, { beat: 1, push: "B7", to: [5, 2] }]))).toContainEqual(
      expect.stringMatching(/B7.*not a crate/),
    );
    expect(messages(withHints([{ ...ok[0], until: "D9" }, ...ok.slice(1)]))).toContainEqual(
      expect.stringMatching(/D9.*not a door/),
    );
  });

  it("flags a job in a beat the room does not have, and a beat with no job", () => {
    expect(messages(withHints([...ok, { beat: 4, goTo: "p1" }]))).toContainEqual(
      expect.stringMatching(/beat 4/),
    );
    expect(messages(withHints([{ beat: 2, goTo: "p1" }]))).toContainEqual(
      expect.stringMatching(/beat 1 .* has no job/),
    );
  });

  it("flags a waypoint that is not floor", () => {
    expect(messages(withHints([...ok, { beat: 1, goTo: [0, 0] }]))).toContainEqual(
      expect.stringMatching(/not floor/),
    );
  });
});

describe("the fixture rooms", () => {
  // spec/fixtures/rooms is what ROOMS_DIR points the server at in specs that need a tiny room
  it("load and pass the linter", () => {
    const rooms = loadRooms("./spec/fixtures/rooms");
    expect(rooms.map((r) => r.id)).toEqual(["01-tiny"]);
    for (const r of rooms) expect(lintRoom(r)).toEqual([]);
  });
});

describe("the draft rooms", () => {
  // spec/fixtures/drafts: a room is proved here, by the same bots and linter, before it ships
  // in rooms/. Kept apart from spec/fixtures/rooms, which the heist specs run a server on.
  it("load and pass the linter", () => {
    const rooms = loadRooms("./spec/fixtures/drafts");
    expect(rooms.map((r) => r.id)).toEqual(["00-stations-draft"]);
    for (const r of rooms) expect(lintRoom(r)).toEqual([]);
  });
});

describe("the sight fixture room", () => {
  // spec/layout/sight.test.ts: a wall between Can't hear's and Can't speak's spawns, so each is out
  // of the other's sight until the open ground east of it
  it("loads and passes the linter, with a wall between the deaf and mute spawns", () => {
    const rooms = loadRooms("./spec/fixtures/rooms-sight");
    expect(rooms.map((r) => r.id)).toEqual(["01-wall"]);
    for (const r of rooms) expect(lintRoom(r)).toEqual([]);
    expect(rooms[0]?.grid[3]?.slice(0, 10)).toBe("#".repeat(10));
  });
});

describe("lintRoom: line-of-sight rules", () => {
  const intent = `"intent":{"blind":"b","deaf":"d","mute":"m"}`;
  const beat = (x: string, extra = "") => `{"name":"Beat","x":${x}${extra},${intent}}`;
  const head = (beats: string[], objects: Record<string, unknown> = {}, extra = "") =>
    `{"id":"t-room","name":"Test room","version":1,"beats":[${beats.join(",")}],"objects":${JSON.stringify({ D1: { opensWhen: ["p1", "p2", "p3"] }, ...objects })},"hints":{"jobs":[${beats.map((_, i) => `{"beat":${i + 1},"goTo":"p1"}`).join(",")}]}${extra}}`;
  const lint = (grid: string[], beats: string[], objects = {}, extra = "") =>
    lintRoom(parseRoom(`${head(beats, objects, extra)}\n---\n${grid.join("\n")}\n`)).map(
      (i) => i.message,
    );
  const BASE = [
    "####################",
    "#1.c.....p...D...E.#",
    "#2.......p...D.....#",
    "#3.......p.........#",
    "#..................#",
    "####################",
  ];
  const WHOLE = beat("[1,18]");

  it("allows a clue only as a keypad's clue, where the presence rule checks it", () => {
    expect(lint(BASE, [WHOLE])).toContainEqual(expect.stringMatching(/clue c1.*keypad/i));
  });

  it("flags a beat that is dark everywhere while an alarm can sound in it", () => {
    const flips = (zone: string) =>
      `,"flips":[{"kind":"dark","zone":${zone}},{"kind":"alarm","trigger":"p1","durationS":8}]`;
    const plain = BASE.map((r) => r.replace("c", "."));
    const beats = [beat("[8,10]"), beat("[11,18]")];
    expect(lint(plain, beats, {}, flips("[8,1,10,4]"))).toContainEqual(
      expect.stringMatching(/dark.*alarm/i),
    );
    // dark but no alarm in the beat (the trigger plate is in the other beat): fine
    expect(lint(plain, [beat("[1,7]"), beat("[8,18]")], {}, flips("[1,1,7,4]"))).not.toContainEqual(
      expect.stringMatching(/dark.*alarm/i),
    );
    // alarmed but only partly dark: fine
    expect(lint(plain, beats, {}, flips("[8,1,10,2]"))).not.toContainEqual(
      expect.stringMatching(/dark.*alarm/i),
    );
  });

  it("flags sequence plates closer than 3 tiles, so one body cannot hold two", () => {
    const grid = [
      "####################",
      "#1.p.p.p.....D...E.#",
      "#2...S.......D.....#",
      "#3...........D.....#",
      "####################",
    ];
    const seq = {
      D1: { mode: "sequence", opensWhen: ["p1", "p2", "p3"] },
      S1: { shows: ["p1", "p2", "p3"] },
    };
    expect(lint(grid, [WHOLE], seq)).toContainEqual(expect.stringMatching(/plates.*3 tiles/i));
    const spread = grid.map((r, y) => (y === 1 ? "#1.p...p...p.D...E.#".slice(0, 20) : r));
    expect(lint(spread, [WHOLE], seq)).not.toContainEqual(expect.stringMatching(/3 tiles/i));
  });
});

describe("lintRoom: glass, vents and hatches are walls for walking", () => {
  it("flags an exit behind a vent, glass or hatch wall as unreachable", () => {
    for (const ch of ["%", "=", "H"]) {
      const walled = [...GOOD];
      walled[1] = `#1.#.........D${ch}..E.#`;
      walled[2] = `#2.#....p....D${ch}....#`;
      walled[3] = `#3.B....p....D${ch}....#`;
      walled[4] = `#..#....p.....${ch}....#`;
      expect(messages(room(walled))).toContainEqual(expect.stringMatching(/exit.*reach/i));
    }
  });
});

// Spec FR1: no single role, on any one tile, holding any one piece of gear (or none), perceives a
// station's clue, its control and its feedback at once. FR2: two stations can be worked at once.
describe("lintRoom: presence (FR1, FR2)", () => {
  const room = (grid: string[], objects: Record<string, unknown>) =>
    parseRoom(
      `${JSON.stringify({
        id: "t-presence",
        name: "T",
        version: 1,
        beats: [
          { name: "B", x: [0, grid[0]?.length ?? 1], intent: { blind: "b", deaf: "d", mute: "m" } },
        ],
        objects: { D1: { opensWhen: ["p1", "p2", "p3"] }, ...objects },
        hints: { jobs: [{ beat: 1, goTo: "E", all: true }] },
      })}\n---\n${grid.join("\n")}\n`,
    );
  const presence = (r: ReturnType<typeof room>) =>
    lintRoom(r)
      .map((i) => i.message)
      .filter((m) => /perceives|at once/.test(m));
  const PADS = (y: number) => [
    [4, y],
    [6, y],
  ];
  const WIRES = (y: number) => [
    [10, y],
    [11, y],
    [12, y],
  ];

  it("flags a dial whose back is audible from its pads, for a hearing role with the stethoscope", () => {
    const grid = [
      "#################",
      "#1...Q..........#",
      "#2..............#",
      "#3...g..ppp.D.E.#",
      "#################",
    ];
    const r = room(grid, {
      Q1: { type: "dial", pads: PADS(1), back: [5, 2] },
      Q2: {
        type: "radio",
        pads: [
          [9, 1],
          [11, 1],
        ],
      },
      g1: { item: "stethoscope" },
    });
    expect(presence(r)).toContainEqual(expect.stringMatching(/Q1.*(blind|mute).*stethoscope/i));
  });

  it("flags wires whose plaque is in sight of the wire tiles, for the sighted", () => {
    const grid = [
      "#################",
      "#1........Q.....#",
      "#2..S...........#",
      "#3......ppp.D.E.#",
      "#################",
    ];
    const r = room(grid, {
      Q1: { type: "wires", wires: WIRES(2), plaque: "S1" },
      S1: {},
    });
    expect(presence(r)).toContainEqual(expect.stringMatching(/Q1.*(deaf|mute)/i));
  });

  it("flags a keypad whose earpiece can be worn at the keypad (spec probe #12)", () => {
    const grid = [
      "#################",
      "#1.Q.g..........#",
      "#2..............#",
      "#3......ppp.D.E.#",
      "#################",
    ];
    const keys = [0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => [8 + x, 1 + y]));
    const r = room(grid, {
      Q1: { type: "keypad", keys, clue: "g1", length: 3 },
      g1: { item: "earpiece" },
    });
    expect(presence(r)).toContainEqual(expect.stringMatching(/Q1.*mute.*earpiece/i));
  });

  it("flags switches whose lamps can be seen from the buttons", () => {
    const grid = [
      "#################",
      "#1.Q............#",
      "#2..............#",
      "#3......ppp.D.E.#",
      "#################",
    ];
    const r = room(grid, {
      Q1: {
        type: "switches",
        buttons: [
          [2, 2],
          [3, 2],
          [4, 2],
        ],
        lamps: [
          [8, 1],
          [9, 1],
          [10, 1],
        ],
        cols: 3,
      },
    });
    expect(presence(r)).toContainEqual(expect.stringMatching(/Q1.*(deaf|mute)/i));
  });

  it("flags a room where only one station can be worked from the start (FR2)", () => {
    const grid = [
      "#################",
      "#1....#.Q.......#",
      "#2....D.........#",
      "#3.Q..#.ppp.D.E.#",
      "#################",
    ];
    const r = parseRoom(
      `${JSON.stringify({
        id: "t-fr2",
        name: "T",
        version: 1,
        beats: [{ name: "B", x: [0, 16], intent: { blind: "b", deaf: "d", mute: "m" } }],
        objects: {
          D1: { opensWhen: ["Q1"] },
          D2: { opensWhen: ["p1", "p2", "p3"] },
          Q1: {
            type: "radio",
            pads: [
              [2, 2],
              [4, 2],
            ],
          },
          Q2: {
            type: "radio",
            pads: [
              [8, 2],
              [10, 2],
            ],
          },
        },
        hints: { jobs: [{ beat: 1, goTo: "E", all: true }] },
      })}\n---\n${grid.join("\n")}\n`,
    );
    expect(presence(r)).toContainEqual(expect.stringMatching(/two stations.*at once/i));
  });

  it("passes 00-stations-draft", () => {
    const [draft] = loadRooms("./spec/fixtures/drafts");
    expect(draft?.id).toBe("00-stations-draft");
    expect(lintRoom(draft as Room)).toEqual([]);
  });

  // a 60x30 room with eight stations: measured 1.3 s on the dev machine (2026-10-28)
  it("lints a 60x30 room in under 10 s", () => {
    const [draft] = loadRooms("./spec/fixtures/drafts");
    const text = big(draft as Room);
    const started = performance.now();
    lintRoom(parseRoom(text));
    expect(performance.now() - started).toBeLessThan(10_000);
  });
});

// The fixture's eight stations, set in a 60x30 grid (the floor extended east and south).
function big(r: Room): string {
  const rows = Array.from({ length: 30 }, (_, y) =>
    Array.from({ length: 60 }, (_, x) => {
      const ch = r.grid[y]?.[x];
      const o = r.objects.find((o) => o.tiles.some((t) => t.x === x && t.y === y));
      if (o && o.kind !== "door" && o.kind !== "exit")
        return LETTER[o.kind] ?? (o.id[0] === "s" ? o.id[1] : ".");
      if (o?.kind === "exit") return "E";
      if (ch !== undefined) return ch === "." ? "." : ch;
      return x === 0 || y === 0 || x === 59 || y === 29 ? "#" : y > 12 ? "." : "#";
    }).join(""),
  );
  return `${JSON.stringify(r.meta)}\n---\n${rows.join("\n")}\n`;
}
const LETTER: Record<string, string> = {
  station: "Q",
  gear: "g",
  hatch: "H",
  bell: "b",
  lamp: "l",
  ink: "u",
  sign: "S",
  clue: "c",
  plate: "p",
};

// Clues FR4: a station whose clue cannot reach a person, or a link without its motif at both ends,
// fails the room. spec/fixtures/clue-faults is the stations draft with each fault once (kept out of
// the drafts dir, which the bots sweep).
describe("lintRoom: clue paths (escape-room Task 12)", () => {
  it("gives exactly one message per fault in 01-clue-faults", () => {
    const [faults] = loadRooms("./spec/fixtures/clue-faults");
    expect(faults?.id).toBe("01-clue-faults");
    expect(
      lintRoom(faults as Room)
        .map((i) => i.message)
        .sort(),
    ).toEqual(
      [
        "Q8 (switches) has no target card",
        "Q4 (wires): its plaque S1 has no text any role can read",
        "Q2 (vault): Q6 reveals no symbol",
        "Q3 yields to Q5 but they share no motif",
      ].sort(),
    );
  });
});

// Caches (phase 14, Task 53): the clue path of a hidden optional station.
describe("lintRoom: caches", () => {
  const room = (
    grid: string[],
    objects: Record<string, unknown>,
    extra: Record<string, unknown> = {},
  ) => {
    const given = giveChambers(grid, { D1: { opensWhen: ["p1", "p2", "p3"] }, ...objects });
    return parseRoom(
      `${JSON.stringify({
        id: "t-cache",
        name: "T",
        version: 1,
        beats: [
          { name: "B", x: [0, grid[0]?.length ?? 1], intent: { blind: "b", deaf: "d", mute: "m" } },
        ],
        objects: given.objects,
        hints: { jobs: [{ beat: 1, goTo: "E", all: true }] },
        ...extra,
      })}\n---\n${given.grid.join("\n")}\n`,
    );
  };
  // The clue-path faults only. The chamber's own rules (a control tile outside the chamber, a
  // sealed vault...) have their own describe below, and these rooms keep the station in the room.
  const CHAMBER_RULE =
    /control tile .* outside its chamber|back tile|needs a stethoscope somewhere in its room/;
  const faults = (r: Room) =>
    lintRoom(r)
      .map((i) => i.message)
      .filter((m) => /cache/.test(m) && !CHAMBER_RULE.test(m));
  const at = (grid: string[], ...cells: [number, number, string][]) =>
    grid.map((row, y) =>
      [...row].map((ch, x) => cells.find(([cx, cy]) => cx === x && cy === y)?.[2] ?? ch).join(""),
    );
  const spec = (tiles: [number, number, string][], extra = {}) => ({
    owner: 2,
    motif: "moon",
    riddle: "Where the moon watches, listen twice.",
    item: "watch",
    tiles: tiles.map(([x, y, motif]) => ({ at: [x, y], motif })),
    ...extra,
  });
  const MOON_STAR: [number, number, string][] = [
    [13, 1, "moon"],
    [14, 1, "star"],
  ];
  // a dial whose clue is the tumbler at its back (a stethoscope, g1) and whose cache tile is open floor
  const DIAL_GRID = [
    "#################",
    "#1...Q..........#",
    "#2..............#",
    "#3.g....ppp.D.E.#",
    "#################",
  ];
  const dial = (cache: unknown) => ({
    Q1: {
      type: "dial",
      pads: [
        [4, 1],
        [6, 1],
      ],
      back: [5, 2],
      cache,
    },
    g1: { item: "stethoscope" },
  });

  it("passes a cache whose tile can be walked to and seen and whose clue two roles can perceive", () => {
    expect(faults(room(DIAL_GRID, dial(spec(MOON_STAR))))).toEqual([]);
  });

  it("flags an uncover tile that cannot be walked to", () => {
    const sealed = at(DIAL_GRID, [14, 2, "#"], [15, 1, "#"], [15, 3, "#"]);
    const r = room(
      sealed,
      dial(
        spec([
          [15, 2, "moon"],
          [13, 1, "star"],
        ]),
      ),
    );
    expect(faults(r)).toContainEqual(expect.stringMatching(/Q1.*moon tile.*walked to/));
  });

  it("flags an uncover tile on a wall", () => {
    const r = room(
      DIAL_GRID,
      dial(
        spec([
          [0, 0, "moon"],
          [14, 1, "star"],
        ]),
      ),
    );
    expect(faults(r)).toContainEqual(expect.stringMatching(/Q1.*moon tile.*not floor/));
  });

  it("flags an uncover tile no sighted role can see (inside a dark zone)", () => {
    const r = room(DIAL_GRID, dial(spec(MOON_STAR)), {
      flips: [{ kind: "dark", zone: [13, 1, 13, 1] }],
    });
    expect(faults(r)).toContainEqual(expect.stringMatching(/Q1.*moon tile.*no sighted role/));
  });

  it("flags a clue no role can perceive (a dial with no stethoscope)", () => {
    const objects = dial(spec(MOON_STAR));
    const r = room(at(DIAL_GRID, [3, 3, ".".toString()]), { Q1: objects.Q1 });
    expect(faults(r)).toContainEqual(expect.stringMatching(/Q1.*no role can perceive its clue/));
  });

  describe("one role alone (spec FR6)", () => {
    const set = (...r: Role[]) => new Set<Role>(r);

    it("names the role when the same single role perceives the clue and the uncover tile", () => {
      expect(uncoverSplitFault("Q1", set("deaf"), set("deaf"))).toMatch(
        /Q1.*only deaf perceives its clue and its uncover tile/,
      );
    });

    it("passes when a different role can see the tile than the one that perceives the clue", () => {
      expect(uncoverSplitFault("Q1", set("deaf"), set("deaf", "mute"))).toBeNull();
      expect(uncoverSplitFault("Q1", set("blind", "mute"), set("deaf", "mute"))).toBeNull();
      expect(uncoverSplitFault("Q1", set("blind"), set("deaf"))).toBeNull();
    });

    it("is run by lintRoom: motif tiles are drawn for both sighted roles, so a real room splits", () => {
      const wires = {
        Q1: {
          type: "wires",
          wires: [
            [10, 2],
            [11, 2],
            [12, 2],
          ],
          plaque: "S1",
          cache: spec(MOON_STAR),
        },
        S1: { visible_to: ["deaf"] },
      };
      const grid = [
        "#################",
        "#1........Q.....#",
        "#2..S...........#",
        "#3......ppp.D.E.#",
        "#################",
      ];
      expect(faults(room(grid, wires))).toEqual([]);
    });
  });

  describe("a cache is optional", () => {
    // Q1 and Q2 sit behind D1 (which Q1 opens); Q3 and Q4 are in the room the team starts in
    const FR2_GRID = [
      "##################",
      "#1....#.Q...Q....#",
      "#2....D..........#",
      "#3.Q.Q#.ppp.D.E..#",
      "##################",
    ];
    const dials = (cacheOn: "Q3" | "Q4" | null) => {
      const d = (x: number, y: number, id: string) => ({
        type: "dial",
        pads: [
          [x - 1, y + 1 > 3 ? y - 1 : y + 1],
          [x + 1, y + 1 > 3 ? y - 1 : y + 1],
        ],
        ...(cacheOn === id
          ? {
              cache: spec([
                [2, 1, "moon"],
                [3, 1, "star"],
              ]),
            }
          : {}),
      });
      return {
        D1: { opensWhen: ["Q1"] },
        D2: { opensWhen: ["p1", "p2", "p3"] },
        Q1: d(8, 1, "Q1"),
        Q2: d(12, 1, "Q2"),
        Q3: d(3, 3, "Q3"),
        Q4: d(5, 3, "Q4"),
      };
    };
    const open = (r: Room) =>
      lintRoom(r)
        .map((i) => i.message)
        .filter((m) => /at once/.test(m));

    it("does not count a cache as one of the two stations open at once (FR2)", () => {
      expect(open(room(FR2_GRID, dials("Q3")))).toContainEqual(
        expect.stringMatching(/only 1 station.*two stations.*at once/),
      );
    });

    it("counts the same station when it is not a cache", () => {
      expect(open(room(FR2_GRID, dials(null)))).toEqual([]);
    });

    it("flags a door that opens when a cache is solved", () => {
      const objects = { ...dials("Q3"), D1: { opensWhen: ["Q3"] } };
      expect(faults(room(FR2_GRID, objects))).toContainEqual(
        expect.stringMatching(/door D1.*cache Q3/),
      );
    });
  });
});

describe("cacheTypeFaults: a cache is a type the heist has already taught", () => {
  // one anchor per station listed, so the grid and the metadata agree
  const roomWith = (id: string, objects: Record<string, unknown>) => {
    const n = Object.keys(objects).length;
    const wall = "#".repeat(n + 5);
    const given = giveChambers([wall, `#123${"Q".repeat(n)}#`, wall], objects, 1);
    return parseRoom(
      `${JSON.stringify({ id, name: id, version: 1, beats: [], objects: given.objects })}\n---\n${given.grid.join("\n")}\n`,
    );
  };
  const CACHE = {
    owner: 1,
    motif: "moon",
    riddle: "r",
    item: "watch",
    tiles: [{ at: [1, 2], motif: "moon" }],
  };
  const PADS = [
    [1, 2],
    [3, 2],
  ];
  const plain = { type: "dial", pads: PADS };
  const cache = { type: "dial", pads: PADS, cache: CACHE };

  it("flags a cache of a type first met in its own room", () => {
    expect(cacheTypeFaults([roomWith("r1", { Q1: cache })])).toEqual([
      expect.stringMatching(/r1.*Q1.*dial.*not met/),
    ]);
  });

  it("passes a cache of a type an earlier room taught", () => {
    expect(cacheTypeFaults([roomWith("r1", { Q1: plain }), roomWith("r2", { Q1: cache })])).toEqual(
      [],
    );
  });

  it("passes a cache beside a plain station of its type that comes first in its own room", () => {
    expect(cacheTypeFaults([roomWith("r1", { Q1: plain, Q2: cache })])).toEqual([]);
    expect(cacheTypeFaults([roomWith("r1", { Q1: cache, Q2: plain })])).toHaveLength(1);
  });

  it("does not count another cache as having taught the type", () => {
    expect(
      cacheTypeFaults([roomWith("r1", { Q1: cache }), roomWith("r2", { Q1: cache })]),
    ).toHaveLength(2);
  });
});

// Caches (phase 14, Task 62): the chamber is a dead end behind its secret door, and holds only its station.
describe("lintRoom: a cache's chamber", () => {
  // The room above, a secret door at (3,5), a chamber (1..9, 6..8) whose vault (8..9, 8) is behind the
  // vault door (7,8). The dial's pads and anchor are inside; its back tile is a clue and may lie anywhere.
  const GRID = [
    "####################",
    "#1.......p....D..E.#",
    "#2.......p....D....#",
    "#3.......p....D..$.#",
    "#.g...........#....#",
    "###D################",
    "#.........##########",
    "#.......############",
    "#....Q.D..##########",
    "####################",
  ];
  const CHAMBER = {
    rect: [1, 6, 9, 8],
    door: [3, 5],
    vault: { rect: [8, 8, 9, 8], door: [7, 8], item: [9, 8] },
  };
  const objects = (over: { chamber?: unknown; q?: object; gear?: boolean } = {}) => ({
    D1: { opensWhen: ["p1", "p2", "p3"] },
    ...(over.gear === false ? {} : { g1: { item: "stethoscope" } }),
    Q1: {
      type: "dial",
      pads: [
        [4, 8],
        [6, 8],
      ],
      back: [5, 6], // 2 tiles from the dial, over 1.5 from each pad, so no pad can hear the tumbler
      digits: 2,
      range: 10,
      ...over.q,
      cache: {
        owner: 1,
        motif: "moon",
        riddle: "r",
        item: "watch",
        tiles: [
          { at: [2, 4], motif: "moon" },
          { at: [4, 4], motif: "star" },
        ],
        chamber: over.chamber ?? CHAMBER,
      },
    },
  });
  const build = (grid = GRID, over: Parameters<typeof objects>[0] = {}) =>
    parseRoom(
      `${JSON.stringify({
        id: "t-chamber",
        name: "T",
        version: 1,
        beats: [{ name: "B", x: [0, 19], intent: { blind: "b", deaf: "d", mute: "m" } }],
        objects: objects(over),
        hints: { jobs: [{ beat: 1, goTo: "E", all: true }] },
      })}\n---\n${grid.join("\n")}\n`,
    );
  const swap = (g: string[], x: number, y: number, ch: string) =>
    g.map((r, i) => (i === y ? r.slice(0, x) + ch + r.slice(x + 1) : r));
  const faults = (r: Room) => lintRoom(r).map((i) => i.message);

  it("passes a well-formed chamber, and a secret door needs no opensWhen", () => {
    expect(faults(build())).toEqual([]);
  });

  it("flags a chamber door that does not border chamber floor and the room", () => {
    const g = swap(swap(GRID, 3, 5, "#"), 12, 5, "D"); // a door in the wall away from the chamber
    expect(faults(build(g, { chamber: { ...CHAMBER, door: [12, 5] } }))).toContainEqual(
      expect.stringMatching(/chamber door does not border/),
    );
  });

  it("flags a vault door that does not border the vault and the rest of the chamber", () => {
    const g = swap(swap(GRID, 7, 8, "."), 5, 7, "D");
    expect(
      faults(build(g, { chamber: { ...CHAMBER, vault: { ...CHAMBER.vault, door: [5, 7] } } })),
    ).toContainEqual(expect.stringMatching(/vault door does not border/));
  });

  it("flags a chamber that can be reached from a spawn with both secret doors closed", () => {
    const g = swap(GRID, 12, 5, "."); // a gap in the floor between the room and the chamber
    const g2 = swap(swap(g, 12, 6, "."), 11, 6, ".");
    const open = swap(g2, 10, 6, ".");
    expect(faults(build(open, { chamber: { ...CHAMBER, rect: [1, 6, 12, 8] } }))).toContainEqual(
      expect.stringMatching(/chamber floor can be reached/),
    );
  });

  it("flags a vault that is not sealed when its door is shut", () => {
    const g = swap(GRID, 7, 7, ".");
    const g2 = swap(swap(g, 8, 7, "."), 9, 7, ".");
    expect(faults(build(g2, { chamber: { ...CHAMBER, rect: [1, 6, 9, 8] } }))).toContainEqual(
      expect.stringMatching(/vault can be reached without opening/),
    );
  });

  it("flags an exit, plate, spawn, checkpoint, hazard, crate, gear or loot inside the rect", () => {
    for (const ch of ["E", "p", "1", "$", "B"]) {
      const g = swap(GRID, 2, 7, ch);
      expect(faults(build(g)), ch).toContainEqual(expect.stringMatching(/lies inside its chamber/));
    }
  });

  describe("a dial cache's inspection plate and a stethoscope in its room (Task 66)", () => {
    const withBack = (back: number[], grid = GRID) => faults(build(grid, { q: { back } }));
    it.each([
      ["no back tile", () => faults(build(GRID, { q: { back: undefined } })), /no back tile/],
      [
        "a back tile outside the chamber",
        () => withBack([3, 4]),
        /back tile .* outside its chamber/,
      ],
      [
        "a back tile on a wall",
        () => withBack([5, 6], swap(GRID, 5, 6, "#")),
        /back tile .* not a floor tile/,
      ],
      ["a back tile too far from the dial", () => withBack([1, 6]), /back tile .* from its dial/],
      [
        "no stethoscope anywhere in the room",
        () => faults(build(swap(GRID, 2, 4, "."), { gear: false })),
        /needs a stethoscope somewhere in its room/,
      ],
    ])("flags %s", (_name, run, message) => {
      expect(run()).toContainEqual(expect.stringMatching(message));
    });

    it("passes the well-formed plate with the room's own stethoscope, and gear inside the chamber fails", () => {
      expect(faults(build())).toEqual([]);
      // the chamber holds only its own station again: any gear tile in it, a stethoscope included, fails
      for (const item of ["uv", "stethoscope"]) {
        const objs = JSON.parse(JSON.stringify(objects()));
        objs.g2 = { item };
        const r = parseRoom(
          `${JSON.stringify({
            id: "t",
            name: "T",
            version: 1,
            beats: [{ name: "B", x: [0, 19], intent: { blind: "b", deaf: "d", mute: "m" } }],
            objects: objs,
            hints: { jobs: [{ beat: 1, goTo: "E", all: true }] },
          })}\n---\n${swap(GRID, 2, 7, "g").join("\n")}\n`,
        );
        expect(faults(r), item).toContainEqual(expect.stringMatching(/lies inside its chamber/));
      }
    });

    it("asks nothing of a chamber whose station is not a dial", () => {
      const keypad = {
        type: "keypad",
        keys: [
          [4, 8],
          [5, 8],
          [6, 8],
        ],
        length: 1,
        back: undefined,
      };
      expect(faults(build(swap(GRID, 2, 7, "."), { q: keypad }))).not.toContainEqual(
        expect.stringMatching(/back tile|stethoscope somewhere/),
      );
    });
  });

  it("flags a station control tile outside the chamber, but not a clue tile", () => {
    expect(faults(build(GRID, { q: { back: [2, 2] } }))).not.toContainEqual(
      expect.stringMatching(/control tile/),
    );
    const moved = {
      pads: [
        [4, 3],
        [6, 8],
      ],
    };
    expect(faults(build(GRID, { q: moved }))).toContainEqual(
      expect.stringMatching(/control tile \(4,3\) lies outside/),
    );
  });

  it("still flags a plain door with no opensWhen (only secret doors are exempt)", () => {
    const withDoor = swap(GRID, 15, 4, "D"); // another door tile, away from any chamber
    const r = parseRoom(
      `${JSON.stringify({
        id: "t",
        name: "T",
        version: 1,
        beats: [{ name: "B", x: [0, 19], intent: { blind: "b", deaf: "d", mute: "m" } }],
        objects: objects(),
        hints: { jobs: [{ beat: 1, goTo: "E", all: true }] },
      })}\n---\n${withDoor.join("\n")}\n`,
    );
    expect(faults(r)).toContainEqual(expect.stringMatching(/door D\d+ has no opensWhen/));
  });
});

// Braille plates (Task 73, FR9): rooms 4 to 9 carry exactly one, its number from one station's
// answer, and nobody can learn that number any other way.
describe("lintPlates", () => {
  const KEYS = [0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => [10 + x, 1 + y]));
  const DIAL = {
    type: "dial",
    pads: [
      [5, 1],
      [7, 1],
    ],
    digits: 2,
    range: 10,
  };
  const plateRoom = (id: string, objects: Record<string, unknown>, rows?: string[]) => {
    const grid = rows ?? [
      "################",
      "#1....Q.....o..#",
      "#2.............#",
      "#3.............#",
      "#..............#",
      "################",
    ];
    const head = { id, name: "T", version: 1, beats: [], objects };
    return parseRoom(`${JSON.stringify(head)}\n---\n${grid.join("\n")}\n`);
  };
  const plates = (r: Room, on: readonly string[] = [r.id]) => lintPlates(r, on);

  it("a plated room with no plate, or two, fails", () => {
    const none = plateRoom("05-x", { Q1: DIAL }, [
      "################",
      "#1....Q........#",
      "#2.............#",
      "#3.............#",
      "################",
    ]);
    expect(plates(none)).toEqual(["room needs exactly one braille plate (o), has 0"]);
    const two = plateRoom(
      "05-x",
      { Q1: DIAL, o1: { for: "Q1", part: 0 }, o2: { for: "Q1", part: 1 } },
      [
        "################",
        "#1....Q..o..o..#",
        "#2.............#",
        "#3.............#",
        "################",
      ],
    );
    expect(plates(two)).toContain("room needs exactly one braille plate (o), has 2");
    // ungated, nobody asks for one
    expect(plates(none, [])).toEqual([]);
  });

  it("a plate in rooms 1 to 3 fails", () => {
    const r = plateRoom("02-x", { Q1: DIAL, o1: { for: "Q1", part: 0 } });
    expect(plates(r, [])).toEqual(["plate o1: rooms 1 to 3 have no braille plates"]);
  });

  it("a plate for no station, a teaching station or a cache fails", () => {
    expect(plates(plateRoom("05-x", { Q1: DIAL, o1: { for: "Q9", part: 0 } }))).toEqual([
      "plate o1 is for Q9, which is not a station in this room",
    ]);
    expect(
      plates(plateRoom("05-x", { Q1: { ...DIAL, teach: true }, o1: { for: "Q1", part: 0 } })),
    ).toEqual(["plate o1 is for Q1, a teaching station: its lamp gives the number away"]);
    const cache = giveChambers(
      [
        "################",
        "#1....Q.....o..#",
        "#2.............#",
        "#3.............#",
        "#..............#",
        "################",
      ],
      {
        Q1: {
          ...DIAL,
          cache: {
            owner: 1,
            motif: "moon",
            riddle: "r",
            item: "watch",
            tiles: [{ at: [3, 4], motif: "moon" }],
          },
        },
        o1: { for: "Q1", part: 0 },
      },
    );
    expect(plates(plateRoom("05-x", cache.objects, cache.grid))).toEqual([
      "plate o1 is for Q1, a cache: optional, so it cannot carry what the room needs",
    ]);
  });

  it("a part out of range, or a station a plate cannot carry, fails", () => {
    expect(plates(plateRoom("05-x", { Q1: DIAL, o1: { for: "Q1", part: 2 } }))).toEqual([
      "plate o1 carries part 2 of Q1 (dial), which has 2",
    ]);
    expect(
      plates(
        plateRoom("05-x", {
          Q1: {
            type: "wires",
            wires: [
              [5, 2],
              [6, 2],
              [7, 2],
            ],
            plaque: "S1",
          },
          o1: { for: "Q1", part: 1 },
        }),
      ),
    ).toEqual(["plate o1 carries part 1 of Q1 (wires), which has 1"]);
    expect(
      plates(
        plateRoom("05-x", {
          Q1: {
            type: "bells",
            bells: [
              [5, 2],
              [6, 2],
            ],
            tune: [8, 2],
          },
          o1: { for: "Q1", part: 0 },
        }),
      ),
    ).toEqual(["plate o1 is for Q1 (bells), which a plate cannot carry"]);
  });

  it("a dial's carried digit is never sounded by its tumbler (the guard in perception.ts)", () => {
    const r = plateRoom("05-x", { Q1: { ...DIAL, back: [6, 3] }, o1: { for: "Q1", part: 1 } });
    expect(plates(r)).toEqual([]);
  });

  it("a keypad whose tune plays the carried key fails", () => {
    const grid = [
      "################",
      "#1....Q...KKK.o#",
      "#2..c.....KKK..#",
      "#3........KKK..#",
      "################",
    ].map((row) => row.replace(/K/g, "."));
    const r = plateRoom(
      "05-x",
      { Q1: { type: "keypad", keys: KEYS, clue: "c1", length: 3 }, o1: { for: "Q1", part: 1 } },
      grid,
    );
    expect(plates(r)).toEqual(["plate o1: Q1's tune plays the key it carries"]);
  });

  it("a numbered wire panel names the cut, so fails", () => {
    const r = plateRoom("05-x", {
      Q1: {
        type: "wires",
        wires: [
          [5, 2],
          [6, 2],
          [7, 2],
        ],
        plaque: "S1",
        numbered: true,
      },
      o1: { for: "Q1", part: 0 },
    });
    expect(plates(r)).toEqual(["plate o1: Q1's plaque names the wire to cut"]);
  });

  it("today's rooms 4 to 9, gated, each lack only their plate", () => {
    const rooms = loadRooms("./rooms").filter((r) => /^0[4-9]-/.test(r.id));
    expect(rooms).toHaveLength(6);
    for (const r of rooms) {
      expect(plates(r), r.id).toEqual(["room needs exactly one braille plate (o), has 0"]);
    }
  });

  it("room 4 without a plate fails once gated", () => {
    // becomes green in Task 74: room 4 gains o1 and joins PLATE_ROOMS
    const four = loadRooms("./rooms").find((r) => r.id === "04-the-safe") as Room;
    expect(lintPlates(four)).toEqual([]);
    expect(lintPlates(four, ["04-the-safe"])).toEqual([
      "room needs exactly one braille plate (o), has 0",
    ]);
  });
});

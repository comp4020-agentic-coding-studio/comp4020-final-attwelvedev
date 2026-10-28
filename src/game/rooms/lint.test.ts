import { describe, expect, it } from "vitest";
import { parseRoom, type Room } from "./format.ts";
import { lintRoom } from "./lint.ts";
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

import { describe, expect, it } from "vitest";
import { parseRoom } from "./format.ts";
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

  it("allows a clue only inside a beat that declares a cue", () => {
    expect(lint(BASE, [WHOLE])).toContainEqual(expect.stringMatching(/clue c1.*cue/i));
    expect(lint(BASE, [beat("[1,18]", ',"cue":"twin"')])).not.toContainEqual(
      expect.stringMatching(/clue/i),
    );
    // a cue beat elsewhere does not cover it
    expect(lint(BASE, [beat("[1,2]"), beat("[4,18]", ',"cue":"split"')])).toContainEqual(
      expect.stringMatching(/clue c1.*cue/i),
    );
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

  it("requires every role to lead a beat in a room that says leads: true", () => {
    const plain = BASE.map((r) => r.replace("c", "."));
    const led = (...roles: string[]) =>
      roles.map((r, i) => beat(`[${1 + i * 6},${6 + i * 6}]`, `,"lead":"${r}"`));
    const extra = `,"leads":true`;
    expect(lint(plain, led("blind", "deaf"), {}, extra)).toContainEqual(
      expect.stringMatching(/mute as its lead/i),
    );
    expect(lint(plain, led("blind", "deaf", "mute"), {}, extra)).not.toContainEqual(
      expect.stringMatching(/as its lead/i),
    );
    // without the flag, no lead is required
    expect(lint(plain, [WHOLE])).not.toContainEqual(expect.stringMatching(/as its lead/i));
  });
});

describe("lintRoom: glass and vents are walls for walking", () => {
  it("flags an exit behind a vent or glass wall as unreachable", () => {
    for (const ch of ["%", "="]) {
      const walled = [...GOOD];
      walled[1] = `#1.#.........D${ch}..E.#`;
      walled[2] = `#2.#....p....D${ch}....#`;
      walled[3] = `#3.B....p....D${ch}....#`;
      walled[4] = `#..#....p.....${ch}....#`;
      expect(messages(room(walled))).toContainEqual(expect.stringMatching(/exit.*reach/i));
    }
  });
});

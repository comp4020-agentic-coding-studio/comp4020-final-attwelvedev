import { describe, expect, it } from "vitest";
import { parseRoom, type Room } from "../rooms/format.ts";
import type { Role, Seat } from "../types.ts";
import {
  claimJobs,
  clueTarget,
  exitTile,
  hintsOf,
  isDone,
  isOpen,
  type Job,
  type Known,
  parseJob,
} from "./jobs.ts";

const GRID = [
  "####################",
  "#1.#.........D...E.#",
  "#2.#B...p....D...E.#",
  "#3.#.p.......D...E.#",
  "#..#....p..K.......#",
  "####################",
];
const roomWith = (hints: unknown): Room =>
  parseRoom(
    `${JSON.stringify({
      id: "t",
      name: "T",
      beats: [1, 2, 3].map((n) => ({
        name: `beat ${n}`,
        x: [n * 5, n * 5 + 4],
        intent: { blind: "b", deaf: "d", mute: "m" },
      })),
      objects: { D1: { opensWhen: ["p1", "p2", "p3"] } },
      hints,
    })}\n---\n${GRID.join("\n")}\n`,
  );

const HINTS = {
  jobs: [
    { beat: 1, push: "B1", to: [9, 2], prefer: "mute" },
    { beat: 2, goTo: "p2", prefer: "blind" },
    { beat: 2, goTo: "p1", prefer: "deaf" },
    { beat: 2, goTo: "p3", prefer: "mute" },
    { beat: 3, goTo: "E", all: true },
  ],
};
const room = roomWith(HINTS);
const seats = (humans: number[] = [], pos: Record<number, { x: number; y: number }> = {}) =>
  ([0, 1, 2] as const).map((seat) => ({
    seat,
    role: (["blind", "deaf", "mute"] as const)[seat] as "blind" | "deaf" | "mute",
    human: humans.includes(seat),
    pos: pos[seat],
  }));
const ids = (jobs: Job[]) =>
  jobs.map((j) => (j.target.kind === "plate" ? j.target.id : j.target.kind));

describe("hintsOf", () => {
  it("reads jobs in file order with their targets", () => {
    const jobs = hintsOf(room);
    expect(jobs).toHaveLength(5);
    expect(jobs[0]?.target).toMatchObject({ kind: "push", crate: "B1", to: { x: 9, y: 2 } });
    expect(jobs[1]?.target).toMatchObject({ kind: "plate", id: "p2" });
    expect(jobs[4]).toMatchObject({ all: true, target: { kind: "exit" } });
  });

  it("has no jobs when the room has no hints", () => {
    expect(hintsOf(roomWith(undefined))).toEqual([]);
  });

  it("drops a job whose target is not in the room", () => {
    expect(hintsOf(roomWith({ jobs: [{ beat: 1, goTo: "p9" }] }))).toEqual([]);
  });
});

describe("a clue job", () => {
  // two beats; the clue sits in the first (x 1-8), which holds two plates
  const GRID = [
    "####################",
    "#1.p.c...p...p...E.#",
    "#2.......D.........#",
    "#3.....p...........#",
    "####################",
  ];
  const withClue = (n: number, goTo = "clue:c1", extra: Record<string, unknown> = {}) => {
    const beat = (name: string, x: [number, number]) => ({
      name,
      x,
      intent: { blind: "b", deaf: "d", mute: "m" },
      ...extra,
    });
    return parseRoom(
      `${JSON.stringify({
        id: "t",
        name: "T",
        version: 1,
        beats: [beat("one", [1, 8]), beat("two", [9, 18])],
        objects: { D1: { opensWhen: ["p1"] }, c1: { n } },
        hints: { jobs: [{ beat: 2, goTo }] },
      })}\n---\n${GRID.join("\n")}\n`,
    );
  };
  const target = (r: Room) => hintsOf(r)[0]?.target;

  it("goes to the plate whose number is the clue's n, among the plates of the clue's beat", () => {
    // ids follow reading order over the whole grid: p1 (3,1), p2 (9,1), p3 (13,1), p4 (7,3).
    // The clue (5,1) is in beat one (x 1-8), whose plates are p1 and p4, so a clue of 2 means p4
    expect(target(withClue(2))).toMatchObject({ kind: "plate", id: "p4" });
    expect(target(withClue(1))).toMatchObject({ kind: "plate", id: "p1" });
  });

  it("is dropped when the clue is not in the room, or n is more than the beat has plates", () => {
    expect(hintsOf(withClue(2, "clue:c9"))).toEqual([]);
    expect(hintsOf(withClue(3))).toEqual([]);
  });

  it("says why, through parseJob", () => {
    const r = withClue(2, "clue:c9");
    expect(parseJob(r, { beat: 2, goTo: "clue:c9" }, 0)).toMatch(/clue c9/i);
  });
});

describe("a clue job resolves from the chime a bot heard, not from the room file", () => {
  const GRID = [
    "####################",
    "#1.p.c...p...p...E.#",
    "#2.......D.........#",
    "#3.....p...........#",
    "####################",
  ];
  const r = parseRoom(
    `${JSON.stringify({
      id: "t",
      name: "T",
      version: 1,
      beats: [
        { name: "one", x: [1, 8], intent: { blind: "b", deaf: "d", mute: "m" } },
        { name: "two", x: [9, 18], intent: { blind: "b", deaf: "d", mute: "m" } },
      ],
      objects: { D1: { opensWhen: ["p1"] }, c1: { n: 2 } },
      hints: { jobs: [{ beat: 2, goTo: "clue:c1" }] },
    })}\n---\n${GRID.join("\n")}\n`,
  );
  const job = hintsOf(r)[0] as Job;
  const known = (clues: Record<string, number>): Known => ({
    stations: {},
    gear: {},
    holding: {},
    doorOpen: {},
    pressed: {},
    crates: {},
    checkpoint: 0,
    seq: {},
    seenHazards: {},
    clues,
  });

  it("keeps the clue and the beat's plates on the job", () => {
    expect(job.target).toMatchObject({ kind: "plate", clue: { id: "c1" } });
  });

  it("has no plate until a chime has been heard", () => {
    expect(clueTarget(job, known({}))).toBeNull();
  });

  it("takes the plate the heard number names, whatever the room file says", () => {
    // the room file says n = 2 (p4); a chime of 1 heard means p1
    expect(clueTarget(job, known({ c1: 1 }))).toMatchObject({ id: "p1" });
    expect(clueTarget(job, known({ c1: 2 }))).toMatchObject({ id: "p4" });
  });

  it("has no plate for a number the beat has no plate for", () => {
    expect(clueTarget(job, known({ c1: 3 }))).toBeNull();
  });

  it("is left to a seat that can hear: Can't hear never gets it", () => {
    const seats = (roles: Role[]) =>
      roles.map((role, seat) => ({ seat: seat as Seat, role, human: false }));
    const queues = claimJobs(r, [job], seats(["blind", "deaf", "mute"]));
    expect(queues[1]).toEqual([]);
    expect(queues[0].length + queues[2].length).toBe(1);
  });
});

describe("claimJobs", () => {
  it("gives every bot the job its role prefers", () => {
    const queues = claimJobs(room, hintsOf(room), seats());
    // beat 1: the push goes to the mute bot (blind never pushes), and in beat 2 it takes the plate left over
    expect(ids(queues[2])).toEqual(["push", "p3", "exit"]);
    expect(queues[1]?.find((j) => j.target.kind === "plate")?.target).toMatchObject({ id: "p1" });
    expect(queues[0]?.find((j) => j.target.kind === "plate")?.target).toMatchObject({ id: "p2" });
    expect(queues[2]?.find((j) => j.target.kind === "plate")?.target).toMatchObject({ id: "p3" });
  });

  it("never gives a push to a blind player", () => {
    const queues = claimJobs(room, hintsOf(room), seats());
    expect(queues[0]?.some((j) => j.target.kind === "push")).toBe(false);
  });

  it("gives every job to exactly one seat, and an `all` job to every seat", () => {
    const queues = claimJobs(room, hintsOf(room), seats());
    const own = [0, 1, 2].flatMap((s) => queues[s as 0]?.filter((j) => !j.all) ?? []);
    expect(own).toHaveLength(4);
    expect(new Set(own.map((j) => j.index)).size).toBe(4);
    for (const s of [0, 1, 2] as const) expect(queues[s]?.at(-1)?.target.kind).toBe("exit");
  });

  it("lets humans choose first, the job nearest them", () => {
    const plates = roomWith({
      jobs: [
        { beat: 1, goTo: "p2", prefer: "blind" },
        { beat: 1, goTo: "p1", prefer: "deaf" },
        { beat: 1, goTo: "p3", prefer: "mute" },
      ],
    });
    // seat 1 (deaf, a human) stands on p2, which the blind bot would prefer
    const queues = claimJobs(plates, hintsOf(plates), seats([1], { 1: { x: 5.5, y: 3.5 } }));
    expect(queues[1]?.[0]?.target).toMatchObject({ id: "p2" });
    expect(queues[0]?.[0]?.target).toMatchObject({ id: "p1" });
  });

  it("orders each queue by beat", () => {
    for (const s of [0, 1, 2] as const) {
      const beats = (claimJobs(room, hintsOf(room), seats())[s] ?? []).map((j) => j.beat);
      expect(beats).toEqual([...beats].sort((a, b) => a - b));
    }
  });
});

describe("exitTile", () => {
  it("gives each seat its own exit tile when there are enough", () => {
    const tiles = [0, 1, 2].map((s) => exitTile(room, s as 0));
    expect(new Set(tiles.map((t) => `${t.x},${t.y}`)).size).toBe(3);
  });
});

describe("isDone / isOpen", () => {
  const known = (over: Partial<Known> = {}): Known => ({
    stations: {},
    gear: {},
    holding: {},
    doorOpen: { D1: false },
    pressed: {},
    crates: { B1: { x: 4, y: 2 } },
    seq: {},
    seenHazards: {},
    clues: {},
    checkpoint: 0,
    ...over,
  });
  const jobs = hintsOf(room);

  it("a plate job is done when its door is open", () => {
    expect(isDone(room, jobs[1] as Job, known(), undefined)).toBe(false);
    expect(isDone(room, jobs[1] as Job, known({ doorOpen: { D1: true } }), undefined)).toBe(true);
  });

  it("a push job is done when the crate is on its tile", () => {
    expect(isDone(room, jobs[0] as Job, known(), undefined)).toBe(false);
    expect(isDone(room, jobs[0] as Job, known({ crates: { B1: { x: 9, y: 2 } } }), undefined)).toBe(
      true,
    );
  });

  it("a tile job is done once the player is on it", () => {
    const job = hintsOf(roomWith({ jobs: [{ beat: 1, goTo: [5, 2] }] }))[0] as Job;
    expect(isDone(room, job, known(), { x: 9.5, y: 2.5 })).toBe(false);
    expect(isDone(room, job, known(), { x: 5.6, y: 2.5 })).toBe(true);
  });

  it("an `after` job is open once its plate is pressed", () => {
    const job = hintsOf(roomWith({ jobs: [{ beat: 1, goTo: "p1", after: "p2" }] }))[0] as Job;
    expect(isOpen(job, known())).toBe(false);
    expect(isOpen(job, known({ pressed: { p2: true } }))).toBe(true);
    expect(isOpen(jobs[1] as Job, known())).toBe(true);
  });
});

describe("flag jobs", () => {
  const flagRoom = roomWith({ jobs: [{ beat: 1, goTo: "K1", all: true }] });
  const known = (checkpoint: number): Known => ({
    stations: {},
    gear: {},
    holding: {},
    doorOpen: {},
    pressed: {},
    crates: {},
    seq: {},
    seenHazards: {},
    clues: {},
    checkpoint,
  });

  it("reads a checkpoint as a job whose target is its tile", () => {
    const job = hintsOf(flagRoom)[0] as Job;
    expect(job.target).toEqual({ kind: "flag", id: "K1", n: 1, tile: { x: 11, y: 4 } });
    expect(job.all).toBe(true);
  });

  it("is done once that checkpoint, or a later one, is reached", () => {
    const job = hintsOf(flagRoom)[0] as Job;
    expect(isDone(flagRoom, job, known(0), undefined)).toBe(false);
    expect(isDone(flagRoom, job, known(1), undefined)).toBe(true);
    expect(isDone(flagRoom, job, known(2), undefined)).toBe(true);
  });

  it("drops a flag that is not in the room", () => {
    expect(hintsOf(roomWith({ jobs: [{ beat: 1, goTo: "K4" }] }))).toEqual([]);
  });
});

describe("jobs for stations, gear and hands (escape-room Task 4)", () => {
  const GRID = ["############", "#1..Q...#..#", "#2..g...H..#", "#3......#.E#", "############"];
  const r = parseRoom(
    `${JSON.stringify({
      id: "t",
      name: "T",
      beats: [{ name: "b", x: [0, 11], intent: { blind: "b", deaf: "d", mute: "m" } }],
      objects: {
        Q1: {
          type: "dial",
          pads: [
            [3, 1],
            [5, 1],
          ],
          back: [4, 3],
        },
        g1: { item: "stethoscope" },
      },
    })}\n---\n${GRID.join("\n")}\n`,
  );
  const job = (j: Record<string, unknown>) => parseJob(r, { beat: 1, ...j }, 0);

  it("parses a station, take, give, sill and tow job", () => {
    expect((job({ station: "Q1" }) as Job).target).toEqual({ kind: "station", id: "Q1" });
    expect((job({ take: "g1" }) as Job).target).toEqual({ kind: "take", gear: "g1" });
    expect((job({ give: "g1", to: "deaf" }) as Job).target).toEqual({
      kind: "give",
      gear: "g1",
      to: "deaf",
    });
    expect((job({ sill: "g1", hatch: "H1" }) as Job).target).toEqual({
      kind: "sill",
      gear: "g1",
      hatch: "H1",
    });
    expect((job({ tow: "blind", to: [6, 3] }) as Job).target).toEqual({
      kind: "tow",
      role: "blind",
      to: { x: 6, y: 3 },
    });
  });

  it("says what is wrong with an unknown id, for the linter", () => {
    expect(job({ station: "Q9" })).toMatch(/Q9.*not a station/);
    expect(job({ take: "g9" })).toMatch(/g9.*not gear/);
    expect(job({ give: "g1", to: "ghost" })).toMatch(/not a role/);
    expect(job({ sill: "g1", hatch: "H9" })).toMatch(/H9.*not a hatch/);
    expect(job({ tow: "blind", to: [0, 0] })).toMatch(/not floor/);
  });
});

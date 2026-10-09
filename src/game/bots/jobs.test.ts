import { describe, expect, it } from "vitest";
import { parseRoom, type Room } from "../rooms/format.ts";
import { claimJobs, exitTile, hintsOf, isDone, isOpen, type Job, type Known } from "./jobs.ts";

const GRID = [
  "####################",
  "#1.#.........D...E.#",
  "#2.#B...p....D...E.#",
  "#3.#.p.......D...E.#",
  "#..#....p..........#",
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
    doorOpen: { D1: false },
    pressed: {},
    crates: { B1: { x: 4, y: 2 } },
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

// Plays a room over real sockets, the way three people would: it watches the
// Can't-hear player's view (the one that shows everyone) and holds each seat
// toward its next waypoint. First Job's route is the one src/game/sim/room01.test.ts
// proves in the simulation.
import type { RoleView } from "../src/game/perception.ts";
import { byRole, type Player } from "./play.ts";

interface Point {
  x: number;
  y: number;
}
const at = (x: number, y: number): Point => ({ x, y });

const clamp = (n: number) => Math.max(-1, Math.min(1, n));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The newest view waiting on a socket, or null if none arrived since last time.
async function newestView(p: Player): Promise<RoleView | null> {
  let last: RoleView | null = null;
  for (;;) {
    try {
      last = (await p.socket.next<{ t: "view"; view: RoleView }>("view", 3)).view;
    } catch {
      return last;
    }
  }
}

// Straight at the waypoint on both axes at once, easing off as it nears: each leg
// of the route shares one coordinate with the last, so the straight line is an
// axis-aligned leg, and any drift off it (a slow view makes a seat overshoot) is
// corrected while moving. Correcting one axis at a time left a seat 0.2 tiles off
// the tunnel's centre line, pushing at a wall it was too wide to pass.
function toward(pos: Point, target: Point): { x: number; y: number; arrived: boolean } {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  if (Math.abs(dx) < 0.15 && Math.abs(dy) < 0.15) return { x: 0, y: 0, arrived: true };
  return { x: clamp(dx), y: clamp(dy), arrived: false };
}

export interface ClearedMsg {
  t: "cleared";
  room: string;
  ms: number;
  loot: number;
  lootTotal: number;
}

// A room played the way three people would, as stages: each gives every seat a route (orthogonal
// legs, tile centres) and ends when the Can't-hear view shows its goal.
interface Route<S extends string> {
  first: S;
  target: Record<S, (seat: number) => Point[]>;
  next: (stage: S, view: RoleView, arrived: (stage: S) => boolean) => S | null;
}

const ROW = [4.5, 5.5, 6.5];

// First Job (spec/fixtures/first-job, room 1 until escape-room phase 04): seat 0 pushes the crate
// onto the first plate while the others wait, everyone goes through the door and waits in the hall
// in front of the camera, crosses once it has been idle a moment, holds the three plates, then
// takes the exit.
type JobStage = "crate" | "hall" | "cross" | "plates" | "exit";
// The camera watches the first 2.5 s of every 8 s (ticks 0-49 of 160) and the crossing takes about
// 3 s (60 ticks), so the team sets off in the first part of the idle spell: any later and the camera
// turns back while they are still in its cone.
const CAMERA_CYCLE_TICKS = 160;
const CROSS_FROM_TICK = 50;
const CROSS_TO_TICK = 80;
const FIRST_JOB: Route<JobStage> = {
  first: "crate",
  target: {
    crate: (seat) => (seat === 0 ? [at(8.5, 4.5)] : [at(2.5, ROW[seat] ?? 5.5)]),
    // seat 0 goes round the crate it left on the plate: leaning on it again would push it off
    hall: (seat) =>
      seat === 0 ? [at(8.5, 5.5), at(13.5, 5.5), at(16.5, 4.5)] : [at(16.5, ROW[seat] ?? 5.5)],
    cross: (seat) => [at(28.5, ROW[seat] ?? 5.5)],
    plates: (seat) => [at(30.5, ROW[seat] ?? 5.5)],
    exit: (seat) => [at(36.5, ROW[seat] ?? 5.5)],
  },
  next: (stage, view, arrived) => {
    const state = (id: string) => view.entities.find((e) => e.id === id)?.state;
    const phase = view.tick % CAMERA_CYCLE_TICKS;
    if (stage === "crate" && state("D1") === "open") return "hall";
    if (stage === "hall" && arrived("hall") && phase >= CROSS_FROM_TICK && phase < CROSS_TO_TICK)
      return "cross";
    if (stage === "cross" && arrived("cross")) return "plates";
    if (stage === "plates" && state("D2") === "open") return "exit";
    return null;
  },
};

// First Steps (rooms/01-first-steps): seat 0 stands on the plate that opens the first door while
// the others wait, then all three walk their own row to the three plates, then onto the exit.
type StepsStage = "plate" | "plates" | "exit";
const FIRST_STEPS: Route<StepsStage> = {
  first: "plate",
  target: {
    plate: (seat) => [seat === 0 ? at(7.5, 1.5) : at(2.5, seat + 1.5)],
    plates: (seat) => [at(20.5, seat + 1.5)],
    exit: (seat) => [at(23.5, seat + 1.5)],
  },
  next: (stage, view) => {
    const state = (id: string) => view.entities.find((e) => e.id === id)?.state;
    if (stage === "plate" && state("D1") === "open") return "plates";
    if (stage === "plates" && state("D2") === "open") return "exit";
    return null;
  },
};

// Plays a room over real sockets until `stop` says so; resolves with the stage it stopped in.
async function playRoute<S extends string>(
  name: string,
  route: Route<S>,
  players: Player[],
  timeoutMs: number,
  stop: (stage: S, view: RoleView) => boolean,
): Promise<{ stage: S; view: RoleView } | ClearedMsg> {
  const eyes = byRole(players, "deaf");
  const sent: string[] = ["", "", ""];
  let seq = 0;
  let stage = route.first;
  const leg = [0, 0, 0]; // which waypoint of the stage's route each seat is walking to
  let view: RoleView | null = null;
  const deadline = Date.now() + timeoutMs;
  const arrived = (stg: S) =>
    players.every((p) => {
      const pos = view?.entities.find((e) => e.id === `P${p.seat}`)?.pos;
      const goal = route.target[stg](p.seat).at(-1);
      return !!pos && !!goal && Math.abs(pos.x - goal.x) < 0.4 && Math.abs(pos.y - goal.y) < 0.4;
    });
  while (Date.now() < deadline) {
    view = (await newestView(eyes)) ?? view;
    try {
      return await (players[0] as Player).socket.next<ClearedMsg>("cleared", 1);
    } catch {
      // not yet
    }
    if (view) {
      if (stop(stage, view)) return { stage, view };
      const next = route.next(stage, view, arrived);
      if (next) {
        stage = next;
        leg.fill(0);
      }
      for (const p of players) {
        const pos = view.entities.find((e) => e.id === `P${p.seat}`)?.pos;
        const legs = route.target[stage](p.seat);
        const goal = legs[Math.min(leg[p.seat] ?? 0, legs.length - 1)];
        if (!pos || !goal) continue;
        const move = toward(pos, goal);
        if (move.arrived) leg[p.seat] = (leg[p.seat] ?? 0) + 1;
        const key = `${move.x.toFixed(2)},${move.y.toFixed(2)}`;
        if (key === sent[p.seat]) continue;
        sent[p.seat] = key;
        p.socket.send({ t: "input", seq: ++seq, move: { x: move.x, y: move.y }, act: false });
      }
    }
    await sleep(50);
  }
  const where = [0, 1, 2]
    .map((seat) => {
      const pos = view?.entities.find((e) => e.id === `P${seat}`)?.pos;
      return `seat ${seat} at ${pos ? `(${pos.x.toFixed(1)},${pos.y.toFixed(1)})` : "?"}`;
    })
    .join("; ");
  const crate = view?.entities.find((e) => e.kind === "crate")?.pos;
  throw new Error(
    `${name} was not cleared in time: stage ${stage}; ${where}; crate ${crate ? `(${crate.x.toFixed(1)},${crate.y.toFixed(1)})` : "?"}`,
  );
}

// Resolves with the first player's `cleared` message once room 01 (First Steps) is cleared.
export async function clearRoomOne(players: Player[], timeoutMs = 90_000): Promise<ClearedMsg> {
  const result = await playRoute("room 01", FIRST_STEPS, players, timeoutMs, () => false);
  if (!("t" in result)) throw new Error("room 01 stopped early");
  return result;
}

// Plays First Job (a server started on spec/fixtures/first-job) as far as the hall in front of the
// camera and stops there, with all three seats waiting. Resolves with the view that showed them arrive.
export async function reachCameraHall(players: Player[], timeoutMs = 60_000): Promise<RoleView> {
  const result = await playRoute(
    "First Job",
    FIRST_JOB,
    players,
    timeoutMs,
    (stage, view) =>
      stage === "hall" &&
      players.every((p) => {
        const pos = view.entities.find((e) => e.id === `P${p.seat}`)?.pos;
        return !!pos && Math.abs(pos.x - 16.5) < 0.4;
      }),
  );
  if ("t" in result) throw new Error("First Job was cleared before the hall");
  for (const p of players)
    p.socket.send({ t: "input", seq: 1000, move: { x: 0, y: 0 }, act: false });
  return result.view;
}

// Plays spec/fixtures/rooms/01-tiny the way three people would: each seat stands on the plate in its
// own row until the door opens, then all three go to the one exit tile.
export async function clearTinyRoom(players: Player[], timeoutMs = 20_000): Promise<ClearedMsg> {
  const eyes = byRole(players, "deaf");
  const sent: string[] = ["", "", ""];
  let seq = 0;
  let view: RoleView | null = null;
  let doorOpen = false;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    view = (await newestView(eyes)) ?? view;
    try {
      return await (players[0] as Player).socket.next<ClearedMsg>("cleared", 1);
    } catch {
      // not yet
    }
    if (view) {
      doorOpen ||= view.entities.some((e) => e.kind === "door" && e.state === "open");
      for (const p of players) {
        const pos = view.entities.find((e) => e.id === `P${p.seat}`)?.pos;
        if (!pos) continue;
        const move = toward(pos, doorOpen ? at(17.5, 1.5) : at(9.5, p.seat + 1.5));
        const key = `${move.x.toFixed(2)},${move.y.toFixed(2)}`;
        if (key === sent[p.seat]) continue;
        sent[p.seat] = key;
        p.socket.send({ t: "input", seq: ++seq, move: { x: move.x, y: move.y }, act: false });
      }
    }
    await sleep(50);
  }
  throw new Error("the tiny room was not cleared in time");
}

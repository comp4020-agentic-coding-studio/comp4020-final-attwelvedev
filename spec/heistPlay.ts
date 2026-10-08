// Plays Room 01 over real sockets, the way three people would: it watches the
// Can't-hear player's view (the one that shows everyone) and holds each seat
// toward its next waypoint. The route is the one src/game/sim/room01.test.ts
// proves in the simulation.
import type { RoleView } from "../src/game/perception.ts";
import { byRole, type Player } from "./play.ts";

interface Point {
  x: number;
  y: number;
}
const at = (x: number, y: number): Point => ({ x, y });

// First the tunnel, the junction and the three plates; once the door is open, the exit.
const TO_PLATES: Record<number, Point[]> = {
  0: [at(2.5, 4.5), at(10.5, 4.5), at(10.5, 6.5), at(27.5, 6.5), at(27.5, 3.5), at(30.5, 3.5)],
  1: [at(10.5, 4.5), at(10.5, 6.5), at(27.5, 6.5), at(27.5, 4.5), at(30.5, 4.5)],
  2: [at(2.5, 4.5), at(10.5, 4.5), at(10.5, 6.5), at(27.5, 6.5), at(27.5, 5.5), at(30.5, 5.5)],
};
const TO_EXIT: Record<number, Point[]> = {
  0: [at(45.5, 3.5)],
  1: [at(45.5, 4.5)],
  2: [at(45.5, 5.5)],
};

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

// Resolves with the first player's `cleared` message once the room is cleared.
export async function clearRoomOne(players: Player[], timeoutMs = 90_000): Promise<ClearedMsg> {
  const eyes = byRole(players, "deaf");
  const stepAt = [0, 0, 0];
  const sent: string[] = ["", "", ""];
  let seq = 0;
  let phase: "plates" | "exit" = "plates";
  let view: RoleView | null = null;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    view = (await newestView(eyes)) ?? view;
    try {
      return await (players[0] as Player).socket.next<ClearedMsg>("cleared", 1);
    } catch {
      // not yet
    }
    if (view) {
      if (
        phase === "plates" &&
        view.entities.some((e) => e.kind === "door" && e.state === "open")
      ) {
        phase = "exit";
        stepAt.fill(0);
      }
      for (const p of players) {
        const pos = view.entities.find((e) => e.id === `P${p.seat}`)?.pos;
        const route = (phase === "plates" ? TO_PLATES : TO_EXIT)[p.seat] ?? [];
        const target = route[stepAt[p.seat] ?? 0];
        if (!pos || !target) continue;
        const move = toward(pos, target);
        // the last waypoint before the plates is inside the closed door: keep pushing at it
        if (move.arrived && !(phase === "plates" && stepAt[p.seat] === route.length - 1)) {
          stepAt[p.seat] = (stepAt[p.seat] ?? 0) + 1;
        }
        const key = `${move.x.toFixed(2)},${move.y.toFixed(2)}`;
        if (key === sent[p.seat]) continue;
        sent[p.seat] = key;
        p.socket.send({ t: "input", seq: ++seq, move: { x: move.x, y: move.y }, act: false });
      }
    }
    await sleep(50);
  }
  const at = [0, 1, 2]
    .map((seat) => {
      const pos = view?.entities.find((e) => e.id === `P${seat}`)?.pos;
      return `seat ${seat} at ${pos ? `(${pos.x.toFixed(1)},${pos.y.toFixed(1)})` : "?"} step ${stepAt[seat]}`;
    })
    .join("; ");
  const crate = view?.entities.find((e) => e.kind === "crate")?.pos;
  throw new Error(
    `room 01 was not cleared in time: phase ${phase}; ${at}; crate ${crate ? `(${crate.x.toFixed(1)},${crate.y.toFixed(1)})` : "?"}`,
  );
}

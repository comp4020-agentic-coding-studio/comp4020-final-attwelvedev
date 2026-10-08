import type { World } from "../sim/world.ts";
import type { Room } from "./format.ts";
import { laserOffFor, type Move, type Plan } from "./solveBuilder.ts";

// Hand-authored routes that clear rooms 02 and 03. `pnpm solve:rooms` plays
// them through the simulation and writes src/game/rooms/solutions/*.json;
// solve.test.ts replays those, so an edit to a room that breaks its solution
// (or a stale recording) fails the check. Bots replace this in Task 16.

// A flag is only set when the whole team is at it together.
const flag = (n: number) => (w: World) => w.checkpoint >= n;
// The alarm was set off and has run out (cameras watch non-stop until then).
const alarmOver = (w: World) => w.alarmUntil > 0 && w.tick >= w.alarmUntil;
const tick = (n: number) => (w: World) => w.tick >= n;
const pressed = (id: string) => (w: World) => w.pressed[id] === true;
const door = (id: string) => (w: World) => w.doorOpen[id] === true;
const all =
  (...fs: ((w: World) => boolean)[]) =>
  (w: World) =>
    fs.every((f) => f(w));

// The camera is idle for the second half of each period; wait for at least
// `ticks` of idle to be left.
const cameraIdleFor = (room: Room, id: string, ticks: number) => {
  const cam = room.objects.find((o) => o.id === id)?.params ?? {};
  const period = Math.round(((cam.periodS as number) * 1000) / 50);
  const watching = Math.round(((cam.watchingS as number) * 1000) / 50);
  const offset = Math.round((((cam.offsetS as number) ?? 0) * 1000) / 50);
  return (w: World) => {
    const phase = (w.tick + 1 + offset) % period;
    return phase >= watching && period - phase >= ticks;
  };
};

// A guard that patrols up and down a lane looks along the way it is walking, so
// the safe moment to cross is just after it has walked past: it is moving down,
// a little below the players' rows, and facing away. The window is a few ticks.
const passed = (id: string) => (w: World) => {
  const g = w.guards.find((guard) => guard.id === id);
  return g !== undefined && g.facing.y > 0 && g.pos.y >= 5.9 && g.pos.y < 6.3;
};

const ROWS = [3.5, 4.5, 5.5] as const;
const rows = (f: (y: number, seat: 0 | 1 | 2) => Move[]): Plan => ({
  0: f(ROWS[0], 0),
  1: f(ROWS[1], 1),
  2: f(ROWS[2], 2),
});

// `impatient` drops the waits for the guard, so a test can show the guard matters.
export function planFor(room: Room, impatient = false): Plan {
  if (room.id === "02-cameras-lasers") return room02(room, impatient);
  if (room.id === "03-vault") return room03(room, impatient);
  throw new Error(`no solve plan for ${room.id}`);
}

function room02(room: Room, impatient: boolean): Plan {
  const guardPassed = impatient ? () => () => true : passed;
  const idle = cameraIdleFor(room, "C1", 60); // the dash through its cone takes about 2.7 s
  const l1 = laserOffFor(room, "L1", 14);
  const l2 = laserOffFor(room, "L2", 14);
  const plate = [3.5, 4.5, 5.5];
  return rows((y, seat) => [
    { go: [6.5, y] }, // all three at the first flag
    { wait: flag(1) },
    { go: [7.5, y] }, // stage just outside the camera's cone
    { wait: idle },
    { go: [19.5, y] }, // dash through while it looks away
    { go: [21.5, y] },
    { wait: l1 },
    { go: [25.5, y] }, // across L1 into the safe pocket
    { wait: l2 },
    { go: [29.5, y] }, // across L2
    { wait: guardPassed("G1") },
    { go: [32.5, y] }, // onto the hiding spots as the guard walks past, beside the second flag
    { wait: flag(2) },
    { wait: guardPassed("G1") }, // the next time round...
    { go: [39.5, plate[seat] as number] }, // ...across its lane, each onto a plate
    { wait: all(pressed("p1"), pressed("p2"), pressed("p3")) },
    { wait: door("D1") },
    { go: [45.5, y] },
  ]);
}

function room03(room: Room, impatient: boolean): Plan {
  const guardPassed = impatient ? () => () => true : passed;
  const l1 = laserOffFor(room, "L1", 14);
  const l2 = laserOffFor(room, "L2", 14);
  const idle = cameraIdleFor(room, "C1", 45);
  // sign: p7 (24,6), then p1 (24,2), then p4 (24,4)
  return {
    0: [
      { go: [5.5, 3.5] },
      { wait: flag(1) },
      { wait: guardPassed("G1") },
      { go: [8.5, 3.5] }, // hide as the guard walks past
      { wait: guardPassed("G1") },
      { go: [12.5, 3.5] }, // across its lane, on to the lasers
      { wait: l1 },
      { go: [15.5, 3.5] },
      { wait: l2 },
      { go: [20.5, 3.5] },
      { wait: flag(2) },
      { go: [22.5, 6.5] },
      { wait: tick(0) },
      { go: [24.5, 6.5] }, // p7 first
      { wait: door("D1") },
      { go: [24.5, 3.5] }, // up to the doorway's row, then through
      { go: [32.5, 3.5] },
      { wait: flag(3) },
      { wait: alarmOver }, // cameras watch non-stop while it rings
      { wait: idle },
      { go: [40.5, 3.5] },
      { go: [41.5, 3.5] }, // vault plate p3
      { wait: door("D2") },
      { go: [48.5, 3.5] },
    ],
    1: [
      { go: [5.5, 4.5] },
      { wait: flag(1) },
      { wait: guardPassed("G1") },
      { go: [8.5, 4.5] }, // hide as the guard walks past
      { wait: guardPassed("G1") },
      { go: [12.5, 4.5] }, // across its lane, on to the lasers
      { wait: l1 },
      { go: [15.5, 4.5] },
      { wait: l2 },
      { go: [20.5, 4.5] },
      { wait: flag(2) },
      { go: [22.5, 2.5] },
      { wait: pressed("p7") },
      { go: [24.5, 2.5] }, // p1 second
      { wait: door("D1") },
      { go: [24.5, 4.5] },
      { go: [33.5, 4.5] },
      { wait: flag(3) },
      { go: [33.5, 2.5] }, // the alarm plate p2
      { wait: alarmOver }, // cameras watch non-stop while it rings
      { wait: idle },
      { go: [40.5, 2.5] },
      { go: [40.5, 4.5] },
      { go: [41.5, 4.5] }, // vault plate p5
      { wait: door("D2") },
      { go: [48.5, 4.5] },
    ],
    2: [
      { go: [5.5, 5.5] },
      { wait: flag(1) },
      { wait: guardPassed("G1") },
      { go: [8.5, 5.5] }, // hide as the guard walks past
      { wait: guardPassed("G1") },
      { go: [12.5, 5.5] }, // across its lane, on to the lasers
      { wait: l1 },
      { go: [15.5, 5.5] },
      { wait: l2 },
      { go: [20.5, 5.5] },
      { wait: flag(2) },
      { go: [22.5, 4.5] },
      { wait: pressed("p1") },
      { go: [24.5, 4.5] }, // p4 third
      { wait: door("D1") },
      { go: [32.5, 5.5] },
      { wait: flag(3) },
      { wait: alarmOver }, // cameras watch non-stop while it rings
      { wait: idle },
      { go: [40.5, 5.5] },
      { go: [41.5, 5.5] }, // vault plate p6
      { wait: door("D2") },
      { go: [48.5, 5.5] },
    ],
  };
}

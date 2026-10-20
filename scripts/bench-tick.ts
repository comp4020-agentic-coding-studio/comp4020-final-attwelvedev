// node scripts/bench-tick.ts — the cost of one server tick at showcase load: 10 lobbies,
// each a room 03 world stepped and viewed for all three seats (line of sight included).
// Prints ms per tick; the budget is 10 ms at 20 Hz (plan 04, non-functional requirements).
import { viewFor } from "../src/game/perception.ts";
import { loadRooms } from "../src/game/rooms/load.ts";
import { step } from "../src/game/sim/step.ts";
import { createWorld, TICK_MS } from "../src/game/sim/world.ts";
import type { Role, Seat } from "../src/game/types.ts";

const LOBBIES = 10;
const TICKS = 200;
const ROLES: Role[] = ["blind", "deaf", "mute"];

const room = loadRooms().find((r) => r.id === "03-vault");
if (!room) throw new Error("room 03-vault not found");
const worlds = Array.from({ length: LOBBIES }, () => createWorld(room));

// the players walk, so the viewpoints change tile and the cache (if any) is exercised
const walk = (tick: number, seat: Seat) => ({
  seq: tick,
  move: { x: Math.cos(tick / 40 + seat), y: Math.sin(tick / 55 + seat * 2) },
  act: false,
});

for (let i = 0; i < 20; i++) for (const w of worlds) step(w, {}, TICK_MS); // warm up

const t0 = performance.now();
for (let tick = 0; tick < TICKS; tick++) {
  for (const w of worlds) {
    step(w, { 0: walk(tick, 0), 1: walk(tick, 1), 2: walk(tick, 2) }, TICK_MS);
    for (const seat of [0, 1, 2] as const) viewFor(w, seat, ROLES[seat] as Role, false);
  }
}
const perTick = (performance.now() - t0) / TICKS;
console.log(`${LOBBIES} lobbies x 3 seats: ${perTick.toFixed(2)} ms per tick (budget 10 ms)`);
process.exitCode = perTick < 10 ? 0 : 1;

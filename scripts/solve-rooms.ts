// pnpm solve:rooms — play the hand-authored routes for rooms 02 and 03 through
// the simulation and write what each seat held to src/game/rooms/solutions/.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { loadRooms } from "../src/game/rooms/load.ts";
import { buildScript } from "../src/game/rooms/solveBuilder.ts";
import { planFor } from "../src/game/rooms/solvePlans.ts";

for (const room of loadRooms()) {
  if (room.id === "01-loading-dock") continue; // solved by src/game/sim/room01.test.ts
  const script = buildScript(room, planFor(room));
  const ticks = script.runs.reduce((sum, r) => sum + r.n, 0);
  const file = `src/game/rooms/solutions/${room.id}.json`;
  writeFileSync(file, `${JSON.stringify(script)}\n`);
  // the check lints these files, so write them the way the formatter wants them
  execFileSync("pnpm", ["exec", "biome", "format", "--write", file], { stdio: "ignore" });
  console.log(`${room.id}: cleared in ${ticks} ticks (${(ticks / 20).toFixed(1)} s)`);
}

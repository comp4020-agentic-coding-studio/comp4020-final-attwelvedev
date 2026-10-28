// pnpm solve:rooms — play the hand-authored routes for rooms 04 and 05 through
// the simulation and write what each seat held to src/game/rooms/solutions/.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { loadRooms } from "../src/game/rooms/load.ts";
import { buildScript } from "../src/game/rooms/solveBuilder.ts";
import { planFor } from "../src/game/rooms/solvePlans.ts";

for (const room of loadRooms()) {
  if (!["05-cameras-lasers", "06-vault"].includes(room.id)) continue; // the bots solve the rest
  const script = buildScript(room, planFor(room));
  const ticks = script.runs.reduce((sum, r) => sum + r.n, 0);
  const file = `src/game/rooms/solutions/${room.id}.json`;
  writeFileSync(file, `${JSON.stringify(script)}\n`);
  // the check lints these files, so write them the way the formatter wants them
  execFileSync("pnpm", ["exec", "biome", "format", "--write", file], { stdio: "ignore" });
  console.log(`${room.id}: cleared in ${ticks} ticks (${(ticks / 20).toFixed(1)} s)`);
}

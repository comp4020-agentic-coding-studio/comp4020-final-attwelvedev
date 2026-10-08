// pnpm lint:rooms — lint every rooms/*.room; exit 1 if any issue is found.
import { lintRoom } from "../src/game/rooms/lint.ts";
import { loadRooms } from "../src/game/rooms/load.ts";

let rooms: ReturnType<typeof loadRooms>;
try {
  rooms = loadRooms();
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

const issues = rooms.flatMap(lintRoom);
for (const i of issues) console.error(`${i.room}: ${i.message}`);
if (rooms.length === 0) {
  console.error("no rooms found in ./rooms");
  process.exit(1);
}
if (issues.length > 0) process.exit(1);
console.log(`${rooms.length} room(s) ok`);

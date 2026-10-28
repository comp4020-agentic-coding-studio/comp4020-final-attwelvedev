// node scripts/mockup-room.ts <file.room> [out.html] — a cheap look at a room before it is built:
// one self-contained page that shows, for each role standing on any tile, what the game's own
// perception says it sees and hears. Open the file in a browser; edit the .room and run it again.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseRoom } from "../src/game/rooms/format.ts";
import { buildMockup } from "../src/game/rooms/mockup.ts";
import { PAGE } from "./mockup-page.ts";

const [file, out] = process.argv.slice(2);
if (!file) {
  console.error("usage: node scripts/mockup-room.ts <file.room> [out.html]");
  process.exit(1);
}
const room = parseRoom(readFileSync(file, "utf8"));
const mock = buildMockup(room);
const target = out ?? `${basename(file, ".room")}.mockup.html`;
// "</" inside a script block would end it early
const json = JSON.stringify(mock).replace(/</g, "\\u003c");
writeFileSync(target, PAGE.replace("/*DATA*/null", json));
console.log(
  `${target}: ${room.id}, ${Object.keys(mock.roles.deaf.cells).length} tiles to stand on`,
);

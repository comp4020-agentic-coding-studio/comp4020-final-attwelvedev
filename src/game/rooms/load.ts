import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRoom, type Room, RoomFormatError } from "./format.ts";

// The one `node:fs` user in src/game/. Reads every `*.room` in `dir`, sorted by
// file name (NN-slug.room), and throws with the file name on a parse error.
export function loadRooms(dir = "./rooms"): Room[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".room"))
    .sort();
  return files.map((file) => {
    try {
      return parseRoom(readFileSync(join(dir, file), "utf8"));
    } catch (e) {
      if (e instanceof RoomFormatError) {
        throw new RoomFormatError(`${file}:${e.line}: ${e.message}`, e.line);
      }
      throw e;
    }
  });
}

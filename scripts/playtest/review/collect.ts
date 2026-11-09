import { rolesFor } from "../../../src/game/crew.ts";
import type { Role } from "../../../src/game/types.ts";
import { homePath, revealPath, shotStem } from "../evidence.ts";

// What one player was shown at one moment, read from a finished run's evidence (FR9, FR10).
export interface ReviewItem {
  room: string;
  beat: string;
  role: Role;
  width: number;
  rotation: number; // which seating of `--rotations all` (0 for a one-rotation run)
  screenshot?: string; // path relative to the run; absent for Can't see, never read for them
  perceived: string; // the .txt
  prior: string; // the home page, and this room's reveal (with the sound briefing for Can't see)
}

// One item per room x beat x role x rotation: "start" and "1".."n", not "end" (the cleared card is FR5's).
// `listing` holds paths relative to the run folder; `read` returns a text file's contents.
export function collect(
  listing: string[],
  read: (path: string) => string,
  only?: string,
): ReviewItem[] {
  const run = JSON.parse(read("run.json")) as { rooms: string[] };
  const items: ReviewItem[] = [];
  for (const [index, room] of run.rooms.entries()) {
    if (only && !room.startsWith(`${only}-`)) continue;
    const roles = rolesFor(index);
    const stem = /^([^/]+)\/(blind|deaf|mute)-(\d+)-r(\d+)-([^/]+)\.txt$/;
    const found = listing
      .map((p) => stem.exec(p))
      .filter((m): m is RegExpExecArray => m !== null && m[1] === room && m[5] !== "end");
    for (const [, , roleName, w, r, beat] of found) {
      const role = roleName as Role;
      const seat = roles.indexOf(role);
      const [width, rotation] = [Number(w), Number(r)];
      const file = `${room}/${shotStem(role, width, beat as string, rotation)}`;
      items.push({
        room,
        beat: beat as string,
        role,
        width,
        rotation,
        ...(role === "blind" ? {} : { screenshot: `${file}.png` }),
        perceived: read(`${file}.txt`),
        prior: `${read(homePath(seat, rotation))}\n${read(revealPath(room, role, rotation))}`,
      });
    }
  }
  const order = (b: string) => (b === "start" ? 0 : Number(b));
  const roleOrder: Role[] = ["blind", "deaf", "mute"];
  return items.sort(
    (a, b) =>
      a.room.localeCompare(b.room) ||
      order(a.beat) - order(b.beat) ||
      roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role) ||
      a.rotation - b.rotation ||
      a.width - b.width,
  );
}

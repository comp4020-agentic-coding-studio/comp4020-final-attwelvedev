import type { RoleView } from "../../src/game/perception.ts";
import { canReceive, type Method, type Role } from "../../src/game/types.ts";
import type { ServerMsg } from "../../src/net/protocol.ts";
import type { Dir8 } from "./drive.ts";

// The pure judges of the input check (Task 126), on recorded wire data.

const MIN_MOVE = 0.1; // tiles

// Did the seat's own position go the way it was told? "skip" when it was blocked in every view
// (a wall, a door or a crate holds it, so the input cannot be judged by position).
export function movedToward(views: RoleView[], dir: Dir8): boolean | "skip" {
  const pos = views.flatMap((v) => (v.you.pos ? [v.you.pos] : []));
  const first = pos[0];
  const last = pos.at(-1);
  if (!first || !last) return false;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const wantX = dir.includes("left") ? -1 : dir.includes("right") ? 1 : 0;
  const wantY = dir.includes("up") ? -1 : dir.includes("down") ? 1 : 0;
  const okX = wantX === 0 || dx * wantX > MIN_MOVE;
  const okY = wantY === 0 || dy * wantY > MIN_MOVE;
  if (okX && okY) return true;
  // It did not travel. The window opens before the key goes down, so a seat standing against a wall
  // can show one step and then "blocked": a view of it moving while held says a wall, not a dead input.
  return views.some((v) => v.you.motion?.moving === true && v.you.motion.blocked) ? "skip" : false;
}

type Msgs = { at: number; msg: ServerMsg }[];

// A message from `from` reached exactly the seats whose role receives `method`. `wires[seat]` is
// that tab's received `msg` messages since the send.
export function delivered(
  wires: Msgs[],
  from: number,
  method: Method,
  roles: Role[],
): { ok: true } | { ok: false; detail: string } {
  const problems: string[] = [];
  for (const [seat, role] of roles.entries()) {
    if (seat === from) continue;
    const got = (wires[seat] ?? []).some(
      (m) =>
        m.msg.t === "msg" &&
        (m.msg as { from?: { seat?: number } }).from?.seat === from &&
        (m.msg as { method?: string }).method === (method === "face" ? "face" : method),
    );
    const should = canReceive(role, method);
    if (should && !got) problems.push(`seat ${seat} (${role}) never got the ${method}`);
    if (!should && got) problems.push(`seat ${seat} (${role}) got a ${method} it cannot receive`);
  }
  return problems.length === 0 ? { ok: true } : { ok: false, detail: problems.join("; ") };
}

// After a declined restart vote: the room is still playing and no new reveal came.
export function declinedCleanly(
  viewsAfter: RoleView[],
  newReveals: number,
): { ok: true } | { ok: false; detail: string } {
  if (newReveals > 0) return { ok: false, detail: `${newReveals} new reveal(s) after a decline` };
  const last = viewsAfter.at(-1);
  if (last && last.status !== "playing")
    return { ok: false, detail: `room status is ${last.status}, not playing` };
  return { ok: true };
}

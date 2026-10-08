import type { PlayerInput, Vec } from "../game/types.ts";
import type { EntityView } from "../net/protocol.ts";

export interface Predictor {
  apply(input: PlayerInput, dtMs: number): Vec; // predicted own position
  reconcile(serverPos: Vec, ack: number): Vec; // drops acked inputs, replays the rest
  observe(entities: EntityView[]): void; // open doors and crates, as last seen
}

// The client may not import the simulation (src/client/ is browser-only), so
// this repeats its movement rules: speed, radius and circle-versus-tile
// collision. predict.test.ts holds the two to the same answers, so a rule
// changed in src/game/sim/ fails there rather than as rubber-banding in play.
const SPEED_TPS = 4;
const RADIUS = 0.4;
const EPS = 1e-6;
const BISECT = 8;
const MAX_PENDING = 200; // a seat that is never acked (blind) must not grow without bound

const key = (x: number, y: number): string => `${x},${y}`;

export function createPredictor(start: Vec, tiles: string[]): Predictor {
  let pos: Vec = { ...start };
  let pending: { input: PlayerInput; dtMs: number }[] = [];
  let openDoors = new Set<string>();
  let crates = new Set<string>();

  const solid = (tx: number, ty: number): boolean => {
    const ch = tiles[ty]?.[tx];
    if (ch === undefined || ch === "#") return true;
    if (ch === "D" && !openDoors.has(key(tx, ty))) return true;
    return crates.has(key(tx, ty));
  };

  const blockedAt = (p: Vec): boolean => {
    const r = RADIUS - EPS;
    for (let ty = Math.floor(p.y - RADIUS); ty <= Math.floor(p.y + RADIUS); ty++) {
      for (let tx = Math.floor(p.x - RADIUS); tx <= Math.floor(p.x + RADIUS); tx++) {
        if (!solid(tx, ty)) continue;
        const cx = Math.max(tx, Math.min(p.x, tx + 1));
        const cy = Math.max(ty, Math.min(p.y, ty + 1));
        if ((p.x - cx) ** 2 + (p.y - cy) ** 2 < r * r) return true;
      }
    }
    return false;
  };

  const moveAxis = (p: Vec, axis: "x" | "y", d: number): void => {
    if (d === 0) return;
    const from = p[axis];
    if (!blockedAt({ ...p, [axis]: from + d })) {
      p[axis] = from + d;
      return;
    }
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < BISECT; i++) {
      const mid = (lo + hi) / 2;
      if (blockedAt({ ...p, [axis]: from + d * mid })) hi = mid;
      else lo = mid;
    }
    p[axis] = from + d * lo;
  };

  const move = (p: Vec, input: PlayerInput, dtMs: number): void => {
    const x = Math.max(-1, Math.min(1, input.move.x));
    const y = Math.max(-1, Math.min(1, input.move.y));
    const len = Math.hypot(x, y);
    const scale = len > 1 ? 1 / len : 1;
    const dist = (SPEED_TPS * dtMs) / 1000;
    moveAxis(p, "x", x * scale * dist);
    moveAxis(p, "y", y * scale * dist);
  };

  return {
    apply(input, dtMs) {
      pending.push({ input, dtMs });
      if (pending.length > MAX_PENDING) pending = pending.slice(-MAX_PENDING);
      move(pos, input, dtMs);
      return { ...pos };
    },
    reconcile(serverPos, ack) {
      pending = pending.filter((p) => p.input.seq > ack);
      pos = { ...serverPos };
      for (const p of pending) move(pos, p.input, p.dtMs);
      return { ...pos };
    },
    observe(entities) {
      openDoors = new Set();
      crates = new Set();
      for (const e of entities) {
        const k = key(Math.floor(e.pos.x), Math.floor(e.pos.y));
        if (e.kind === "door" && e.state === "open") openDoors.add(k);
        else if (e.kind === "crate") crates.add(k);
      }
    },
  };
}

import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "./db.ts";
import { runs } from "./schema.ts";

export interface RunInput {
  kind: "room" | "heist";
  roomId: string | null;
  version: string; // room version, or joined versions for a heist
  teamName: string;
  names: { nickname: string; bot: boolean }[];
  ms: number;
  loot: number;
  lootTotal: number;
}
export interface RunRow extends RunInput {
  id: string;
  createdAt: number;
  rank: number;
}

type RunDbRow = typeof runs.$inferSelect;

function toInput(row: RunDbRow): RunInput {
  return {
    kind: row.kind,
    roomId: row.roomId,
    version: row.kind === "room" ? String(row.roomVersion) : (row.heistVersion as string),
    teamName: row.teamName,
    names: JSON.parse(row.names) as { nickname: string; bot: boolean }[],
    ms: row.ms,
    loot: row.loot,
    lootTotal: row.lootTotal,
  };
}

// Same kind, same room (for a room run) and same version: the rows a run
// competes against on the board.
function sameHeat(kind: "room" | "heist", roomId: string | null, version: string) {
  const base = kind === "room" ? eq(runs.roomId, roomId as string) : isNull(runs.roomId);
  const ver =
    kind === "room" ? eq(runs.roomVersion, Number(version)) : eq(runs.heistVersion, version);
  return and(eq(runs.kind, kind), base, ver);
}

// Faster first; a tied ms is broken by more loot, then by who got there first.
function better(a: RunDbRow, b: RunDbRow): number {
  if (a.ms !== b.ms) return a.ms - b.ms;
  if (a.loot !== b.loot) return b.loot - a.loot;
  return a.createdAt - b.createdAt;
}

export function saveRun(db: Db, run: RunInput, now: number = Date.now()): RunRow {
  const id = randomUUID();
  const createdAt = now;
  db.insert(runs)
    .values({
      id,
      kind: run.kind,
      roomId: run.roomId,
      roomVersion: run.kind === "room" ? Number(run.version) : null,
      heistVersion: run.kind === "heist" ? run.version : null,
      teamName: run.teamName,
      names: JSON.stringify(run.names),
      ms: run.ms,
      loot: run.loot,
      lootTotal: run.lootTotal,
      createdAt,
    })
    .run();
  const heat = db
    .select()
    .from(runs)
    .where(sameHeat(run.kind, run.roomId, run.version))
    .all()
    .sort(better);
  const rank = heat.findIndex((r) => r.id === id) + 1;
  return { ...run, id, createdAt, rank };
}

// The current version of a kind/room is whichever one was most recently
// played: an old room version's runs don't compete on the board once a newer
// one has been cleared.
export function topRuns(
  db: Db,
  filter: { kind: "room" | "heist"; roomId?: string },
  limit = 20,
): RunRow[] {
  const roomId = filter.kind === "room" ? (filter.roomId ?? null) : null;
  const scope = filter.kind === "room" ? eq(runs.roomId, roomId as string) : isNull(runs.roomId);
  const latest = db
    .select()
    .from(runs)
    .where(and(eq(runs.kind, filter.kind), scope))
    .orderBy(desc(runs.createdAt))
    .limit(1)
    .all()[0];
  if (!latest) return [];
  const version =
    filter.kind === "room" ? String(latest.roomVersion) : (latest.heistVersion as string);
  const rows = db
    .select()
    .from(runs)
    .where(sameHeat(filter.kind, roomId, version))
    .all()
    .sort(better)
    .slice(0, limit);
  return rows.map((row, i) => ({
    ...toInput(row),
    id: row.id,
    createdAt: row.createdAt,
    rank: i + 1,
  }));
}

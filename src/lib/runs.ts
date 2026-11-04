import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "./db.ts";
import { runs } from "./schema.ts";

// The leaderboard edition a run saved now belongs to (spec FR31). Edition 2 is the escape-room
// heist; every run saved before it is edition 1, kept on its own board behind a link.
export const EDITION = 2;

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
  edition: number;
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

// Same edition, same kind, same room (for a room run) and same version: the rows a run
// competes against on the board.
function sameHeat(edition: number, kind: "room" | "heist", roomId: string | null, version: string) {
  const base = kind === "room" ? eq(runs.roomId, roomId as string) : isNull(runs.roomId);
  const ver =
    kind === "room" ? eq(runs.roomVersion, Number(version)) : eq(runs.heistVersion, version);
  return and(eq(runs.edition, edition), eq(runs.kind, kind), base, ver);
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
      edition: EDITION,
    })
    .run();
  const heat = db
    .select()
    .from(runs)
    .where(sameHeat(EDITION, run.kind, run.roomId, run.version))
    .all()
    .sort(better);
  const rank = heat.findIndex((r) => r.id === id) + 1;
  return { ...run, id, createdAt, edition: EDITION, rank };
}

// The current version of a kind/room is whichever one was most recently
// played: an old room version's runs don't compete on the board once a newer
// one has been cleared. The edition defaults to the current one; an earlier edition's rows show
// only when asked for.
export function topRuns(
  db: Db,
  filter: { kind: "room" | "heist"; roomId?: string; edition?: number },
  limit = 20,
): RunRow[] {
  const edition = filter.edition ?? EDITION;
  const roomId = filter.kind === "room" ? (filter.roomId ?? null) : null;
  const scope = filter.kind === "room" ? eq(runs.roomId, roomId as string) : isNull(runs.roomId);
  const latest = db
    .select()
    .from(runs)
    .where(and(eq(runs.edition, edition), eq(runs.kind, filter.kind), scope))
    .orderBy(desc(runs.createdAt))
    .limit(1)
    .all()[0];
  if (!latest) return [];
  const version =
    filter.kind === "room" ? String(latest.roomVersion) : (latest.heistVersion as string);
  const rows = db
    .select()
    .from(runs)
    .where(sameHeat(edition, filter.kind, roomId, version))
    .all()
    .sort(better)
    .slice(0, limit);
  return rows.map((row, i) => ({
    ...toInput(row),
    id: row.id,
    edition: row.edition,
    createdAt: row.createdAt,
    rank: i + 1,
  }));
}

// One board as the leaderboard shows it: the full heist first, then a tab per room in play order.
// Shared by the `/leaderboard` page and `/leaderboard.json`, the in-game panel's source.
export interface BoardTab {
  id: string; // "heist" or "room-N", the page's `?tab=`
  label: string;
  roomId: string | null;
  rows: RunRow[];
}

// The current edition's rooms are whatever `rooms/` holds; an earlier edition's come from
// `editionRooms`.
export function boardTabs(
  db: Db,
  rooms: readonly { id: string }[],
  edition: number = EDITION,
): BoardTab[] {
  return [
    {
      id: "heist",
      label: "Full heist",
      roomId: null,
      rows: topRuns(db, { kind: "heist", edition }),
    },
    ...rooms.map((r, i) => ({
      id: `room-${i + 1}`,
      label: `Room ${i + 1}`,
      roomId: r.id,
      rows: topRuns(db, { kind: "room", roomId: r.id, edition }),
    })),
  ];
}

// An earlier edition's rooms are no longer in `rooms/`, so they are the room ids its runs were
// saved with, in file-name (play) order.
export function editionRooms(db: Db, edition: number): { id: string }[] {
  return db
    .selectDistinct({ id: runs.roomId })
    .from(runs)
    .where(and(eq(runs.edition, edition), isNotNull(runs.roomId)))
    .orderBy(asc(runs.roomId))
    .all()
    .map((r) => ({ id: r.id as string }));
}

// The cleared card's board (it goes in the `cleared` message): the room's top 5, this run marked
// by its id, and this run's own rank only when it is outside them.
export interface BoardRow {
  rank: number;
  teamName: string;
  ms: number;
  loot: number;
  lootTotal: number;
  mine: boolean;
}
export interface RoomBoard {
  top: BoardRow[];
  mine: { rank: number; ms: number; loot: number; lootTotal: number } | null;
}

export function roomBoard(db: Db, run: RunRow): RoomBoard {
  const top = topRuns(db, { kind: "room", roomId: run.roomId as string }, 5).map((r) => ({
    rank: r.rank,
    teamName: r.teamName,
    ms: r.ms,
    loot: r.loot,
    lootTotal: r.lootTotal,
    mine: r.id === run.id,
  }));
  return {
    top,
    mine: top.some((r) => r.mine)
      ? null
      : { rank: run.rank, ms: run.ms, loot: run.loot, lootTotal: run.lootTotal },
  };
}

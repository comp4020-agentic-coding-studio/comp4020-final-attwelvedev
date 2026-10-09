// Times are epoch milliseconds. Only heist records persist (ADR 0009): a
// room clear or a finished heist, never a lobby or a game in progress.
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// `roomId`/`roomVersion` are set for a `"room"` row and null for a `"heist"`
// one; `heistVersion` (the three room versions joined, e.g. "1.1.2") is the
// reverse. Keeping them apart means "a different room version doesn't
// compete" falls out of one equality check per kind, not a shared column two
// kinds would have to agree on how to compare.
export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["room", "heist"] }).notNull(),
  roomId: text("room_id"),
  roomVersion: integer("room_version"),
  heistVersion: text("heist_version"),
  teamName: text("team_name").notNull(),
  names: text("names").notNull(), // JSON array of { nickname, bot }
  ms: integer("ms").notNull(),
  loot: integer("loot").notNull(),
  lootTotal: integer("loot_total").notNull(),
  createdAt: integer("created_at").notNull(),
});

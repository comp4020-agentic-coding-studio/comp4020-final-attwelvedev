import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

export type Db = BetterSQLite3Database;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Migrations run when a database is opened, on whatever machine holds the
// volume: there's no separate machine to run them from. The flow: edit
// src/lib/schema.ts, `pnpm db:generate`, commit the migration in drizzle/.
export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const client = new Database(path);
  client.pragma("journal_mode = WAL");
  const db = drizzle(client);
  // Foreign keys off for the migration itself: an old pivot-era migration
  // (0008, already applied to the deployed volume and never to be edited)
  // drops a referenced table before some of its referencing ones, which a
  // fresh, empty database enforces and an already-migrated one never
  // revisits. Enforcement comes back on for everything the app does with
  // the database afterwards.
  client.pragma("foreign_keys = OFF");
  migrate(db, { migrationsFolder: "./drizzle" });
  client.pragma("foreign_keys = ON");
  return db;
}

// One SQLite file is the app's whole persistent state. In production
// fly.toml's volume is /data and the Dockerfile points DATABASE_PATH there,
// which is how state survives a restart and a redeploy; locally it defaults
// to an untracked file in .data/.
export const db: Db = openDb(process.env.DATABASE_PATH ?? "./.data/app.db");

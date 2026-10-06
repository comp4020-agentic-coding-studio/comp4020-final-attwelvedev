import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

export type Db = BetterSQLite3Database;

// Migrations run when a database is opened, on whatever machine holds the
// volume: there's no separate machine to run them from. The flow: edit
// src/lib/schema.ts, `pnpm db:generate`, commit the migration in drizzle/.
export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const client = new Database(path);
  client.pragma("journal_mode = WAL");
  client.pragma("foreign_keys = ON");
  const db = drizzle(client);
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

// One SQLite file is the app's whole persistent state. In production
// fly.toml's volume is /data and the Dockerfile points DATABASE_PATH there,
// which is how state survives a restart and a redeploy; locally it defaults
// to an untracked file in .data/.
export const db: Db = openDb(process.env.DATABASE_PATH ?? "./.data/app.db");

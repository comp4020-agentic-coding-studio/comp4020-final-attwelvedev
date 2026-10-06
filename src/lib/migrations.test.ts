import { readdirSync, readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

// What the app does at boot against the Fly volume: new migrations run over a
// database that already holds rows. Applied here by hand, in order, so the
// test can put a row in between.
const sqlFor = (prefix: string): string[] =>
  readdirSync("./drizzle")
    .filter((f) => f.startsWith(`${prefix}_`) && f.endsWith(".sql"))
    .flatMap((f) => readFileSync(`./drizzle/${f}`, "utf8").split("--> statement-breakpoint"));

const applyThrough = (client: Database.Database, from: number, to: number) => {
  for (let n = from; n <= to; n++) {
    for (const statement of sqlFor(String(n).padStart(4, "0"))) client.exec(statement);
  }
};

describe("migration 0006 (the item model)", () => {
  it("keeps an item that predates it, defaulted", () => {
    const client = new Database(":memory:");
    applyThrough(client, 0, 5);
    client.exec("PRAGMA foreign_keys = OFF");
    client
      .prepare("INSERT INTO items (id, household_id, name, created_at) VALUES (?, ?, ?, ?)")
      .run("i1", "h1", "old milk", 1);

    applyThrough(client, 6, 6);

    const row = client.prepare("SELECT * FROM items WHERE id = 'i1'").get();
    expect(row).toMatchObject({
      name: "old milk",
      category: "other",
      measure: "have",
      fill_stop: 4,
      count: 1,
      icon_key: null,
      exact_amount: null,
      exact_unit: null,
      estimated_expiry: null,
      exact_expiry: null,
      value_set_by: null,
      value_set_at: null,
      expiry_set_by: null,
      expiry_set_at: null,
    });
  });

  // drizzle-kit drops ON DELETE from an ADD COLUMN reference, so 0006 was
  // edited by hand to keep it; without it a member who set a value could not leave.
  it("clears the attribution when the member who set it is deleted", () => {
    const client = new Database(":memory:");
    client.pragma("foreign_keys = ON");
    applyThrough(client, 0, 6);
    client.exec(`INSERT INTO households (id, name, invite_code, created_at) VALUES ('h', 'H', 'C', 1);
      INSERT INTO members (id, household_id, name, created_at) VALUES ('m', 'h', 'M', 1);
      INSERT INTO items (id, household_id, name, created_at, value_set_by, value_set_at, expiry_set_by, expiry_set_at)
        VALUES ('i', 'h', 'x', 1, 'm', 2, 'm', 3)`);
    client.exec("DELETE FROM members WHERE id = 'm'");
    expect(
      client
        .prepare("SELECT value_set_by, value_set_at, expiry_set_by, expiry_set_at FROM items")
        .get(),
    ).toEqual({
      value_set_by: null,
      value_set_at: 2,
      expiry_set_by: null,
      expiry_set_at: 3,
    });
  });
});

describe("migration 0007 (portions)", () => {
  it("keeps an item that predates it, with no portion", () => {
    const client = new Database(":memory:");
    applyThrough(client, 0, 6);
    client.exec("PRAGMA foreign_keys = OFF");
    client
      .prepare("INSERT INTO items (id, household_id, name, created_at) VALUES (?, ?, ?, ?)")
      .run("i1", "h1", "old milk", 1);

    applyThrough(client, 7, 7);

    expect(client.prepare("SELECT name, portion_of FROM items WHERE id = 'i1'").get()).toEqual({
      name: "old milk",
      portion_of: null,
    });
  });

  // drizzle-kit drops ON DELETE from an ADD COLUMN reference; 0007 was edited by hand
  it("clears portion_of when the original row is deleted", () => {
    const client = new Database(":memory:");
    client.pragma("foreign_keys = ON");
    applyThrough(client, 0, 7);
    client.exec(`INSERT INTO households (id, name, invite_code, created_at) VALUES ('h', 'H', 'C', 1);
      INSERT INTO items (id, household_id, name, created_at) VALUES ('a', 'h', 'x', 1);
      INSERT INTO items (id, household_id, name, created_at, portion_of) VALUES ('p', 'h', 'x', 1, 'a')`);
    client.exec("DELETE FROM items WHERE id = 'a'");
    expect(client.prepare("SELECT portion_of FROM items WHERE id = 'p'").get()).toEqual({
      portion_of: null,
    });
  });
});

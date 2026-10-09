import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Db, openDb } from "./db.ts";
import { type RunInput, saveRun, topRuns } from "./runs.ts";

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "heist-runs-"));
  path = join(dir, "test.db");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const room = (over: Partial<RunInput> = {}): RunInput => ({
  kind: "room",
  roomId: "loading-dock",
  version: "1",
  teamName: "Team QQQQ",
  names: [
    { nickname: "Ana", bot: false },
    { nickname: "Bo", bot: false },
    { nickname: "Cat", bot: true },
  ],
  ms: 60_000,
  loot: 2,
  lootTotal: 3,
  ...over,
});

describe("saveRun", () => {
  it("keeps the row after the file is reopened (persistence across restart)", () => {
    let db: Db = openDb(path);
    saveRun(db, room(), 1000);
    db = openDb(path);
    const rows = topRuns(db, { kind: "room", roomId: "loading-dock" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.teamName).toBe("Team QQQQ");
  });

  it("ranks by faster time within the same kind/room/version", () => {
    const db = openDb(path);
    const slow = saveRun(db, room({ ms: 90_000 }), 1000);
    expect(slow.rank).toBe(1); // the only run so far
    const fast = saveRun(db, room({ ms: 30_000 }), 2000);
    expect(fast.rank).toBe(1);
    const nowSlow = topRuns(db, { kind: "room", roomId: "loading-dock" }).find(
      (r) => r.id === slow.id,
    );
    expect(nowSlow?.rank).toBe(2);
  });

  it("breaks a tied time by more loot", () => {
    const db = openDb(path);
    const less = saveRun(db, room({ ms: 60_000, loot: 1 }), 1000);
    const more = saveRun(db, room({ ms: 60_000, loot: 3 }), 2000);
    expect(more.rank).toBe(1);
    const nowLess = topRuns(db, { kind: "room", roomId: "loading-dock" }).find(
      (r) => r.id === less.id,
    );
    expect(nowLess?.rank).toBe(2);
  });

  it("does not let a different room version compete", () => {
    const db = openDb(path);
    saveRun(db, room({ version: "1", ms: 10_000 }), 1000);
    saveRun(db, room({ version: "2", ms: 999_000 }), 2000);
    const rows = topRuns(db, { kind: "room", roomId: "loading-dock" });
    // current version is the most recently played one: version 2
    expect(rows).toHaveLength(1);
    expect(rows[0]?.version).toBe("2");
  });
});

describe("topRuns", () => {
  it("orders by ms then loot, fastest first", () => {
    const db = openDb(path);
    saveRun(db, room({ ms: 50_000, loot: 1 }), 1000);
    saveRun(db, room({ ms: 20_000, loot: 0 }), 2000);
    saveRun(db, room({ ms: 50_000, loot: 2 }), 3000);
    const rows = topRuns(db, { kind: "room", roomId: "loading-dock" });
    expect(rows.map((r) => r.ms)).toEqual([20_000, 50_000, 50_000]);
    expect(rows[1]?.loot).toBe(2);
    expect(rows[2]?.loot).toBe(1);
  });

  it("is empty when nothing has been saved for that room", () => {
    const db = openDb(path);
    expect(topRuns(db, { kind: "room", roomId: "nowhere" })).toEqual([]);
  });

  it("keeps heist runs separate from room runs", () => {
    const db = openDb(path);
    saveRun(db, room());
    saveRun(db, { ...room(), kind: "heist", roomId: null, version: "1.1.1" });
    expect(topRuns(db, { kind: "room", roomId: "loading-dock" })).toHaveLength(1);
    expect(topRuns(db, { kind: "heist" })).toHaveLength(1);
  });
});

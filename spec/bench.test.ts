import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

// Every file under a directory, recursively.
const filesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });

// The frame bench (scripts/bench-frame.ts) runs the real renderer on a page that exists only when the
// app is built with BENCH=1 (into dist-bench/); on the app people use it is not there.
describe("the frame bench page", () => {
  it("GET /bench is 404 without BENCH", async () => {
    const res = await fetch(new URL("/bench", baseUrl));
    expect(res.status).toBe(404);
  });

  // The bench's script imports whole rooms; built into dist/client it would hand anyone a room's map,
  // plate and chamber while /bench itself is a 404 (ADR 0007).
  it("no file a production build serves holds room text", () => {
    expect(existsSync("dist/client"), "dist/client is missing: run pnpm build first").toBe(true);
    // a map row of room 09's that no other room or source has
    const row = "#....Q...########.Q.......#...#####";
    const room = readFileSync("rooms/09-the-vault.room", "utf8");
    expect(room).toContain(row);
    for (const file of filesUnder("dist/client"))
      expect(readFileSync(file, "latin1").includes(row), file).toBe(false);
    const bench = readdirSync("dist/client/_astro").filter((n) => n.startsWith("bench"));
    expect(bench).toEqual([]);
  });
});

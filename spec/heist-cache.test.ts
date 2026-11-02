import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { clearTinyRoom } from "./heistPlay.ts";
import { closeAll, type RevealMsg, ready, startedGame } from "./play.ts";

const baseUrl = inject("baseUrl");

interface HeistMsg {
  t: "heist";
  caches: { room: string; found: boolean; item: string }[];
}

// What the server sends a team about a side job (caches FR15, FR16). Two fixture rooms that each
// carry a cache nobody uncovers, so each clear reports a missed one; it runs against its own app.
describe("the cleared card and the heist record carry the caches", () => {
  const port = 20080 + Math.floor(Math.random() * 1000);
  const dir = mkdtempSync(join(tmpdir(), "heist-cache-spec-"));
  const ownUrl = `http://127.0.0.1:${port}`;
  let app: ChildProcess;

  beforeAll(async () => {
    if (!existsSync("dist/server/entry.mjs")) execSync("pnpm build", { stdio: "ignore" });
    app = spawn("node", ["server.ts"], {
      env: {
        ...process.env,
        PORT: String(port),
        DATABASE_PATH: join(dir, "app.db"),
        ROOMS_DIR: "spec/fixtures/rooms-cache",
      },
      stdio: "ignore",
    });
    for (let attempt = 0; attempt < 150; attempt++) {
      try {
        await fetch(ownUrl);
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    throw new Error(`the spec's own app never came up on ${ownUrl}`);
  }, 40_000);

  afterAll(() => {
    app?.kill();
    rmSync(dir, { recursive: true, force: true });
  });

  it("sends `cleared` with the room's unfound cache, and `heist` with both rooms in order", async () => {
    const { players } = await startedGame(ownUrl);
    ready(players);
    const first = await clearTinyRoom(players);
    expect(first).toMatchObject({
      room: "01-cache-a",
      cache: {
        room: "01-cache-a",
        opened: false,
        found: false,
        item: "watch",
        owner: 0,
        riddle: "Where the moon watches, listen twice.",
      },
    });
    expect(first.cache).not.toHaveProperty("by");
    // nothing was solved, so nobody is credited with a side job
    for (const c of first.credits) expect(c.lines.join(" ")).not.toMatch(/side job/);

    players[0]?.socket.send({ t: "next" });
    const reveals = await Promise.all(players.map((p) => p.socket.next<RevealMsg>("reveal", 3000)));
    for (const [i, r] of reveals.entries()) (players[i] as { role: string }).role = r.role;
    ready(players);
    const second = await clearTinyRoom(players);
    expect(second).toMatchObject({
      room: "02-cache-b",
      cache: { opened: false, found: false, item: "ring", owner: 2 },
    });

    const heist = await players[0]?.socket.next<HeistMsg>("heist", 5000);
    expect(heist?.caches).toEqual([
      { room: "01-cache-a", found: false, item: "watch" },
      { room: "02-cache-b", found: false, item: "ring" },
    ]);
    await closeAll(players);
  }, 60_000);
});

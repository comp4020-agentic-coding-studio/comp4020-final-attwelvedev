import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reachCameraHall } from "./heistPlay.ts";
import { byRole, closeAll, nextView, ready, startedGame } from "./play.ts";

interface CaughtMsg {
  t: "caught";
  hazard: "guard" | "camera" | "laser";
  seat: number;
  checkpoint: number;
}

// When the team is caught, everyone is told what caught whom and where they restart:
// in the dark nobody can see for themselves, and Can't see never could.
// Its own app on First Job (room 1 until escape-room phase 04), the room with a camera hall to be
// caught in right after the first checkpoint.
describe("being caught", () => {
  const port = 21080 + Math.floor(Math.random() * 1000);
  const dir = mkdtempSync(join(tmpdir(), "caught-spec-"));
  const baseUrl = `http://127.0.0.1:${port}`;
  let app: ChildProcess;

  beforeAll(async () => {
    if (!existsSync("dist/server/entry.mjs")) execSync("pnpm build", { stdio: "ignore" });
    app = spawn("node", ["server.ts"], {
      env: {
        ...process.env,
        PORT: String(port),
        DATABASE_PATH: join(dir, "app.db"),
        ROOMS_DIR: "spec/fixtures/first-job",
      },
      stdio: "ignore",
    });
    for (let attempt = 0; attempt < 150; attempt++) {
      try {
        await fetch(baseUrl);
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    throw new Error(`the spec's own app never came up on ${baseUrl}`);
  }, 40_000);

  afterAll(() => {
    app?.kill();
    rmSync(dir, { recursive: true, force: true });
  });

  it("tells all three players what got whom, and the checkpoint they go back to", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    // First Job: push the crate, go through the door, and wait in the hall in front of the camera
    await reachCameraHall(players);

    // then all three run east at once, into the camera's cone while it watches
    let watching = false;
    while (!watching) {
      const view = await nextView(byRole(players, "deaf"), 3000);
      watching = view.entities.some((e) => e.id === "C1" && e.state === "watching");
    }
    for (const p of players)
      p.socket.send({ t: "input", seq: 2000, move: { x: 1, y: 0 }, act: false });
    const told = await Promise.all(players.map((p) => p.socket.next<CaughtMsg>("caught", 20_000)));
    for (const msg of told) {
      expect(["guard", "camera", "laser"]).toContain(msg.hazard);
      expect([0, 1, 2]).toContain(msg.seat);
      // the first checkpoint is just behind the hall
      expect([0, 1, 2]).toContain(msg.checkpoint);
    }
    // everyone is told the same thing
    expect(new Set(told.map((m) => `${m.hazard}:${m.seat}`)).size).toBe(1);
    await closeAll(players);
  }, 120_000);
});

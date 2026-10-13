import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { clearRoomOne } from "./heistPlay.ts";
import { text } from "./http.ts";
import { closeAll, ready, startedGame } from "./play.ts";

const baseUrl = inject("baseUrl");

describe("the leaderboard", () => {
  it("answers 200 with a tab for the full heist and each room", async () => {
    const res = await fetch(new URL("/leaderboard", baseUrl));
    expect(res.status).toBe(200);
    const body = text(await res.text());
    expect(body).toContain("Full heist");
    expect(body).toContain("Room 1");
    expect(body).toContain("Room 2");
    expect(body).toContain("Room 3");
  });

  it("shows the empty state for a board nothing has been saved to yet", async () => {
    // nothing in this suite plays a heist through to its third room, so the
    // full-heist board stays empty however many room runs other specs save
    const res = await fetch(new URL("/leaderboard?tab=heist", baseUrl));
    const body = text(await res.text());
    expect(body).toContain("No runs yet. Be first.");
  });

  it("selects a tab from `?tab=` alone, without scripts", async () => {
    const res = await fetch(new URL("/leaderboard?tab=room-2", baseUrl));
    const dom = await res.text();
    expect(dom).toMatch(/href="\/leaderboard\?tab=room-2"[^>]*aria-current="page"/);
  });

  // The board shows the top 20 and bot clears tie on time, so on a long-lived
  // database a fresh run can fall off it. This one runs against its own app on
  // an empty database, so what it sees never depends on what was saved before.
  describe("with a real run", () => {
    const port = 18080 + Math.floor(Math.random() * 1000);
    const dir = mkdtempSync(join(tmpdir(), "leaderboard-spec-"));
    const ownUrl = `http://127.0.0.1:${port}`;
    let app: ChildProcess;

    beforeAll(async () => {
      // server.ts serves the built site from dist/, which CI's checkout doesn't
      // have (it only builds inside the Docker image)
      if (!existsSync("dist/server/entry.mjs")) execSync("pnpm build", { stdio: "ignore" });
      app = spawn("node", ["server.ts"], {
        env: { ...process.env, PORT: String(port), DATABASE_PATH: join(dir, "app.db") },
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

    it("lists a real run once a room is cleared, with its team and crew, never a device hash", async () => {
      const { players, code } = await startedGame(ownUrl);
      ready(players);
      const cleared = await clearRoomOne(players);
      expect(cleared.room).toBe("01-loading-dock");
      await closeAll(players);

      const res = await fetch(new URL("/leaderboard?tab=room-1", ownUrl));
      const raw = await res.text();
      const body = text(raw);
      expect(body).toContain(`Team ${code}`);
      expect(body).toContain("Ana");
      expect(body).toContain("Bo");
      expect(body).toContain("Cy");
      expect(raw).not.toMatch(/\b[0-9a-f]{8}\b/);
    });
  });
});

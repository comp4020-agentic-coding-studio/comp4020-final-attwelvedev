import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { RoleView } from "../src/game/perception.ts";
import { closeAll, nextTick, ready, startedGame } from "./play.ts";
import { connect } from "./ws.ts";

// The playtest seam (ADR 0027): with PLAYTEST_AUTOPILOT=1 a person's seat can be handed to a bot.
// The flag is never on in the shared app, so the seam's cases run on their own app.

const until = async (ok: () => boolean, ms: number): Promise<boolean> => {
  const deadline = Date.now() + ms;
  while (!ok() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  return ok();
};

describe("autopilot, with the flag on", () => {
  const port = 22080 + Math.floor(Math.random() * 1000);
  const dir = mkdtempSync(join(tmpdir(), "autopilot-spec-"));
  const ownUrl = `http://127.0.0.1:${port}`;
  let app: ChildProcess;
  const lines: { event?: string; kind?: string; detail?: Record<string, unknown> }[] = [];

  beforeAll(async () => {
    if (!existsSync("dist/server/entry.mjs")) execSync("pnpm build", { stdio: "ignore" });
    app = spawn("node", ["server.ts"], {
      env: {
        ...process.env,
        PORT: String(port),
        DATABASE_PATH: join(dir, "app.db"),
        PLAYTEST_AUTOPILOT: "1",
      },
      stdio: ["ignore", "pipe", "ignore"],
    });
    let buffered = "";
    app.stdout?.on("data", (chunk: Buffer) => {
      buffered += chunk.toString();
      const parts = buffered.split("\n");
      buffered = parts.pop() ?? "";
      for (const part of parts) {
        try {
          lines.push(JSON.parse(part));
        } catch {
          // not a log line
        }
      }
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

  it("says so in the welcome", async () => {
    const socket = await connect(ownUrl);
    expect(await socket.next("welcome")).toMatchObject({ autopilot: true });
    await socket.close();
  });

  it("a bot drives the seat: the socket's own held key is ignored, and every seat still gets views", async () => {
    const { players } = await startedGame(ownUrl);
    ready(players);
    for (const p of players) await nextTick(p.socket);
    const [a, b, c] = players as [(typeof players)[0], (typeof players)[0], (typeof players)[0]];
    // seat 1 is sighted in room 01 (its view carries its own position), and its bot has a job there
    const start = (await nextTick(b.socket)).you.pos;
    b.socket.send({ t: "autopilot", on: true });
    // a held key, numbered far past anything the bot will number its own inputs this room
    b.socket.send({ t: "input", seq: 100_000, move: { x: 1, y: 0 }, act: false });
    const seen: RoleView[] = [];
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      seen.push((await b.socket.next<{ view: RoleView }>("view")).view);
    }
    expect(seen.every((v) => v.ack < 100_000)).toBe(true); // the held key was never applied
    const moved = seen
      .map((v) => v.you.pos)
      .filter((p) => p && (p.x !== start?.x || p.y !== start?.y));
    expect(moved.length).toBeGreaterThan(0); // the bot walks it
    await nextTick(a.socket);
    await nextTick(c.socket);
    const toggles = await until(() => lines.some((l) => l.event === "autopilot"), 2000);
    expect(toggles).toBe(true);
    b.socket.send({ t: "autopilot", on: false });
    await until(() => lines.filter((l) => l.event === "autopilot").length >= 2, 2000);
    // one line per toggle, the kind only
    expect(lines.filter((l) => l.event === "autopilot").map((l) => l.detail)).toEqual([
      { kind: "on" },
      { kind: "off" },
    ]);
    await closeAll(players);
  });
});

describe("autopilot, on the shared app (flag off)", () => {
  const baseUrl = inject("baseUrl");

  it("is refused, and the welcome does not mention it", async () => {
    const socket = await connect(baseUrl);
    const welcome = await socket.next<Record<string, unknown>>("welcome");
    expect(welcome).not.toHaveProperty("autopilot");
    socket.send({ t: "autopilot", on: true });
    expect(await socket.next("error")).toMatchObject({ t: "error", code: "refused" });
    await socket.close();
  });
});

describe("autopilot on a Fly machine", () => {
  it("the server refuses to start, says why, and never answers on its port", async () => {
    const port = 23080 + Math.floor(Math.random() * 1000);
    const dir = mkdtempSync(join(tmpdir(), "autopilot-fly-spec-"));
    const app = spawn("node", ["server.ts"], {
      env: {
        ...process.env,
        PORT: String(port),
        DATABASE_PATH: join(dir, "app.db"),
        PLAYTEST_AUTOPILOT: "1",
        FLY_APP_NAME: "x",
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    app.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    let answered = false;
    const probe = setInterval(() => {
      fetch(`http://127.0.0.1:${port}`).then(
        () => {
          answered = true;
        },
        () => {},
      );
    }, 200);
    try {
      const code = await new Promise<number | null>((resolve) => {
        const timer = setTimeout(() => resolve(-1), 10_000);
        app.on("exit", (c) => {
          clearTimeout(timer);
          resolve(c);
        });
      });
      expect(code).toBe(1);
      expect(stderr).toContain("refusing to start");
      expect(answered).toBe(false);
    } finally {
      clearInterval(probe);
      app.kill();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15_000);
});

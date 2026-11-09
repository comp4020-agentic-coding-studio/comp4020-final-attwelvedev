// A bot has played roles too, and the reveal's Played row shows them, as it does for a person (the user, Task 81
// review). One person alone: the other two seats are bots, who walk their own way. Own app on two one-step rooms
// (spec/fixtures/rooms-next), so a room clears in a second and the heist has a second reveal.

import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RevealMsg } from "./play.ts";
import { connect } from "./ws.ts";

const port = 25080 + Math.floor(Math.random() * 1000);
const ownUrl = `http://127.0.0.1:${port}`;
const dir = mkdtempSync(join(tmpdir(), "bots-played-spec-"));
let app: ChildProcess;

beforeAll(async () => {
  if (!existsSync("dist/server/entry.mjs")) execSync("pnpm build", { stdio: "ignore" });
  app = spawn("node", ["server.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: join(dir, "app.db"),
      ROOMS_DIR: "spec/fixtures/rooms-next",
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

describe("the reveal's Played row, for bots", () => {
  it("names the role each bot played in the room before, under its own name", async () => {
    const host = await connect(ownUrl);
    host.send({ t: "lobby.create", nickname: "Ana" });
    await host.next("lobby");
    host.send({ t: "lobby.start" });
    const first = await host.next<RevealMsg>("reveal");
    expect(first.crew.filter((c) => c.bot).map((c) => c.nickname)).toEqual([
      "Bot Jinx",
      "Bot Moss",
    ]);
    host.send({ t: "ready" });
    // walk east until the bots and the host have cleared the one-step room
    let seq = 0;
    const deadline = Date.now() + 25_000;
    for (;;) {
      host.send({ t: "input", seq: ++seq, move: { x: 1, y: 0 }, act: false });
      try {
        await host.next("cleared", 150);
        break;
      } catch {
        if (Date.now() > deadline) throw new Error("the room was not cleared in time");
      }
    }
    host.send({ t: "next" });
    const second = await host.next<RevealMsg>("reveal", 5000);
    const roleOf = (name: string) => first.crew.find((c) => c.nickname === name)?.role;
    for (const bot of ["Bot Jinx", "Bot Moss"])
      expect(second.played[bot], bot).toEqual([roleOf(bot)]);
    expect(second.played.Ana).toEqual([first.role]);
    await host.close();
  }, 60_000);
});

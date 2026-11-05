// After the host presses Next, every seat sees the next room's role screen, and nothing ticks until
// all three are ready (FR3). A page still holds the cleared room's last view (from a tick past 0)
// when the new room's reveal arrives. Its own app on two one-step fixture rooms
// (spec/fixtures/rooms-next), so a room clears in a second and the heist has a next room.

import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RoleView } from "../../src/game/perception.ts";
import { DESKTOP, launch } from "../browser.ts";
import { closeAll, noTick, type Player, ready, startedGame } from "../play.ts";
import { connect, type Socket } from "../ws.ts";

const port = 24080 + Math.floor(Math.random() * 1000);
const ownUrl = `http://127.0.0.1:${port}`;
const dir = mkdtempSync(join(tmpdir(), "next-room-spec-"));
let app: ChildProcess;
let browser: Browser;

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
  browser = await launch();
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
afterAll(async () => {
  await browser?.close();
  app?.kill();
  rmSync(dir, { recursive: true, force: true });
});

// A person's own device, opened in a browser: their cookie and saved nickname rejoin their seat.
// `slowRoom` names a room whose reveal view (tick 0) reaches this page late, as on a slow link: the
// page has mounted the new room's game by the time it lands, holding only the old room's last view.
async function openAs(
  cookie: string,
  nickname: string,
  code: string,
  slowRoom?: string,
): Promise<Page> {
  const eq = cookie.indexOf("=");
  const context = await browser.newContext({ viewport: DESKTOP });
  await context.addCookies([
    { name: cookie.slice(0, eq), value: cookie.slice(eq + 1), url: ownUrl },
  ]);
  await context.addInitScript((n) => localStorage.setItem("heist.nickname", n), nickname);
  const page = await context.newPage();
  if (slowRoom) {
    await page.routeWebSocket(/\/ws$/, (ws) => {
      const server = ws.connectToServer();
      server.onMessage((frame) => {
        const late =
          typeof frame === "string" &&
          frame.includes('"t":"view"') &&
          frame.includes(`"room":"${slowRoom}"`) &&
          frame.includes('"tick":0,');
        if (late) setTimeout(() => ws.send(frame), 1500);
        else ws.send(frame);
      });
    });
  }
  await page.goto(new URL(`/lobby/${code}`, ownUrl).href);
  await page.locator(".frame canvas").waitFor();
  return page;
}

// Walks every socket east (every exit tile is east of the spawns) until the room is cleared. The walk
// is sent again and again: the page open on the same seat sends its own still input. The server stops
// ticking once cleared, so the page keeps the cleared room's last view.
async function walkUntilCleared(walkers: Socket[], told: Socket): Promise<void> {
  let seq = 1000;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    for (const s of walkers) s.send({ t: "input", seq: ++seq, move: { x: 1, y: 0 }, act: false });
    try {
      await told.next("cleared", 100);
      return;
    } catch {
      // not yet
    }
  }
  throw new Error("the room was not cleared in time");
}

// The new room's reveal view (tick 0) has arrived: the views queued from the cleared room are passed.
async function atReveal(socket: Socket, room: string): Promise<void> {
  for (;;) {
    const { view } = await socket.next<{ view: RoleView }>("view", 5000);
    if (view.room === room && view.tick === 0) return;
  }
}

describe("the next room", () => {
  it("a page shows the next room's role screen after Next, while it holds the cleared room's last view", async () => {
    const { players, code } = await startedGame(ownUrl);
    ready(players);
    const page = await openAs((players[1] as Player).cookie, "Bo", code, "02-walk");
    await walkUntilCleared(
      players.map((p) => p.socket),
      (players[1] as Player).socket,
    );
    await page.getByRole("heading", { name: "Room cleared" }).waitFor();
    (players[0] as Player).socket.send({ t: "next" });
    await page.getByRole("button", { name: "I'm ready" }).waitFor({ timeout: 5000 });
    expect(await page.locator(".reveal-frame").count()).toBe(1);
    // the server holds the new room at tick 0 until all three are ready
    await atReveal((players[1] as Player).socket, "02-walk");
    await noTick((players[1] as Player).socket, 700);
    // and the page stays on the role screen: it has not entered the room on an old view
    expect(await page.locator(".reveal-frame.covering").count()).toBe(0);
    await expect(page.getByRole("button", { name: "I'm ready" }).isVisible()).resolves.toBe(true);
    await page.context().close();
    await closeAll(players);
  }, 60_000);

  it("a solo player's lobby survives Next", async () => {
    const res = await fetch(new URL("/", ownUrl));
    const cookie = res.headers.getSetCookie()[0]?.split(";")[0] ?? "";
    const solo = await connect(ownUrl, cookie);
    solo.send({ t: "lobby.create", nickname: "Ana" });
    const { lobby } = await solo.next<{ lobby: { code: string } }>("lobby");
    solo.send({ t: "lobby.start" });
    await solo.next("reveal");
    solo.send({ t: "ready" });
    const page = await openAs(cookie, "Ana", lobby.code, "02-walk");
    // seat 0 is the person; the two bots go to the exit on their own
    await walkUntilCleared([solo], solo);
    await page.getByRole("heading", { name: "Room cleared" }).waitFor();
    solo.send({ t: "next" });
    await page.getByRole("button", { name: "I'm ready" }).waitFor({ timeout: 5000 });
    await atReveal(solo, "02-walk");
    await noTick(solo, 700);
    expect(await page.getByText(/No lobby/).count()).toBe(0);
    await expect(page.getByRole("button", { name: "I'm ready" }).isVisible()).resolves.toBe(true);
    await page.context().close();
    await solo.close();
  }, 60_000);
});

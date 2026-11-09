// (copied from next-room.test.ts) After the host presses Next, every seat sees the next room's role screen, and nothing ticks until
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
const dir = mkdtempSync(join(tmpdir(), "backdrop-spec-"));
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

// The reveal's backdrop (diorama FR7): the room drawn behind the card, never black, for a sighted
// role, in rooms 1 and 2. Can't see's stays ink.
const centre = (page: Page) =>
  page.locator(".reveal-canvas canvas").evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const px = c
      .getContext("2d")
      ?.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
    return px ? Array.from(px) : [];
  });
const isBlind = async (page: Page) =>
  /can't see/i.test(await page.locator(".reveal-title").innerText());

describe("the reveal's backdrop at room 2", () => {
  let players: Player[] = [];
  const pages: Page[] = [];
  beforeAll(async () => {
    const game = await startedGame(ownUrl);
    players = game.players;
    ready(players);
    for (const [i, name] of ["Ana", "Bo", "Cy"].entries())
      pages.push(await openAs((players[i] as Player).cookie, name, game.code));
    await walkUntilCleared(
      players.map((p) => p.socket),
      (players[1] as Player).socket,
    );
    for (const page of pages) await page.getByRole("heading", { name: "Room cleared" }).waitFor();
    (players[0] as Player).socket.send({ t: "next" });
    for (const page of pages) await page.getByRole("button", { name: "I'm ready" }).waitFor();
    await atReveal((players[1] as Player).socket, "02-walk");
  }, 60_000);
  afterAll(async () => {
    for (const page of pages) await page.context().close();
    await closeAll(players);
  });

  it("the reveal of room 2 draws the room behind the card for a sighted role", async () => {
    let checked = 0;
    for (const page of pages) {
      if (await isBlind(page)) continue;
      await expect
        .poll(async () => (await centre(page)).slice(0, 3).join(","), {
          timeout: 3000,
          message: "room 2's backdrop centre pixel",
        })
        .not.toBe("0,0,0");
      checked++;
    }
    expect(checked, "two sighted pages").toBe(2);
  });

  it("a sighted page whose first view is late still shows dusk behind the card, never black", async () => {
    // a slow link: room 2's tick-0 view reaches the page 1.5 s after its reveal
    const game = await startedGame(ownUrl);
    ready(game.players);
    const late = await openAs((game.players[1] as Player).cookie, "Bo", game.code, "02-walk");
    await walkUntilCleared(
      game.players.map((p) => p.socket),
      (game.players[1] as Player).socket,
    );
    await late.getByRole("heading", { name: "Room cleared" }).waitFor();
    (game.players[0] as Player).socket.send({ t: "next" });
    await late.getByRole("button", { name: "I'm ready" }).waitFor();
    if (await isBlind(late)) {
      await late.context().close();
      await closeAll(game.players);
      return;
    }
    // the view for room 2 is still 1.5 s away, so nothing is drawn yet: read what the player sees
    // (the screenshot's top-left pixel, under the scrim), which must be lit dusk and not black
    const shot = await late.screenshot({ clip: { x: 2, y: 2, width: 1, height: 1 } });
    const px = await late.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const c = new OffscreenCanvas(1, 1);
      const g = c.getContext("2d") as OffscreenCanvasRenderingContext2D;
      g.drawImage(bmp, 0, 0);
      return Array.from(g.getImageData(0, 0, 1, 1).data);
    }, shot.toString("base64"));
    const sum = (px[0] ?? 0) + (px[1] ?? 0) + (px[2] ?? 0);
    expect(sum, `top-left pixel ${px}`).toBeGreaterThan(70);
    await late.context().close();
    await closeAll(game.players);
  }, 60_000);

  it("Can't see's reveal backdrop stays ink", async () => {
    let checked = 0;
    for (const page of pages) {
      if (!(await isBlind(page))) continue;
      await page.waitForTimeout(300);
      expect((await centre(page)).slice(0, 3)).toEqual([0, 0, 0]);
      checked++;
    }
    expect(checked, "one blind page").toBe(1);
  });
});

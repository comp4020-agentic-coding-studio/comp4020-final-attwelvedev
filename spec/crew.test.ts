import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { RoleView } from "../src/game/perception.ts";
import type { Seat } from "../src/game/types.ts";
import { clearTinyRoom } from "./heistPlay.ts";
import { text } from "./http.ts";
import {
  FIVE,
  type Five,
  nextTick,
  noTick,
  type Player,
  type RevealMsg,
  startedFive,
} from "./play.ts";
import type { Socket } from "./ws.ts";

const baseUrl = inject("baseUrl");

interface ErrorMsg {
  t: "error";
  code: string;
}
type Table = Five;

// Five people in a lobby, started: the first three play room 1, Di and Ed sit it out.
async function startedFiveHere(url: string): Promise<{ table: Table; reveals: RevealMsg[] }> {
  const table = await startedFive(baseUrl, url);
  return { table, reveals: table.reveals };
}

const closeTable = (table: Table) => Promise.all(table.sockets.map((s) => s.close()));
const sendReady = (table: Table, people: number[]) => {
  for (const i of people) table.sockets[i]?.send({ t: "ready" });
};
const noMessage = (s: Socket, t: string, ms = 700) => expect(s.next(t, ms)).rejects.toThrow(/no "/);

describe("a lobby of five", () => {
  it("the first reveal names two sitting out, and they get spectator views", async () => {
    const { table, reveals } = await startedFiveHere(baseUrl);
    expect(reveals.map((r) => r.sittingOut)).toEqual(FIVE.map(() => ["Di", "Ed"]));
    expect(reveals[0]?.crew.map((c) => c.nickname)).toEqual(["Ana", "Bo", "Cy"]);
    expect(reveals.slice(0, 3).map((r) => r.role)).toEqual(["blind", "deaf", "mute"]);
    expect(reveals[0]).toMatchObject({ index: 0, rooms: 3 });

    sendReady(table, [0, 1, 2]);
    for (const watcher of [3, 4]) {
      const first = await (table.sockets[watcher] as Socket).next<{ view: RoleView }>("view", 3000);
      expect(first.view.you.seat).toBe(0); // they watch seat 0 until they follow another
    }
    await closeTable(table);
  });

  it("the host's swap during the reveal changes both roles and clears everyone's ready", async () => {
    const { table } = await startedFiveHere(baseUrl);
    sendReady(table, [0, 1]); // two of three are ready
    table.sockets[0]?.send({ t: "crew.swap", a: 0, b: 2 });
    const after = await Promise.all(table.sockets.map((s) => s.next<RevealMsg>("reveal", 3000)));
    expect(after[0]?.role).toBe("mute");
    expect(after[2]?.role).toBe("blind");
    expect(after[1]?.role).toBe("deaf");
    expect(after[3]?.crew.map((c) => c.role)).toEqual(["mute", "deaf", "blind"]);

    // the third pressing Ready would have started the room if the other two still counted
    sendReady(table, [2]);
    await noTick(table.sockets[2] as Socket);
    sendReady(table, [0, 1, 2]);
    await nextTick(table.sockets[2] as Socket, 3000);
    await closeTable(table);
  });

  it("a swap after Ready has started the room is refused", async () => {
    const { table } = await startedFiveHere(baseUrl);
    sendReady(table, [0, 1, 2]);
    await nextTick(table.sockets[0] as Socket, 3000);
    table.sockets[0]?.send({ t: "crew.swap", a: 0, b: 2 });
    await noMessage(table.sockets[0] as Socket, "reveal");
    await nextTick(table.sockets[0] as Socket, 3000); // and the room is still running
    await closeTable(table);
  });

  it("a non-host swap is not-host", async () => {
    const { table } = await startedFiveHere(baseUrl);
    table.sockets[1]?.send({ t: "crew.swap", a: 0, b: 2 });
    expect((await (table.sockets[1] as Socket).next<ErrorMsg>("error", 3000)).code).toBe(
      "not-host",
    );
    await closeTable(table);
  });
});

// The heist record names the people who played, not the people in the lobby. This needs a heist
// of one room, so it runs against its own app on the fixture rooms and an empty database.
describe("the heist record", () => {
  const port = 19080 + Math.floor(Math.random() * 1000);
  const dir = mkdtempSync(join(tmpdir(), "crew-spec-"));
  const ownUrl = `http://127.0.0.1:${port}`;
  let app: ChildProcess;

  beforeAll(async () => {
    if (!existsSync("dist/server/entry.mjs")) execSync("pnpm build", { stdio: "ignore" });
    app = spawn("node", ["server.ts"], {
      env: {
        ...process.env,
        PORT: String(port),
        DATABASE_PATH: join(dir, "app.db"),
        ROOMS_DIR: "spec/fixtures/rooms",
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

  it("names everyone who played any room, and not someone who only sat in the lobby", async () => {
    const { table, reveals } = await startedFiveHere(ownUrl);
    expect(reveals[0]?.rooms).toBe(1);
    // Ed takes Bo's seat before the room starts: Bo and Di never play
    table.sockets[0]?.send({ t: "crew.swap", a: 1, b: 4 });
    const swapped = await Promise.all(table.sockets.map((s) => s.next<RevealMsg>("reveal", 3000)));
    expect(swapped[4]?.role).toBe("deaf");
    expect(swapped[0]?.sittingOut.sort()).toEqual(["Bo", "Di"]);

    const players: Player[] = [0, 4, 2].map((person, seat) => ({
      socket: table.sockets[person] as Socket,
      cookie: table.cookies[person] as string,
      seat: seat as Seat,
      role: (swapped[person] as RevealMsg).role,
    }));
    sendReady(table, [0, 4, 2]);
    await clearTinyRoom(players);
    await (table.sockets[0] as Socket).next("heist", 5000);

    const body = text(await (await fetch(new URL("/leaderboard?tab=heist", ownUrl))).text());
    expect(body).toContain(`Team ${table.code}`);
    expect(body).toContain("Ana, Ed, Cy");
    await closeTable(table);
  }, 60_000);
});

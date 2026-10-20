import { describe, expect, inject, it } from "vitest";
import type { RoleView } from "../src/game/perception.ts";
import { nextTick, noTick, type Player, startedFive } from "./play.ts";
import { connect, type Socket } from "./ws.ts";

const baseUrl = inject("baseUrl");

interface ReadyMsg {
  t: "ready";
  seats: number[];
}
interface CuesReveal {
  role: string;
  cues: string[];
}

// The next `ready` message that satisfies `ok`: the earlier ones are history, not what is asked.
async function readyWhere(s: Socket, ok: (seats: number[]) => boolean, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const m = await s.next<ReadyMsg>("ready", Math.max(1, deadline - Date.now()));
    if (ok(m.seats)) return m.seats;
  }
}
const close = (sockets: Socket[]) => Promise.all(sockets.map((s) => s.close()));

describe("the reveal tells everyone who is ready", () => {
  it("sends the seats that are ready to players and watchers alike, and again on every change", async () => {
    const five = await startedFive(baseUrl);
    const [host, bo, , di, ed] = five.sockets as [Socket, Socket, Socket, Socket, Socket];
    for (const s of [host, bo, di, ed]) expect(await readyWhere(s, () => true)).toEqual([]);
    host.send({ t: "ready" });
    for (const s of [host, bo, di, ed])
      expect(await readyWhere(s, (seats) => seats.length > 0)).toEqual([0]);
    bo.send({ t: "ready" });
    for (const s of [host, di])
      expect(await readyWhere(s, (seats) => seats.length === 2)).toEqual([0, 1]);
    await close(five.sockets);
  });

  it("counts a bot as ready from the start", async () => {
    const [host] = [await connect(baseUrl)];
    host.send({ t: "lobby.create", nickname: "Ana" });
    await host.next("lobby");
    host.send({ t: "lobby.start" });
    expect(await readyWhere(host, () => true)).toEqual([1, 2]);
    await host.close();
  });

  it("clears everyone's ready when the host swaps two people", async () => {
    const five = await startedFive(baseUrl);
    const [host, bo, cy, di] = five.sockets as [Socket, Socket, Socket, Socket, Socket];
    cy.send({ t: "ready" });
    await readyWhere(host, (seats) => seats.includes(2));
    host.send({ t: "crew.swap", a: 0, b: 1 });
    expect(await readyWhere(host, (seats) => seats.length === 0)).toEqual([]);
    expect(await readyWhere(di, (seats) => seats.length === 0)).toEqual([]);
    void bo;
    await close(five.sockets);
  });
});

describe("taking I'm ready back", () => {
  it("unready removes the seat from the ready list for everyone, and ready puts it back", async () => {
    const five = await startedFive(baseUrl);
    const [host, bo, , di] = five.sockets as [Socket, Socket, Socket, Socket, Socket];
    host.send({ t: "ready" });
    await readyWhere(di, (seats) => seats.includes(0));
    host.send({ t: "ready", on: false });
    for (const s of [host, bo, di])
      expect(await readyWhere(s, (seats) => !seats.includes(0))).toEqual([]);
    host.send({ t: "ready", on: true });
    expect(await readyWhere(di, (seats) => seats.includes(0))).toEqual([0]);
    await close(five.sockets);
  });

  it("an unready before the others are ready stops the room starting when they are", async () => {
    const five = await startedFive(baseUrl);
    const [host, bo, cy] = five.sockets as [Socket, Socket, Socket, Socket, Socket];
    host.send({ t: "ready" });
    host.send({ t: "ready", on: false });
    bo.send({ t: "ready" });
    cy.send({ t: "ready" });
    await noTick(host);
    host.send({ t: "ready" });
    await nextTick(host, 3000);
    await close(five.sockets);
  });

  it("unready is ignored once the room is running, and never unreadies a bot", async () => {
    const five = await startedFive(baseUrl);
    const [host, bo, cy] = five.sockets as [Socket, Socket, Socket, Socket, Socket];
    for (const s of [host, bo, cy]) s.send({ t: "ready" });
    await nextTick(host, 3000);
    host.send({ t: "ready", on: false });
    await nextTick(host, 3000); // still ticking: the room did not go back to waiting
    await close(five.sockets);

    const [solo] = [await connect(baseUrl)];
    solo.send({ t: "lobby.create", nickname: "Ana" });
    await solo.next("lobby");
    solo.send({ t: "lobby.start" });
    expect(await readyWhere(solo, () => true)).toEqual([1, 2]);
    solo.send({ t: "ready", on: false });
    await expect(readyWhere(solo, (seats) => seats.length === 1, 800)).rejects.toThrow();
    await solo.close();
  });
});

describe("the reveal's sights and sounds", () => {
  it("sends each seat one view of the room before the game ticks: the map for the sighted, nothing for Can't see", async () => {
    const five = await startedFive(baseUrl);
    const views: RoleView[] = [];
    for (const s of five.sockets.slice(0, 3)) {
      views.push((await s.next<{ t: "view"; view: RoleView }>("view", 3000)).view);
    }
    for (const [i, view] of views.entries()) {
      expect(view.tick).toBe(0);
      if (five.reveals[i]?.role === "blind") {
        expect(view.tiles).toBeUndefined();
        expect(JSON.stringify(view)).not.toContain("#");
      } else {
        expect(view.full).toBe(true);
        expect(view.tiles?.length).toBeGreaterThan(0);
      }
    }
    // and nothing ticks until all three are ready
    await expect(five.sockets[0]?.next("view", 600)).rejects.toThrow(/no "view"/);
    await close(five.sockets);
  });

  it("gives only Can't see the sounds of this room to learn", async () => {
    const five = await startedFive(baseUrl);
    for (const [i, reveal] of (five.reveals as unknown as CuesReveal[]).entries()) {
      if (i > 2) continue;
      if (reveal.role === "blind") expect(reveal.cues).toEqual(["hum", "door"]);
      else expect(reveal.cues).toEqual([]);
    }
    await close(five.sockets);
    void ({} as Player);
  });
});

describe("a watcher at the reveal", () => {
  it("is sent a view of the seat it follows at once, and of the whole room when it stops following", async () => {
    const five = await startedFive(baseUrl);
    const di = five.sockets[3] as Socket;
    di.send({ t: "spectate", seat: 2 });
    const followed = await viewWhere(di, (v) => v.you.seat === 2 && v.you.pos !== undefined);
    expect(followed.tick).toBe(0); // the room has not started: this is not a tick
    di.send({ t: "spectate", seat: null });
    const whole = await viewWhere(di, (v) => v.you.pos === undefined);
    expect(whole.tiles).toBeDefined(); // and the map comes with it
    await close(five.sockets);
  });
});

async function viewWhere(
  s: Socket,
  ok: (v: RoleView) => boolean,
  timeoutMs = 3000,
): Promise<RoleView> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const m = await s.next<{ view: RoleView }>("view", Math.max(1, deadline - Date.now()));
    if (ok(m.view)) return m.view;
  }
}

describe("a watcher who joins during the reveal", () => {
  it("is sent a view of the room at once, with its map, so its screen is not black", async () => {
    const five = await startedFive(baseUrl);
    const res = await fetch(new URL("/", baseUrl));
    const cookie = res.headers.getSetCookie()[0]?.split(";")[0] ?? "";
    const wes = await connect(baseUrl, cookie);
    wes.send({ t: "lobby.join", code: five.code, nickname: "Wes", as: "spectator" });
    const view = await viewWhere(wes, () => true);
    expect(view.tiles).toBeDefined();
    expect(view.tick).toBe(0);
    await close([...five.sockets, wes]);
  });

  it("can be swapped into a seat by the host: they become a player with that seat's role", async () => {
    const five = await startedFive(baseUrl);
    const res = await fetch(new URL("/", baseUrl));
    const cookie = res.headers.getSetCookie()[0]?.split(";")[0] ?? "";
    const wes = await connect(baseUrl, cookie);
    wes.send({ t: "lobby.join", code: five.code, nickname: "Wes", as: "spectator" });
    await wes.next("lobby");
    const host = five.sockets[0] as Socket;
    host.send({ t: "crew.swap", a: 1, b: -4 }); // Bo, and the first spectator
    type R = { role: string; crew: { nickname: string }[] };
    let reveal = await wes.next<R>("reveal", 3000); // the one the join itself sent comes first
    while (!reveal.crew.some((c) => c.nickname === "Wes"))
      reveal = await wes.next<R>("reveal", 3000);
    expect(reveal.crew.map((c) => c.nickname)).toEqual(["Ana", "Wes", "Cy"]);
    await close([...five.sockets, wes]);
  });
});

describe("a watcher and the people sitting out", () => {
  const watcher = async (code: string, name: string) => {
    const res = await fetch(new URL("/", baseUrl));
    const cookie = res.headers.getSetCookie()[0]?.split(";")[0] ?? "";
    const wes = await connect(baseUrl, cookie);
    wes.send({ t: "lobby.join", code, nickname: name, as: "spectator" });
    await wes.next("lobby");
    return wes;
  };
  type L = { lobby: { people: unknown[]; spectators: unknown[] } };
  const latestLobby = async (s: Socket): Promise<L> => {
    let last = await s.next<L>("lobby", 3000);
    for (;;) {
      try {
        last = await s.next<L>("lobby", 500);
      } catch {
        return last;
      }
    }
  };

  it("swapping a watcher with someone who is also not playing changes nothing: no seat to give", async () => {
    const five = await startedFive(baseUrl);
    const wes = await watcher(five.code, "Wes");
    const host = five.sockets[0] as Socket;
    await latestLobby(host);
    host.send({ t: "crew.swap", a: -4, b: 3 }); // Wes, and Di who sits out
    // nothing changes, so nothing new is sent: the next lobby the host hears about is the one it asks for
    await new Promise((r) => setTimeout(r, 600));
    host.send({ t: "lobby.private", on: false });
    const after = await latestLobby(host);
    expect(after.lobby.spectators).toHaveLength(1); // Wes is still a watcher, not a player with no seat
    expect(after.lobby.people).toHaveLength(5);
    await close([...five.sockets, wes]);
  });

  it("a person who sits the room out and leaves is gone from everyone's crew list", async () => {
    const five = await startedFive(baseUrl);
    const [host, , , di] = five.sockets as Socket[];
    (di as Socket).send({ t: "lobby.leave" });
    type R = { sittingOut: string[] };
    let reveal = await (host as Socket).next<R>("reveal", 3000);
    const deadline = Date.now() + 3000;
    while (reveal.sittingOut.includes("Di") && Date.now() < deadline)
      reveal = await (host as Socket).next<R>("reveal", 1000).catch(() => reveal);
    expect(reveal.sittingOut).toEqual(["Ed"]);
    await close(five.sockets);
  });
});

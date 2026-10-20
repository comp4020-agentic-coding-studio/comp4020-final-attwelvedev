import { describe, expect, inject, it } from "vitest";
import type { RoleView } from "../src/game/perception.ts";
import {
  byRole,
  closeAll,
  nextTick,
  nextView,
  noTick,
  type Player,
  type RevealMsg,
  ready,
  startedFive,
  startedGame,
} from "./play.ts";
import { connect, type Socket } from "./ws.ts";

const baseUrl = inject("baseUrl");

interface LobbyMsg {
  lobby: {
    phase: string;
    seats: { bot: boolean; who: string | null }[];
    people: { who: string }[];
  };
  you: { seat: number | null; host: boolean };
}

// A person who presses Leave in the middle of a game must not leave their seat empty:
// a bot takes it at once, and the game goes on.
describe("a person leaves a running game", () => {
  it("a bot takes their seat and walks it: a non-host leaving", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const [host, , mute] = players as [Player, Player, Player];
    const deaf = byRole(players, "deaf");
    const at = (view: RoleView) =>
      view.entities.find((e) => e.kind === "player" && e.seat === 2)?.pos;
    const start = at(await nextView(deaf, 3000));
    expect(start).toBeDefined();

    mute.socket.send({ t: "lobby.leave" });
    // the crew is sent again with a bot in the mute's seat
    let reveal = await deaf.socket.next<RevealMsg>("reveal", 4000);
    while (!reveal.crew.some((c) => c.seat === 2 && c.bot)) {
      reveal = await deaf.socket.next<RevealMsg>("reveal", 4000);
    }
    // and it plays: in room 1 the Can't-speak bot goes to push the crate
    const until = Date.now() + 6000;
    let moved = false;
    while (!moved && Date.now() < until) {
      const view = await nextView(deaf, 1000).catch(() => null);
      const now = view ? at(view) : undefined;
      moved = now !== undefined && start !== undefined && (now.x !== start.x || now.y !== start.y);
    }
    expect(moved).toBe(true);
    await closeAll([host, deaf]);
  });

  it("the host leaving hands the host role on and puts a bot in their seat", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const [host, guest] = players as [Player, Player, Player];
    await nextView(guest, 3000);
    host.socket.send({ t: "lobby.leave" });
    let lobby = await guest.socket.next<LobbyMsg>("lobby", 4000);
    while (!lobby.lobby.seats[0]?.bot) lobby = await guest.socket.next<LobbyMsg>("lobby", 4000);
    expect(lobby.lobby.phase).toBe("playing");
    expect(lobby.lobby.seats[0]?.who).toBeNull();
    // someone is host now, and the game has not stopped
    let latest = lobby;
    while (!latest.you.host && players.length) {
      latest = await guest.socket.next<LobbyMsg>("lobby", 3000).catch(() => latest);
      if (latest === lobby) break;
    }
    expect((await nextView(guest, 3000)).tick).toBeGreaterThan(0);
    await closeAll(players.slice(1));
  });

  it("gives the seat back, and the bot steps aside, when the same person joins the lobby again", async () => {
    const { players, code } = await startedGame(baseUrl);
    ready(players);
    const [host, guest, third] = players as [Player, Player, Player];
    await nextView(host, 3000);
    third.socket.send({ t: "lobby.leave" });
    let lobby = await host.socket.next<LobbyMsg>("lobby", 4000);
    while (!lobby.lobby.seats[2]?.bot) lobby = await host.socket.next<LobbyMsg>("lobby", 4000);
    await third.socket.unload();

    // the same device, with the lobby's code, takes the seat back
    const back = await connect(baseUrl, third.cookie);
    back.send({ t: "lobby.join", code, nickname: "Cy", as: "player" });
    const mine = await back.next<LobbyMsg>("lobby", 4000);
    expect(mine.you.seat).toBe(2);
    expect(mine.lobby.seats[2]?.bot).toBe(false);
    // told their role again, and the game is running for them
    expect((await back.next<{ role: string }>("reveal", 4000)).role).toBe(third.role);
    expect((await nextView({ ...third, socket: back }, 4000)).tick).toBeGreaterThan(0);
    // and the others see the bot go
    let after = await host.socket.next<LobbyMsg>("lobby", 4000);
    while (after.lobby.seats[2]?.bot) after = await host.socket.next<LobbyMsg>("lobby", 4000);
    expect(after.lobby.seats[2]?.who).not.toBeNull();
    await closeAll([host, guest]);
    await back.close();
  });

  it("does not give a seat a bot is playing to someone who was never in it", async () => {
    const { players, code } = await startedGame(baseUrl);
    ready(players);
    const [host, guest, third] = players as [Player, Player, Player];
    third.socket.send({ t: "lobby.leave" });
    await host.socket.next("lobby", 4000);
    const stranger = await connect(baseUrl);
    stranger.send({ t: "lobby.join", code, nickname: "Zed", as: "player" });
    expect((await stranger.next<{ code: string }>("error", 4000)).code).toBe("lobby-full");
    await stranger.close();
    await closeAll([host, guest, third]);
  });

  it("a host who comes back has their seat, but the host role stays with whoever has it now", async () => {
    const { players, code } = await startedGame(baseUrl);
    ready(players);
    const [host, guest, third] = players as [Player, Player, Player];
    await nextView(guest, 3000);
    host.socket.send({ t: "lobby.leave" });
    let handed = await guest.socket.next<LobbyMsg>("lobby", 4000);
    while (!handed.you.host) handed = await guest.socket.next<LobbyMsg>("lobby", 4000);
    await host.socket.unload();

    const back = await connect(baseUrl, host.cookie);
    back.send({ t: "lobby.join", code, nickname: "Ana", as: "player" });
    const mine = await back.next<LobbyMsg>("lobby", 4000);
    expect(mine.you.seat).toBe(0);
    expect(mine.you.host).toBe(false);
    await closeAll([guest, third]);
    await back.close();
  });

  // Going back to the landing page is leaving: the new page opens a socket of its own with the
  // same cookie, which must not count as the person still being in the game.
  it("a person who goes to the landing page has left: a bot takes their seat", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const [host, guest, third] = players as [Player, Player, Player];
    await nextView(host, 3000);
    await third.socket.unload(); // the game page unloads
    const home = await connect(baseUrl, third.cookie); // and the landing page opens its socket
    home.send({ t: "lobbies.watch" });
    let lobby = await host.socket.next<LobbyMsg>("lobby", 5000);
    while (!lobby.lobby.seats[2]?.bot) lobby = await host.socket.next<LobbyMsg>("lobby", 5000);
    expect(lobby.lobby.seats[2]?.who).toBeNull();
    await closeAll([host, guest]);
    await home.close();
  });

  it("a person with the game open in another tab has not left by opening the landing page", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const [host, guest, third] = players as [Player, Player, Player];
    await nextView(host, 3000);
    const home = await connect(baseUrl, third.cookie);
    home.send({ t: "lobbies.watch" });
    let bot = false;
    const until = Date.now() + 1500;
    while (Date.now() < until) {
      const lobby = await host.socket.next<LobbyMsg>("lobby", 300).catch(() => null);
      if (lobby?.lobby.seats.some((s) => s.bot)) bot = true;
    }
    expect(bot).toBe(false);
    await closeAll([host, guest, third]);
    await home.close();
  });

  it("starting a new lobby from the landing page leaves the game too", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const [host, guest, third] = players as [Player, Player, Player];
    await nextView(host, 3000);
    await third.socket.unload();
    const home = await connect(baseUrl, third.cookie);
    home.send({ t: "lobby.create", nickname: "Cy" });
    let lobby = await host.socket.next<LobbyMsg>("lobby", 5000);
    while (!lobby.lobby.seats[2]?.bot) lobby = await host.socket.next<LobbyMsg>("lobby", 5000);
    expect(lobby.lobby.phase).toBe("playing");
    await closeAll([host, guest]);
    await home.close();
  });

  // The About and Credits pages open no socket at all, so the server sees only a request for a
  // page with the device's cookie. Reading one in the same tab is leaving; in another tab it is not.
  it("a person who goes to another page of the site has left", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const [host, guest, third] = players as [Player, Player, Player];
    await nextView(host, 3000);
    await fetch(new URL("/readme/", baseUrl), {
      headers: { cookie: third.cookie, accept: "text/html" },
    });
    await third.socket.unload(); // the game page unloads as the new one arrives
    let lobby = await host.socket.next<LobbyMsg>("lobby", 6000);
    while (!lobby.lobby.seats[2]?.bot) lobby = await host.socket.next<LobbyMsg>("lobby", 6000);
    expect(lobby.lobby.seats[2]?.who).toBeNull();
    await closeAll([host, guest]);
  });

  it("a person who opens another page in a second tab has not left", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const [host, guest, third] = players as [Player, Player, Player];
    await nextView(host, 3000);
    await fetch(new URL("/credits/", baseUrl), {
      headers: { cookie: third.cookie, accept: "text/html" },
    }); // the game page stays open
    let bot = false;
    const until = Date.now() + 3000;
    while (Date.now() < until) {
      const lobby = await host.socket.next<LobbyMsg>("lobby", 300).catch(() => null);
      if (lobby?.lobby.seats.some((s) => s.bot)) bot = true;
    }
    expect(bot).toBe(false);
    await closeAll([host, guest, third]);
  });

  // Joining another lobby, whether or not it exists, is leaving this one.
  it("asking to join a lobby that does not exist leaves the game, and says so", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const [host, guest, third] = players as [Player, Player, Player];
    await nextView(host, 3000);
    third.socket.send({ t: "lobby.join", code: "ZZZY", nickname: "Cy", as: "player" });
    expect((await third.socket.next<{ code: string }>("error", 4000)).code).toBe("lobby-not-found");
    let lobby = await host.socket.next<LobbyMsg>("lobby", 5000);
    while (!lobby.lobby.seats[2]?.bot) lobby = await host.socket.next<LobbyMsg>("lobby", 5000);
    await closeAll([host, guest, third]);
  });

  it("asking to join a lobby that does not exist leaves a lobby that has not started too", async () => {
    const host = await connect(baseUrl);
    host.send({ t: "lobby.create", nickname: "Ana" });
    const { lobby } = await host.next<{ lobby: { code: string } }>("lobby");
    const guest = await connect(baseUrl);
    guest.send({ t: "lobby.join", code: lobby.code, nickname: "Bo", as: "player" });
    await guest.next("lobby");
    let seen = await host.next<LobbyMsg>("lobby", 3000);
    while (seen.lobby.people.length < 2) seen = await host.next<LobbyMsg>("lobby", 3000);
    guest.send({ t: "lobby.join", code: "ZZZY", nickname: "Bo", as: "player" });
    await guest.next("error", 3000);
    let after = await host.next<LobbyMsg>("lobby", 4000);
    while (after.lobby.people.length > 1) after = await host.next<LobbyMsg>("lobby", 4000);
    expect(after.lobby.people).toHaveLength(1);
    await host.close();
    await guest.close();
  });

  // The others should not see "connection dropped" for someone who simply went to another page:
  // the page request tells the server it is not a drop.
  it("going to another page shows no pause to the others, only the leaving", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const [host, guest, third] = players as [Player, Player, Player];
    await nextView(host, 3000);
    await fetch(new URL("/readme/", baseUrl), {
      headers: { cookie: third.cookie, accept: "text/html" },
    });
    await third.socket.unload(); // the game page closes its socket as it unloads
    let lobby = await host.socket.next<LobbyMsg>("lobby", 3000);
    while (!lobby.lobby.seats[2]?.bot) lobby = await host.socket.next<LobbyMsg>("lobby", 3000);
    await expect(host.socket.next("pause", 700)).rejects.toThrow();
    await closeAll([host, guest]);
  });

  it("opening another lobby's page is the same: no pause, a bot takes the seat", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const [host, guest, third] = players as [Player, Player, Player];
    await nextView(host, 3000);
    await fetch(new URL("/lobby/ZZZX", baseUrl), {
      headers: { cookie: third.cookie, accept: "text/html" },
    });
    await third.socket.unload();
    let lobby = await host.socket.next<LobbyMsg>("lobby", 3000);
    while (!lobby.lobby.seats[2]?.bot) lobby = await host.socket.next<LobbyMsg>("lobby", 3000);
    await expect(host.socket.next("pause", 700)).rejects.toThrow();
    await closeAll([host, guest]);
  });

  it("reloading the game's own page is still a pause, not a leaving", async () => {
    const { players, code } = await startedGame(baseUrl);
    ready(players);
    const [host, guest, third] = players as [Player, Player, Player];
    await nextView(host, 3000);
    await fetch(new URL(`/lobby/${code}`, baseUrl), {
      headers: { cookie: third.cookie, accept: "text/html" },
    });
    await third.socket.unload();
    expect((await host.socket.next<{ waitingFor: string }>("pause", 3000)).waitingFor).toBe("Cy");
    await closeAll([host, guest, third]);
  });

  // Over a slow connection the landing page's socket opens, and asks to watch the lobby list, before the
  // game page's has finished closing. Leaving must still be noticed once the game's socket goes.
  it("the landing page opening before the game page has closed is still leaving", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const [host, guest, third] = players as [Player, Player, Player];
    await nextView(host, 3000);
    const home = await connect(baseUrl, third.cookie);
    home.send({ t: "lobbies.watch" });
    await home.next("lobbies", 3000);
    // the game page is still open, so nothing has happened yet (older frames are drained first)...
    while (
      await host.socket.next("lobby", 300).then(
        () => true,
        () => false,
      )
    );
    await expect(host.socket.next("lobby", 800)).rejects.toThrow();
    // ...and then it closes
    await third.socket.unload();
    let lobby = await host.socket.next<LobbyMsg>("lobby", 5000);
    while (!lobby.lobby.seats[2]?.bot) lobby = await host.socket.next<LobbyMsg>("lobby", 5000);
    await closeAll([host, guest]);
    await home.close();
  });

  // Over a real network a socket can take many seconds to close, so a page says bye first and the
  // server acts on that, not on the close that follows.
  it("a page's bye is a closed connection straight away: the game pauses without waiting for the close", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const [host, guest, third] = players as [Player, Player, Player];
    await nextView(host, 3000);
    third.socket.send({ t: "bye" }); // the socket itself stays open
    expect((await host.socket.next<{ waitingFor: string }>("pause", 2000)).waitingFor).toBe("Cy");
    await closeAll([host, guest, third]);
  });

  it("a bye after a request for another page is a leaving, however slowly the socket then closes", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const [host, guest, third] = players as [Player, Player, Player];
    await nextView(host, 3000);
    await fetch(new URL("/credits/", baseUrl), {
      headers: { cookie: third.cookie, accept: "text/html" },
    });
    third.socket.send({ t: "bye" }); // and the socket is never closed in this test
    let lobby = await host.socket.next<LobbyMsg>("lobby", 3000);
    while (!lobby.lobby.seats[2]?.bot) lobby = await host.socket.next<LobbyMsg>("lobby", 3000);
    await closeAll([host, guest]);
  });
});

// With people sitting out, a person who presses Leave does not get a bot at once: the game pauses and
// the host picks who takes their seat (A1).
describe("a person leaves while others sit out", () => {
  interface PauseMsg {
    t: "pause";
    waitingFor: string;
    left: number;
    choosing: boolean;
    forReady?: boolean;
  }

  it("with nobody sitting out, a leaving person's seat goes to a bot at once (unchanged)", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const [host, guest, third] = players as [Player, Player, Player];
    await nextView(host, 3000);
    third.socket.send({ t: "lobby.leave" });
    let lobby = await host.socket.next<LobbyMsg>("lobby", 4000);
    while (!lobby.lobby.seats[2]?.bot) lobby = await host.socket.next<LobbyMsg>("lobby", 4000);
    await expect(host.socket.next("pause", 700)).rejects.toThrow(/no "pause"/); // no pause, no question
    await closeAll([host, guest]);
  });

  it("with someone sitting out, a leaving person pauses the game and the host is asked at once", async () => {
    const five = await startedFive(baseUrl);
    const [host, bo, , di] = five.sockets as [
      (typeof five.sockets)[number],
      ...typeof five.sockets,
    ];
    host.send({ t: "ready" });
    bo.send({ t: "ready" });
    five.sockets[2]?.send({ t: "ready" });
    await bo.next("view", 3000);
    bo.send({ t: "lobby.leave" });
    const ask = await host.next<PauseMsg>("pause", 3000);
    expect(ask).toMatchObject({ waitingFor: "Bo", choosing: true });
    // the others hear it too, and the game has stopped
    expect(
      (await (five.sockets[2] as (typeof five.sockets)[number]).next<PauseMsg>("pause", 3000))
        .choosing,
    ).toBe(true);
    expect((await di.next<{ t: "lobby" }>("lobby", 3000)).t).toBe("lobby");
    await closeAll(five.sockets.map((socket) => ({ socket }) as Player));
  });

  it("the host pulls in a sitting-out person, who gets the leaver's role and a reveal, and play resumes when they are ready", async () => {
    const five = await startedFive(baseUrl);
    const [host, bo, cy, di, ed] = five.sockets as [
      (typeof five.sockets)[number],
      (typeof five.sockets)[number],
      (typeof five.sockets)[number],
      (typeof five.sockets)[number],
      (typeof five.sockets)[number],
    ];
    for (const s of [host, bo, cy]) s.send({ t: "ready" });
    await nextTick(host, 3000);
    const boRole = five.reveals[1]?.role;
    bo.send({ t: "lobby.leave" });
    await host.next<PauseMsg>("pause", 3000);

    host.send({ t: "host.choice", choice: "pull", person: 2 }); // Bo left, so Cy is person 1 and Di person 2
    const reveal = await di.next<RevealMsg>("reveal", 3000);
    expect(reveal.role).toBe(boRole);
    expect(reveal.crew.map((c) => c.nickname)).toEqual(["Ana", "Di", "Cy"]);
    expect(reveal.sittingOut).toEqual(["Ed"]);

    // the others are told to wait for them: the game is held until Di is ready
    const hold = await host.next<PauseMsg>("pause", 3000);
    expect(hold).toMatchObject({ waitingFor: "Di", choosing: false, forReady: true });
    await noTick(host, 700);

    di.send({ t: "ready" });
    expect((await host.next<{ t: "resume" }>("resume", 3000)).t).toBe("resume");
    await nextTick(host, 3000); // and it ticks again
    await nextTick(ed, 3000); // the one still sitting out is still watching
    await closeAll(five.sockets.map((socket) => ({ socket }) as Player));
    void cy;
  });

  it("only the host chooses, and only someone who is sitting out can be pulled in", async () => {
    const five = await startedFive(baseUrl);
    const [host, bo, cy, di] = five.sockets as [
      (typeof five.sockets)[number],
      (typeof five.sockets)[number],
      (typeof five.sockets)[number],
      (typeof five.sockets)[number],
    ];
    for (const s of [host, bo, cy]) s.send({ t: "ready" });
    await host.next("view", 3000);
    bo.send({ t: "lobby.leave" });
    await host.next<PauseMsg>("pause", 3000);
    cy.send({ t: "host.choice", choice: "pull", person: 2 });
    expect((await cy.next<{ code: string }>("error", 3000)).code).toBe("not-host");
    host.send({ t: "host.choice", choice: "pull", person: 0 }); // Ana is playing
    await expect(di.next("reveal", 700)).rejects.toThrow(/no "reveal"/);
    host.send({ t: "host.choice", choice: "bot" }); // a bot is still a choice
    let lobby = await host.next<LobbyMsg>("lobby", 3000);
    while (!lobby.lobby.seats.some((x) => x.bot)) lobby = await host.next<LobbyMsg>("lobby", 3000);
    await closeAll(five.sockets.map((socket) => ({ socket }) as Player));
  });
});

// During the reveal, everyone is told who leaves, and when every player has gone the person who is
// host by then (someone sitting out, watching) is asked what takes the empty seats.
describe("players leave during the reveal", () => {
  interface PauseMsg {
    t: "pause";
    waitingFor: string;
    choosing: boolean;
  }
  interface GoneMsg {
    t: "gone";
    nickname: string;
    how: "bot" | "seat" | "out";
  }
  interface HostLobby {
    lobby: { phase: string; host: string };
    you: { host: boolean };
  }

  it("tells everyone who left and what happened to their seat", async () => {
    const five = await startedFive(baseUrl);
    const [, bo, , di] = five.sockets as [Socket, Socket, Socket, Socket, Socket];
    bo.send({ t: "lobby.leave" });
    expect(await di.next<GoneMsg>("gone", 3000)).toEqual({
      t: "gone",
      nickname: "Bo",
      how: "seat", // two are sitting out, so the host chooses
    });
    await closeAll(five.sockets.map((socket) => ({ socket }) as Player));
  });

  it("a bot taking the seat is said too, with nobody sitting out", async () => {
    const { players } = await startedGame(baseUrl);
    const [host, , third] = players as [Player, Player, Player];
    third.socket.send({ t: "lobby.leave" });
    expect(await host.socket.next<GoneMsg>("gone", 3000)).toMatchObject({
      nickname: "Cy",
      how: "bot",
    });
    await closeAll([host]);
  });

  it("when every player leaves, the next host (sitting out) is asked what takes the seats, and can go back to the lobby", async () => {
    const five = await startedFive(baseUrl);
    const [ana, bo, cy, di, ed] = five.sockets as [Socket, Socket, Socket, Socket, Socket];
    for (const leaver of [ana, bo, cy]) leaver.send({ t: "lobby.leave" });
    // Di is host now: the choice is theirs, though they only watch
    const ask = await di.next<PauseMsg>("pause", 3000);
    expect(ask.choosing).toBe(true);
    let latest = await di.next<HostLobby>("lobby", 3000);
    while (!latest.you.host) latest = await di.next<HostLobby>("lobby", 3000);
    expect(latest.you.host).toBe(true);
    // someone watching who is not the host is told who left, and has no choice to make
    expect((await ed.next<GoneMsg>("gone", 3000)).how).toBe("seat");

    di.send({ t: "host.choice", choice: "lobby" });
    let after = await ed.next<HostLobby>("lobby", 3000);
    while (after.lobby.phase !== "open") after = await ed.next<HostLobby>("lobby", 3000);
    expect(after.lobby.phase).toBe("open");
    await closeAll(five.sockets.map((socket) => ({ socket }) as Player));
  });

  it("each empty seat is asked about in turn, so the game is never left waiting for a seat nobody can fill", async () => {
    const five = await startedFive(baseUrl);
    const [ana, bo, cy] = five.sockets as [Socket, Socket, Socket, Socket, Socket];
    ana.send({ t: "lobby.leave" });
    bo.send({ t: "lobby.leave" });
    // Cy still plays, and is host once Ana and Bo have gone
    await cy.next<PauseMsg>("pause", 3000);
    let latest = await cy.next<HostLobby>("lobby", 3000);
    while (!latest.you.host) latest = await cy.next<HostLobby>("lobby", 3000);
    cy.send({ t: "host.choice", choice: "bot" });
    // the second empty seat is asked about straight after
    const second = await cy.next<PauseMsg>("pause", 3000);
    expect(second.choosing).toBe(true);
    await closeAll(five.sockets.map((socket) => ({ socket }) as Player));
  });
});

describe("someone who left does not come back to a seat a bot took", () => {
  it("a page of the same device that joins again as a player is not given the bot's seat once it watches", async () => {
    const five = await startedFive(baseUrl);
    const [ana, bo] = five.sockets as [Socket, Socket, Socket, Socket, Socket];
    bo.send({ t: "lobby.leave" });
    await ana.next("pause", 3000);
    const win = await connect(baseUrl, five.cookies[1] as string);
    win.send({ t: "lobby.join", code: five.code, nickname: "Bo", as: "spectator" });
    await win.next("lobby");
    ana.send({ t: "host.choice", choice: "bot" });
    type L = { lobby: { seats: { bot: boolean }[] } };
    let lobby = await ana.next<L>("lobby", 3000);
    while (!lobby.lobby.seats[1]?.bot) lobby = await ana.next<L>("lobby", 3000);
    // the same page asking to join again as a player (what a reload does) must not take the seat back
    win.send({ t: "lobby.join", code: five.code, nickname: "Bo", as: "player" });
    await new Promise((r) => setTimeout(r, 800));
    let latest = lobby;
    for (;;) {
      try {
        latest = await ana.next<L>("lobby", 500);
      } catch {
        break;
      }
    }
    expect(latest.lobby.seats[1]?.bot).toBe(true);
    await closeAll(five.sockets.map((socket) => ({ socket }) as Player));
    await win.close();
  });

  it("a person swapped in from watching no longer has a seat waiting for them to come back", async () => {
    const five = await startedFive(baseUrl);
    const [ana, bo] = five.sockets as [Socket, Socket, Socket, Socket, Socket];
    bo.send({ t: "lobby.leave" });
    await ana.next("pause", 3000);
    ana.send({ t: "host.choice", choice: "bot" });
    const win = await connect(baseUrl, five.cookies[1] as string);
    win.send({ t: "lobby.join", code: five.code, nickname: "Bo", as: "spectator" });
    await win.next("lobby");
    ana.send({ t: "crew.swap", a: -4, b: -2 }); // Bo, swapped into the bot's seat (seat 1)
    type L = { lobby: { seats: { bot: boolean; nickname: string | null }[] } };
    let lobby = await ana.next<L>("lobby", 3000);
    while (lobby.lobby.seats[1]?.nickname !== "Bo") lobby = await ana.next<L>("lobby", 3000);
    expect(lobby.lobby.seats[1]?.nickname).toBe("Bo");
    await closeAll(five.sockets.map((socket) => ({ socket }) as Player));
    await win.close();
  });
});

describe("a seat a bot took from someone whose connection dropped", () => {
  type L = { lobby: { seats: { bot: boolean; nickname: string | null }[]; spectators: unknown[] } };
  const lobbyWhere = async (s: Socket, ok: (l: L) => boolean) => {
    let l = await s.next<L>("lobby", 3000);
    while (!ok(l)) l = await s.next<L>("lobby", 3000);
    return l;
  };

  it("can be swapped with a watcher or a sitting-out person like any bot, and the person who dropped does not return to it", async () => {
    const five = await startedFive(baseUrl);
    const [ana, bo, , di] = five.sockets as [Socket, Socket, Socket, Socket, Socket];
    await bo.drop();
    type P = { choosing: boolean };
    let ask = await ana.next<P>("pause", 8000);
    while (!ask.choosing) ask = await ana.next<P>("pause", 8000);
    ana.send({ t: "host.choice", choice: "bot" });
    await lobbyWhere(ana, (l) => l.lobby.seats[1]?.bot === true);

    const res = await fetch(new URL("/", baseUrl));
    const wes = await connect(baseUrl, res.headers.getSetCookie()[0]?.split(";")[0] ?? "");
    wes.send({ t: "lobby.join", code: five.code, nickname: "Wes", as: "spectator" });
    await wes.next("lobby");
    await lobbyWhere(ana, (l) => l.lobby.spectators.length === 1); // the host sees Wes watching
    ana.send({ t: "crew.swap", a: -4, b: -2 }); // the watcher, and the bot in seat 1
    const swapped = await lobbyWhere(ana, (l) => l.lobby.seats[1]?.nickname === "Wes");
    expect(swapped.lobby.seats[1]?.bot).toBe(false);
    expect(swapped.lobby.spectators).toHaveLength(0);

    ana.send({ t: "crew.swap", a: 3, b: 5 }); // Di (sitting out) and Wes, who is person 5 now
    await lobbyWhere(ana, (l) => l.lobby.seats[1]?.nickname === "Di");
    await closeAll(five.sockets.map((socket) => ({ socket }) as Player));
    await wes.close();
    void di;
  });
});

describe("the host fills an empty seat from the watchers", () => {
  it("pulls a watcher in, who becomes a player with the leaver's role and must press Ready", async () => {
    const five = await startedFive(baseUrl);
    const [ana, bo, cy] = five.sockets as [Socket, Socket, Socket, Socket, Socket];
    for (const s of [ana, bo, cy]) s.send({ t: "ready" });
    await nextTick(ana, 3000);
    const res = await fetch(new URL("/", baseUrl));
    const wes = await connect(baseUrl, res.headers.getSetCookie()[0]?.split(";")[0] ?? "");
    wes.send({ t: "lobby.join", code: five.code, nickname: "Wes", as: "spectator" });
    await wes.next("lobby");
    const boRole = five.reveals[1]?.role;
    bo.send({ t: "lobby.leave" });
    await ana.next("pause", 3000);
    ana.send({ t: "host.choice", choice: "pull", person: -4 }); // the first watcher
    type R = { role: string; crew: { nickname: string }[] };
    let reveal = await wes.next<R>("reveal", 3000);
    while (!reveal.crew.some((c) => c.nickname === "Wes"))
      reveal = await wes.next<R>("reveal", 3000);
    expect(reveal.role).toBe(boRole);
    expect(reveal.crew.map((c) => c.nickname)).toEqual(["Ana", "Wes", "Cy"]);
    wes.send({ t: "ready" });
    expect((await ana.next<{ t: string }>("resume", 3000)).t).toBe("resume");
    await nextTick(ana, 3000);
    await closeAll(five.sockets.map((socket) => ({ socket }) as Player));
    await wes.close();
  });

  it("is refused for a watcher who is not there, or when the lobby is full", async () => {
    const five = await startedFive(baseUrl);
    const [ana, bo, cy] = five.sockets as [Socket, Socket, Socket, Socket, Socket];
    for (const s of [ana, bo, cy]) s.send({ t: "ready" });
    await nextTick(ana, 3000);
    bo.send({ t: "lobby.leave" });
    await ana.next("pause", 3000);
    // drain what Bo leaving sent (the crew, again, with a gap in it), so only a reaction is read below
    for (;;) {
      try {
        await ana.next("reveal", 400);
      } catch {
        break;
      }
    }
    ana.send({ t: "host.choice", choice: "pull", person: -4 }); // nobody is watching
    await expect(ana.next("reveal", 700)).rejects.toThrow(/no "reveal"/);
    await closeAll(five.sockets.map((socket) => ({ socket }) as Player));
  });
});

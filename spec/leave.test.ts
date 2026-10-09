import { describe, expect, inject, it } from "vitest";
import type { RoleView } from "../src/game/perception.ts";
import { byRole, closeAll, nextView, type Player, ready, startedGame } from "./play.ts";
import { connect } from "./ws.ts";

const baseUrl = inject("baseUrl");

interface RevealMsg {
  crew: { seat: number; bot: boolean }[];
}
interface LobbyMsg {
  lobby: { phase: string; seats: { bot: boolean; who: string | null }[] };
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
    await third.socket.drop();

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
    await host.socket.drop();

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
    await third.socket.drop(); // the game page unloads
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
    await third.socket.drop();
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
    await third.socket.drop(); // the game page unloads as the new one arrives
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
});

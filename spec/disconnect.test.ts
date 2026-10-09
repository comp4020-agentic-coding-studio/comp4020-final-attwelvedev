import { describe, expect, inject, it } from "vitest";
import { byRole, closeAll, nextView, type Player, ready, startedGame } from "./play.ts";
import { connect } from "./ws.ts";

const baseUrl = inject("baseUrl");

interface PauseMsg {
  t: "pause";
  waitingFor: string;
  deadline: number;
  left: number;
  choosing: boolean;
}
interface LobbyMsg {
  lobby: { phase: string; host: string; seats: { bot: boolean; nickname: string | null }[] };
  you: { seat: number | null; host: boolean };
}

// The pause is 45 s, so the cases that wait it out need a server started with
// PAUSE_MS=3000 (`PAUSE_MS=3000 pnpm start`). Against a server on the full 45 s they skip.
const SHORT_S = 10;
const isShort = (pause: PauseMsg) => pause.deadline - Date.now() <= SHORT_S * 1000;

async function pausedGame() {
  const { players, code } = await startedGame(baseUrl);
  ready(players);
  await nextView(players[0] as Player); // the game is running
  const [host, guest, third] = players as [Player, Player, Player];
  await third.socket.drop();
  const pause = await host.socket.next<PauseMsg>("pause");
  return { players, host, guest, third, pause, code };
}

describe("a dropped connection pauses the game", () => {
  it("tells the others who the game is waiting for, with a deadline", async () => {
    const { players, host, guest, pause } = await pausedGame();
    expect(pause.waitingFor).toBe("Cy");
    expect(pause.choosing).toBe(false);
    expect(pause.left).toBeGreaterThan(0);
    expect(pause.deadline).toBeGreaterThan(Date.now());
    expect((await guest.socket.next<PauseMsg>("pause")).waitingFor).toBe("Cy");
    // and the game has stopped: no more views reach anyone
    await expect(async () => {
      for (let i = 0; i < 6; i++) await nextView(host, 300);
    }).rejects.toThrow();
    await closeAll([host, guest, players[2] as Player]);
  });

  it("resumes when the same device comes back, and the game ticks again", async () => {
    const { players, host, third } = await pausedGame();
    const back = await connect(baseUrl, third.cookie);
    const resume = await host.socket.next<{ t: "resume"; back: string | null }>("resume");
    expect(resume.back).toBe("Cy");
    // the returning player is told their role again and gets views once more
    expect((await back.next<{ role: string }>("reveal")).role).toBe(third.role);
    const view = await nextView(host, 2000);
    expect(view.tick).toBeGreaterThan(0);
    await closeAll(players.slice(0, 2));
    await back.close();
  });

  it("keeps waiting for a person who is not back, until the host is asked to choose", async (ctx) => {
    const { players, host, pause } = await pausedGame();
    if (!isShort(pause)) {
      await closeAll(players);
      return ctx.skip(
        `the pause is ${Math.round(pause.left / 1000)} s: start the server with PAUSE_MS=3000`,
      );
    }
    const choose = await host.socket.next<PauseMsg>("pause", 8000);
    expect(choose.choosing).toBe(true);
    expect(choose.waitingFor).toBe("Cy");
    await closeAll(players);
  });

  it("lets a bot take the seat when the host says so, and plays on", async (ctx) => {
    const { players, host, guest, pause } = await pausedGame();
    if (!isShort(pause)) {
      await closeAll(players);
      return ctx.skip(
        `the pause is ${Math.round(pause.left / 1000)} s: start the server with PAUSE_MS=3000`,
      );
    }
    await host.socket.next<PauseMsg>("pause", 8000); // the one that asks the host
    host.socket.send({ t: "host.choice", choice: "bot" });
    const resume = await guest.socket.next<{ t: "resume"; back: string | null }>("resume", 4000);
    expect(resume.back).toBeNull();
    // earlier lobby frames (the drop itself) may still be queued: read up to the takeover
    let lobby = await host.socket.next<LobbyMsg>("lobby");
    while (!lobby.lobby.seats.some((s) => s.bot)) lobby = await host.socket.next<LobbyMsg>("lobby");
    expect(lobby.lobby.seats.filter((s) => s.bot)).toHaveLength(1);
    expect(lobby.lobby.phase).toBe("playing");
    expect((await nextView(guest, 2000)).tick).toBeGreaterThan(0);
    // the crew is sent again, with the bot where the person was
    let reveal = await host.socket.next<{ crew: { bot: boolean }[] }>("reveal");
    while (!reveal.crew.some((c) => c.bot)) {
      reveal = await host.socket.next<{ crew: { bot: boolean }[] }>("reveal");
    }
    expect(reveal.crew.filter((c) => c.bot)).toHaveLength(1);
    await closeAll(players);
  });

  it("takes everyone back to an open lobby when the host says so", async (ctx) => {
    const { players, host, guest, pause } = await pausedGame();
    if (!isShort(pause)) {
      await closeAll(players);
      return ctx.skip(
        `the pause is ${Math.round(pause.left / 1000)} s: start the server with PAUSE_MS=3000`,
      );
    }
    await host.socket.next<PauseMsg>("pause", 8000);
    host.socket.send({ t: "host.choice", choice: "lobby" });
    for (const p of [host, guest]) {
      let lobby = await p.socket.next<LobbyMsg>("lobby", 4000);
      while (lobby.lobby.phase !== "open") lobby = await p.socket.next<LobbyMsg>("lobby", 4000);
      expect(lobby.lobby.phase).toBe("open");
    }
    await closeAll(players);
  });

  it("asks the next person to choose when the host is the one missing", async (ctx) => {
    const { players, code } = await startedGame(baseUrl);
    ready(players);
    const [host, guest] = players as [Player, Player];
    await nextView(guest);
    await host.socket.drop();
    const pause = await guest.socket.next<PauseMsg>("pause");
    if (!isShort(pause)) {
      await closeAll(players);
      return ctx.skip(
        `the pause is ${Math.round(pause.left / 1000)} s: start the server with PAUSE_MS=3000`,
      );
    }
    expect(pause.waitingFor).toBe("Ana");
    const choose = await guest.socket.next<PauseMsg>("pause", 8000);
    expect(choose.choosing).toBe(true);
    // the guest is told they are host now, and may choose
    let lobby = await guest.socket.next<LobbyMsg>("lobby", 4000);
    while (!lobby.you.host) lobby = await guest.socket.next<LobbyMsg>("lobby", 4000);
    expect(lobby.you.host).toBe(true);
    guest.socket.send({ t: "host.choice", choice: "bot" });
    expect((await guest.socket.next<{ back: string | null }>("resume", 4000)).back).toBeNull();
    void code;
    void byRole;
    await closeAll(players);
  });

  it("does not let anyone but the host choose", async (ctx) => {
    const { players, host, guest, pause } = await pausedGame();
    if (!isShort(pause)) {
      await closeAll(players);
      return ctx.skip(
        `the pause is ${Math.round(pause.left / 1000)} s: start the server with PAUSE_MS=3000`,
      );
    }
    await host.socket.next<PauseMsg>("pause", 8000);
    guest.socket.send({ t: "host.choice", choice: "bot" });
    expect((await guest.socket.next<{ code: string }>("error", 2000)).code).toBe("not-host");
    await closeAll(players);
  });
});

import { describe, expect, inject, it } from "vitest";
import type { RoleView } from "../src/game/perception.ts";
import { byRole, closeAll, nextView, type Player, ready } from "./play.ts";
import { connect } from "./ws.ts";

const baseUrl = inject("baseUrl");

interface RevealMsg {
  role: "blind" | "deaf" | "mute";
  crew: { seat: number; nickname: string; bot: boolean }[];
}
interface MsgMsg {
  t: "msg";
  family: string;
  kind?: string;
  callout?: string;
  from: { role: string; nickname: string };
}

describe("bots fill the empty seats", () => {
  it("lets one person start alone: the crew has two bots", async () => {
    const host = await connect(baseUrl);
    host.send({ t: "lobby.create", nickname: "Ana" });
    await host.next("lobby");
    host.send({ t: "lobby.start" });
    const reveal = await host.next<RevealMsg>("reveal");
    expect(reveal.crew.filter((c) => c.bot)).toHaveLength(2);
    expect(reveal.crew.filter((c) => !c.bot)).toHaveLength(1);
    expect(reveal.crew.filter((c) => c.bot).map((c) => c.nickname)).toEqual([
      "Bot square",
      "Bot triangle",
    ]);
    await host.close();
  });

  it("steers a Can't-see human with callouts from the Can't-hear bot within 5 s", async () => {
    const host = await connect(baseUrl);
    host.send({ t: "lobby.create", nickname: "Ana" });
    await host.next("lobby");
    host.send({ t: "lobby.start" });
    const reveal = await host.next<RevealMsg>("reveal");
    expect(reveal.role).toBe("blind"); // seat 0 is Can't see in room 1
    host.send({ t: "ready" });
    const msg = await host.next<MsgMsg>("msg", 5000);
    expect(msg).toMatchObject({ family: "say" });
    expect(msg.from).toMatchObject({ role: "deaf", nickname: "Bot square" });
    await host.close();
  });

  it("moves a bot's avatar in a person's view within 5 s of Ready", async () => {
    // two people and one bot: the guest is Can't hear, so sees the bots' avatars
    const [host, guest] = await Promise.all([connect(baseUrl), connect(baseUrl)]);
    host.send({ t: "lobby.create", nickname: "Ana" });
    const { lobby } = await host.next<{ lobby: { code: string } }>("lobby");
    guest.send({ t: "lobby.join", code: lobby.code, nickname: "Bo", as: "player" });
    await guest.next("lobby");
    host.send({ t: "lobby.start" });
    const reveals = await Promise.all([
      host.next<RevealMsg>("reveal"),
      guest.next<RevealMsg>("reveal"),
    ]);
    expect(reveals[1].crew.filter((c) => c.bot)).toHaveLength(1);
    const players: Player[] = [
      { socket: host, cookie: "", seat: 0, role: reveals[0].role },
      { socket: guest, cookie: "", seat: 1, role: reveals[1].role },
    ];
    ready(players);
    const deaf = byRole(players, "deaf");
    const start = await nextView(deaf, 5000);
    const at = (view: RoleView) =>
      view.entities.find((e) => e.kind === "player" && e.seat === 2)?.pos;
    const before = at(start);
    expect(before).toBeDefined();
    const until = Date.now() + 5000;
    let moved = false;
    while (!moved && Date.now() < until) {
      const view = await nextView(deaf, 1000).catch(() => null);
      const now = view ? at(view) : undefined;
      moved =
        now !== undefined && before !== undefined && (now.x !== before.x || now.y !== before.y);
    }
    expect(moved).toBe(true);
    await closeAll(players);
  });
});

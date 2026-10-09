import { describe, expect, inject, it } from "vitest";
import { clearRoomOne } from "./heistPlay.ts";
import { closeAll, nextView, type Player, ready, startedGame } from "./play.ts";

const baseUrl = inject("baseUrl");

interface CaughtMsg {
  t: "caught";
  hazard: "guard" | "camera" | "laser";
  seat: number;
  checkpoint: number;
}

// When the team is caught, everyone is told what caught whom and where they restart:
// in the dark nobody can see for themselves, and Can't see never could.
describe("being caught", () => {
  it("tells all three players what got whom, and the checkpoint they go back to", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    await clearRoomOne(players);
    for (const p of players.slice(1)) await p.socket.next("cleared");
    (players[0] as Player).socket.send({ t: "next" });
    for (const p of players) await p.socket.next("reveal", 3000);
    ready(players);
    await nextView(players[0] as Player, 3000);

    // all three run east at once, into the first camera's cone while it watches
    for (const p of players)
      p.socket.send({ t: "input", seq: 1, move: { x: 1, y: 0 }, act: false });
    const told = await Promise.all(players.map((p) => p.socket.next<CaughtMsg>("caught", 20_000)));
    for (const msg of told) {
      expect(["guard", "camera", "laser"]).toContain(msg.hazard);
      expect([0, 1, 2]).toContain(msg.seat);
      // running east together they set the first checkpoint before the camera had them
      expect([0, 1, 2]).toContain(msg.checkpoint);
    }
    // everyone is told the same thing
    expect(new Set(told.map((m) => `${m.hazard}:${m.seat}`)).size).toBe(1);
    await closeAll(players);
  }, 120_000);
});

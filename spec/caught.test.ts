import { describe, expect, inject, it } from "vitest";
import { reachCameraHall } from "./heistPlay.ts";
import { byRole, closeAll, nextView, ready, startedGame } from "./play.ts";

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
    // room 01: push the crate, go through the door, and wait in the hall in front of the camera
    await reachCameraHall(players);

    // then all three run east at once, into the camera's cone while it watches
    let watching = false;
    while (!watching) {
      const view = await nextView(byRole(players, "deaf"), 3000);
      watching = view.entities.some((e) => e.id === "C1" && e.state === "watching");
    }
    for (const p of players)
      p.socket.send({ t: "input", seq: 2000, move: { x: 1, y: 0 }, act: false });
    const told = await Promise.all(players.map((p) => p.socket.next<CaughtMsg>("caught", 20_000)));
    for (const msg of told) {
      expect(["guard", "camera", "laser"]).toContain(msg.hazard);
      expect([0, 1, 2]).toContain(msg.seat);
      // the first checkpoint is just behind the hall
      expect([0, 1, 2]).toContain(msg.checkpoint);
    }
    // everyone is told the same thing
    expect(new Set(told.map((m) => `${m.hazard}:${m.seat}`)).size).toBe(1);
    await closeAll(players);
  }, 120_000);
});

import { describe, expect, inject, it } from "vitest";
import { byRole, closeAll, nextView, ready, startedGame } from "./play.ts";

const baseUrl = inject("baseUrl");

// The promise of ADR 0007: a role is never sent what it can't perceive. These
// read the raw messages on the wire, not what the client chooses to draw.
describe("per-role perception on the wire", () => {
  it("never sends the Can't-see player tiles, entities or its own position", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const blind = byRole(players, "blind");
    for (let i = 0; i < 40; i++) {
      const view = await nextView(blind);
      expect(view.tiles).toBeUndefined();
      expect(view.entities).toEqual([]);
      expect(view.you.pos).toBeUndefined();
      expect(JSON.stringify(view)).not.toContain("#");
    }
    await closeAll(players);
  });

  it("never sends the Can't-hear player a sound, even while others walk", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const deaf = byRole(players, "deaf");
    byRole(players, "mute").socket.send({ t: "input", seq: 1, move: { x: 1, y: 0 }, act: false });
    for (let i = 0; i < 40; i++) {
      expect((await nextView(deaf)).sounds).toEqual([]);
    }
    await closeAll(players);
  });

  it("sends tiles and entities to the others, tiles only on the first (full) view", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const mute = byRole(players, "mute");
    const first = await nextView(mute);
    expect(first.full).toBe(true);
    expect(first.tiles?.length).toBeGreaterThan(0);
    expect(first.entities.length).toBeGreaterThan(3);
    const second = await nextView(mute);
    expect(second.tiles).toBeUndefined();
    await closeAll(players);
  });

  it("lets the Can't-see player hear another seat's footsteps", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const blind = byRole(players, "blind");
    byRole(players, "deaf").socket.send({ t: "input", seq: 1, move: { x: 1, y: 0 }, act: false });
    let heard = false;
    for (let i = 0; i < 20 && !heard; i++) {
      heard = (await nextView(blind)).sounds.some((s) => s.kind === "footsteps");
    }
    expect(heard).toBe(true);
    await closeAll(players);
  });

  it("gives Can't see their own steps while walking and a bump against a wall, and Can't hear nothing", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const blind = byRole(players, "blind");
    const deaf = byRole(players, "deaf");
    const kinds = new Set<string>();
    // west from the spawn: a few steps, then the room's wall
    blind.socket.send({ t: "input", seq: 1, move: { x: -1, y: 0 }, act: false });
    for (let i = 0; i < 60; i++) {
      for (const sound of (await nextView(blind)).sounds) kinds.add(sound.kind);
      expect((await nextView(deaf)).sounds).toEqual([]);
    }
    expect(kinds.has("step")).toBe(true);
    expect(kinds.has("bump")).toBe(true);
    await closeAll(players);
  });
});

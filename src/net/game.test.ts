import { describe, expect, it } from "vitest";
import { loadRooms } from "../game/rooms/load.ts";
import type { Seat } from "../game/types.ts";
import { applyInput, crewOf, restartGame, rolesFor, startGame, tickGame } from "./game.ts";
import { LobbyError, type LobbyState } from "./lobbies.ts";

const rooms = loadRooms();

const seat = (n: string | null) => ({
  who: n,
  nickname: n ? n.toUpperCase() : null,
  connected: n !== null,
  bot: false,
});
const lobby = (...who: (string | null)[]): LobbyState => ({
  code: "ABCD",
  teamName: "Team",
  host: "a",
  phase: "open",
  seats: [seat(who[0] ?? null), seat(who[1] ?? null), seat(who[2] ?? null)],
  spectators: [],
  createdAt: 0,
});

describe("rolesFor", () => {
  it("gives seat i ROLES[(i + roomIndex) % 3], rotating each room", () => {
    expect(rolesFor(0)).toEqual(["blind", "deaf", "mute"]);
    expect(rolesFor(1)).toEqual(["deaf", "mute", "blind"]);
    expect(rolesFor(2)).toEqual(["mute", "blind", "deaf"]);
    expect(rolesFor(3)).toEqual(["blind", "deaf", "mute"]);
  });
});

describe("startGame", () => {
  it("needs three seated players", () => {
    for (const l of [lobby("a"), lobby("a", "b"), lobby("a", null, "c")]) {
      const err = (() => {
        try {
          startGame(l, rooms);
        } catch (e) {
          return e;
        }
      })();
      expect(err).toBeInstanceOf(LobbyError);
      expect((err as LobbyError).code).toBe("need-three");
    }
  });

  it("starts room 01 with distinct roles and nobody ready", () => {
    const game = startGame(lobby("a", "b", "c"), rooms);
    expect(game).toMatchObject({ lobby: "ABCD", roomIndex: 0 });
    expect(game.world.room.id).toBe("01-loading-dock");
    expect(game.ready.size).toBe(0);
    expect(new Set(game.roles).size).toBe(3);
    expect(crewOf(lobby("a", "b", "c"), game)).toEqual([
      { seat: 0, nickname: "A", role: "blind", bot: false },
      { seat: 1, nickname: "B", role: "deaf", bot: false },
      { seat: 2, nickname: "C", role: "mute", bot: false },
    ]);
  });
});

describe("inputs and views", () => {
  const started = () => startGame(lobby("a", "b", "c"), rooms);

  it("ignores an input whose seq is lower than the last one applied", () => {
    const game = started();
    expect(applyInput(game, 1, { seq: 5, move: { x: 1, y: 0 }, act: false })).toBe(true);
    expect(applyInput(game, 1, { seq: 3, move: { x: -1, y: 0 }, act: false })).toBe(false);
    expect(game.inputs[1]?.seq).toBe(5);
    expect(game.inputs[1]?.move).toEqual({ x: 1, y: 0 });
  });

  it("moves a seat by its held input and carries the ack in its view", () => {
    const game = started();
    applyInput(game, 1, { seq: 4, move: { x: 1, y: 0 }, act: false });
    let views = tickGame(game).views;
    for (let i = 0; i < 9; i++) views = tickGame(game).views;
    const deaf = views.get(1);
    expect(deaf?.ack).toBe(4);
    expect(deaf?.you.pos?.x).toBeCloseTo(2.5 + 2, 3);
    expect(views.get(0)?.ack).toBe(0);
  });

  it("sends each seat the view for its role, and tiles only to those asked for", () => {
    const game = started();
    const first = tickGame(game, new Set<Seat>([0, 1, 2])).views;
    expect(first.get(0)?.role).toBe("blind");
    expect(first.get(0)?.tiles).toBeUndefined();
    expect(first.get(1)?.tiles).toBeDefined();
    expect(first.get(2)?.full).toBe(true);
    const next = tickGame(game).views;
    expect(next.get(1)?.tiles).toBeUndefined();
    expect(next.get(1)?.full).toBe(false);
  });

  it("keeps a view of room 01 under 2 KB unless it is a full view", () => {
    const game = started();
    tickGame(game);
    for (const [, view] of tickGame(game).views) {
      expect(JSON.stringify({ t: "view", view }).length).toBeLessThan(2048);
    }
  });

  it("reports the room cleared", () => {
    const game = started();
    expect(tickGame(game).cleared).toBe(false);
    game.world.status = "cleared";
    expect(tickGame(game).cleared).toBe(true);
  });
});

describe("restartGame", () => {
  it("puts everyone back at spawn with crates and doors reset, keeping roles and ready", () => {
    const game = startGame(lobby("a", "b", "c"), rooms);
    game.ready.add(0);
    const roles = [...game.roles];
    const crate = game.world.crates[0]?.tile;
    applyInput(game, 1, { seq: 3, move: { x: 1, y: 0 }, act: false });
    for (let i = 0; i < 40; i++) tickGame(game);
    game.world.doorOpen.D1 = true;
    game.world.status = "cleared";
    expect(game.world.players[1].pos.x).toBeGreaterThan(3);

    restartGame(game);
    expect(game.world.tick).toBe(0);
    expect(game.world.status).toBe("playing");
    expect(game.world.doorOpen.D1).toBe(false);
    expect(game.world.crates[0]?.tile).toEqual(crate);
    expect(game.world.players[1].pos).toEqual({ x: 2.5, y: 4.5 });
    expect(game.inputs).toEqual({});
    expect(game.roles).toEqual(roles);
    expect([...game.ready]).toEqual([0]);
    // a seq lower than the old one is accepted again
    expect(applyInput(game, 1, { seq: 1, move: { x: 0, y: 0 }, act: false })).toBe(true);
  });
});

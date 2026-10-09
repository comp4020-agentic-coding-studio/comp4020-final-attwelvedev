import { describe, expect, it } from "vitest";
import { loadRooms } from "../game/rooms/load.ts";
import type { Seat } from "../game/types.ts";
import {
  advanceRoom,
  applyInput,
  chooserFor,
  crewOf,
  PAUSE_MS,
  pauseFor,
  relay,
  restartGame,
  resumeIfBack,
  rolesFor,
  startGame,
  takeOverWithBot,
  tickGame,
} from "./game.ts";
import type { LobbyState } from "./lobbies.ts";

const rooms = loadRooms();

const seat = (n: string | null) => ({
  who: n,
  nickname: n ? n.toUpperCase() : null,
  connected: n !== null,
  bot: false,
});
// A seat that is a bot: what startLobby leaves in an empty seat
const bot = (shape: string) => ({
  who: null,
  nickname: `Bot ${shape}`,
  connected: true,
  bot: true,
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
const withBots = (human: string, ...bots: number[]): LobbyState => {
  const l = lobby(human);
  for (const i of bots) l.seats[i] = bot(["circle", "square", "triangle"][i] as string);
  return l;
};

describe("rolesFor", () => {
  it("gives seat i ROLES[(i + roomIndex) % 3], rotating each room", () => {
    expect(rolesFor(0)).toEqual(["blind", "deaf", "mute"]);
    expect(rolesFor(1)).toEqual(["deaf", "mute", "blind"]);
    expect(rolesFor(2)).toEqual(["mute", "blind", "deaf"]);
    expect(rolesFor(3)).toEqual(["blind", "deaf", "mute"]);
  });
});

describe("startGame", () => {
  it("no longer needs three people: empty seats are bots", () => {
    const game = startGame(withBots("a", 1, 2), rooms);
    expect(Object.keys(game.bots).sort()).toEqual(["1", "2"]);
    expect([...game.ready].sort()).toEqual([1, 2]); // a bot is always ready
    expect(crewOf(withBots("a", 1, 2), game)).toEqual([
      { seat: 0, nickname: "A", role: "blind", bot: false },
      { seat: 1, nickname: "Bot square", role: "deaf", bot: true },
      { seat: 2, nickname: "Bot triangle", role: "mute", bot: true },
    ]);
  });

  it("has no bots when three people are seated", () => {
    expect(startGame(lobby("a", "b", "c"), rooms).bots).toEqual({});
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

describe("advanceRoom", () => {
  const started = () => startGame(lobby("a", "b", "c"), rooms);

  it("has three rooms to play", () => {
    expect(rooms.map((r) => r.id)).toEqual(["01-loading-dock", "02-cameras-lasers", "03-vault"]);
  });

  it("moves to the next room: new world, roles rotated, nobody ready, inputs and cooldowns cleared", () => {
    const game = started();
    game.ready.add(0);
    game.ready.add(1);
    applyInput(game, 1, { seq: 2, move: { x: 1, y: 0 }, act: false });
    game.cooldowns.until.sound = 123;
    game.world.status = "cleared";
    expect(advanceRoom(game, rooms)).toBe("next");
    expect(game.roomIndex).toBe(1);
    expect(game.world.room.id).toBe("02-cameras-lasers");
    expect(game.world.status).toBe("playing");
    expect(game.world.tick).toBe(0);
    expect(game.roles).toEqual(rolesFor(1));
    expect(game.ready.size).toBe(0);
    expect(game.inputs).toEqual({});
    expect(game.cooldowns.until).toEqual({});
  });

  it("gives every seat every role once across the three rooms, then reports done", () => {
    const game = started();
    const played: string[][] = [[], [], []];
    const record = () => {
      game.roles.forEach((r, seat) => {
        played[seat]?.push(r);
      });
    };
    record();
    expect(advanceRoom(game, rooms)).toBe("next");
    record();
    expect(advanceRoom(game, rooms)).toBe("next");
    record();
    for (const roles of played) expect(new Set(roles).size).toBe(3);
    expect(game.world.room.id).toBe("03-vault");
    expect(advanceRoom(game, rooms)).toBe("done");
    expect(game.roomIndex).toBe(2);
  });
});

describe("bots in a game", () => {
  const botGame = () => startGame(withBots("a", 1, 2), rooms);
  const tick = (game: ReturnType<typeof botGame>, n: number) => {
    const said: ReturnType<typeof tickGame>["sent"] = [];
    for (let i = 0; i < n; i++) said.push(...tickGame(game, new Set(), i * 50).sent);
    return said;
  };

  it("walk their own avatars", () => {
    const game = botGame();
    game.ready.add(0);
    const before = game.world.players.map((p) => ({ ...p.pos }));
    tick(game, 60);
    expect(game.world.players[2].pos).not.toEqual(before[2]); // the mute bot pushes the crate
    expect(game.world.players[0].pos).toEqual(before[0]); // the human has sent nothing
  });

  it("steer a Can't-see human with callouts they receive, from the Can't-hear bot", () => {
    const game = botGame();
    const said = tick(game, 100);
    const callouts = said.filter((s) => s.message.family === "say" && s.receivers.includes(0));
    expect(callouts.length).toBeGreaterThan(0);
    expect(callouts[0]?.from).toBe(1);
    expect(callouts[0]?.message.from).toMatchObject({ seat: 1, role: "deaf" });
  });

  it("stay inside the same rules and cooldowns as a person", () => {
    const game = botGame();
    const said = tick(game, 1500);
    for (const s of said) {
      // a Can't-speak bot never uses Say; every sound or face went through route()
      if (s.from === 2) expect(s.message.family).not.toBe("say");
    }
  });

  it("do not act when the room is over, and are made afresh for the next room", () => {
    const game = botGame();
    const first = game.bots[1]?.memory;
    game.world.status = "cleared";
    expect(advanceRoom(game, rooms)).toBe("next");
    expect(game.bots[1]?.memory).not.toBe(first);
    expect(game.bots[1]?.memory.roles).toEqual(rolesFor(1));
    expect([...game.ready].sort()).toEqual([1, 2]);
  });

  it("are made afresh by a restart, and stay ready", () => {
    const game = botGame();
    tick(game, 40);
    const first = game.bots[2]?.memory;
    restartGame(game);
    expect(game.bots[2]?.memory).not.toBe(first);
    expect(game.bots[2]?.memory.seq).toBe(0);
    expect(game.ready.has(1) && game.ready.has(2)).toBe(true);
  });
});

describe("pausing for a dropped seat", () => {
  const started = () => startGame(lobby("a", "b", "c"), rooms);
  const walkers = (game: ReturnType<typeof started>) => {
    applyInput(game, 1, { seq: 1, move: { x: 1, y: 0 }, act: false });
  };

  it("holds the seat for 45 s", () => {
    expect(PAUSE_MS).toBe(45_000);
    const game = started();
    expect(game.paused).toBeNull();
    pauseFor(game, 2, 1_000);
    expect(game.paused).toEqual({ seat: 2, deadline: 1_000 + PAUSE_MS, choosing: false });
  });

  it("stops the game ticking: no step, no bots, no views, until the seat is back", () => {
    const game = started();
    walkers(game);
    tickGame(game);
    const at = game.world.tick;
    const x = game.world.players[1].pos.x;
    pauseFor(game, 2, 0);
    for (let i = 0; i < 20; i++) expect(tickGame(game).views.size).toBe(0);
    expect(game.world.tick).toBe(at);
    expect(game.world.players[1].pos.x).toBe(x);
    expect(resumeIfBack(game, 2)).toBe(true);
    tickGame(game);
    expect(game.world.tick).toBe(at + 1);
  });

  it("only resumes for the seat it is waiting for", () => {
    const game = started();
    expect(resumeIfBack(game, 2)).toBe(false); // nothing to resume
    pauseFor(game, 2, 0);
    expect(resumeIfBack(game, 1)).toBe(false);
    expect(game.paused?.seat).toBe(2);
    expect(resumeIfBack(game, 2)).toBe(true);
    expect(game.paused).toBeNull();
  });

  it("keeps the first pause when a second seat drops", () => {
    const game = started();
    pauseFor(game, 2, 0);
    pauseFor(game, 1, 500);
    expect(game.paused).toEqual({ seat: 2, deadline: PAUSE_MS, choosing: false });
  });

  it("hands the choice to the host, or to the next connected human if the host is the one missing", () => {
    const l = lobby("a", "b", "c");
    expect(chooserFor(l, 2)).toBe("a");
    expect(l.host).toBe("a");
    expect(chooserFor(l, 0)).toBe("b"); // seat 0, the host, is the one missing
    expect(l.host).toBe("b"); // and the next connected human becomes host
    // a host who has dropped as well cannot choose
    const m = lobby("a", "b", "c");
    m.seats[0].connected = false;
    expect(chooserFor(m, 2)).toBe("b");
    // nobody left connected: the game is over
    const n = lobby("a", "b", "c");
    for (const s of n.seats) s.connected = false;
    expect(chooserFor(n, 2)).toBeNull();
  });

  it("lets a bot take the seat over: the world and everyone's place in it are kept", () => {
    const l = lobby("a", "b", "c");
    const game = startGame(l, rooms);
    applyInput(game, 1, { seq: 3, move: { x: 1, y: 0 }, act: false });
    for (let i = 0; i < 30; i++) tickGame(game);
    const world = game.world;
    const where = world.players.map((p) => ({ ...p.pos }));
    pauseFor(game, 1, 0);
    takeOverWithBot(game, l, 1);
    expect(game.world).toBe(world);
    expect(world.players.map((p) => p.pos)).toEqual(where);
    expect(l.seats[1]).toMatchObject({
      who: null,
      bot: true,
      connected: true,
      nickname: "Bot square",
    });
    expect(game.bots[1]?.memory.seat).toBe(1);
    expect(game.ready.has(1)).toBe(true);
    expect(game.inputs[1]).toBeUndefined(); // the person's held key does not walk on
    expect(game.paused).toBeNull();
    // and it plays on: the bot now moves the seat itself
    const before = { ...world.players[1].pos };
    for (let i = 0; i < 40; i++) tickGame(game);
    expect(world.players[1].pos).not.toEqual(before);
  });
});

describe("a person's messages reach the bots they are sent to", () => {
  it("lets a Can't-hear person steer a Can't-see bot with callouts (room 2: seat 0 hears nothing, seat 2 sees nothing)", () => {
    const l = withBots("a", 1, 2);
    const game = startGame(l, rooms);
    game.world.status = "cleared";
    advanceRoom(game, rooms); // room 2: seat 0 is Can't hear, seat 2 is Can't see
    expect(game.roles).toEqual(["deaf", "mute", "blind"]);
    const before = { ...game.world.players[2].pos };
    const sent = relay(game, l, 0, { t: "say", kind: "callout", callout: "right" }, 1_000);
    expect(sent).toMatchObject({ ok: true });
    for (let i = 0; i < 10; i++) tickGame(game, new Set(), 1_000 + i * 50);
    expect(game.world.players[2].pos.x).toBeGreaterThan(before.x);
  });
});

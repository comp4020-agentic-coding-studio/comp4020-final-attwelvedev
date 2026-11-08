import { describe, expect, it } from "vitest";
import { botRef, rolesFor } from "../game/crew.ts";
import { secretDoors } from "../game/rooms/format.ts";
import { loadRooms } from "../game/rooms/load.ts";
import { syncCacheDoors } from "../game/sim/cache.ts";
import type { Seat } from "../game/types.ts";
import {
  advanceRoom,
  applyInput,
  autopilotOn,
  castVote,
  chooserFor,
  commsEdges,
  countComms,
  countVoice,
  crewOf,
  finishVote,
  giveSeatBack,
  markPlayed,
  PAUSE_MS,
  pauseFor,
  playedBy,
  proposeVote,
  readyAgain,
  relay,
  restartGame,
  resumeIfBack,
  setAutopilot,
  settleVote,
  stalledRestart,
  startGame,
  swapPeople,
  takeOverWithBot,
  takeOverWithPerson,
  tickGame,
  unready,
  VOTE_MS,
  voters,
} from "./game.ts";
import { type LobbyState, newPerson } from "./lobbies.ts";

const rooms = loadRooms();
// room 1 until escape-room phase 04: a crate, and spawns in rows 4 to 6, which the restart test uses
const firstJob = loadRooms("./spec/fixtures/first-job");
// Don't Blink, a room until escape-room phase 10: lasers, which the caught test uses
const oldRooms = loadRooms("./spec/fixtures/old-rooms");
const roomById = (id: string) => {
  const found = [...rooms, ...oldRooms].find((r) => r.id === id);
  if (!found) throw new Error(`no room ${id}`);
  return found;
};

const seat = (n: string | null, person: number | null = n === null ? null : 0) => ({
  who: n,
  nickname: n ? n.toUpperCase() : null,
  connected: n !== null,
  bot: false,
  person,
});
// A seat that is a bot: what startLobby leaves in an empty seat
const bot = (name: string) => ({
  who: null,
  nickname: `Bot ${name}`,
  connected: true,
  bot: true,
  person: null,
});
const lobby = (...who: (string | null)[]): LobbyState => ({
  code: "ABCD",
  teamName: "Team",
  host: "a",
  phase: "open",
  private: false,
  people: who.flatMap((w) => (w === null ? [] : [newPerson(w, w.toUpperCase())])),
  seats: [seat(who[0] ?? null, 0), seat(who[1] ?? null, 1), seat(who[2] ?? null, 2)].map((s, i) =>
    s.who === null ? { ...s, person: null } : { ...s, person: i },
  ) as LobbyState["seats"],
  sittingOut: [],
  spectators: [],
  createdAt: 0,
});
const withBots = (human: string, ...bots: number[]): LobbyState => {
  const l = lobby(human);
  for (const i of bots) l.seats[i] = bot(["Ace", "Jinx", "Moss"][i] as string);
  return l;
};

describe("startGame", () => {
  it("no longer needs three people: empty seats are bots", () => {
    const game = startGame(withBots("a", 1, 2), rooms);
    expect(Object.keys(game.bots).sort()).toEqual(["1", "2"]);
    expect([...game.ready].sort()).toEqual([1, 2]); // a bot is always ready
    expect(crewOf(withBots("a", 1, 2), game)).toEqual([
      { seat: 0, nickname: "A", role: "blind", bot: false },
      { seat: 1, nickname: "Bot Jinx", role: "deaf", bot: true },
      { seat: 2, nickname: "Bot Moss", role: "mute", bot: true },
    ]);
  });

  it("has no bots when three people are seated", () => {
    expect(startGame(lobby("a", "b", "c"), rooms).bots).toEqual({});
  });

  it("starts room 01 with distinct roles and nobody ready", () => {
    const game = startGame(lobby("a", "b", "c"), rooms);
    expect(game).toMatchObject({ lobby: "ABCD", roomIndex: 0 });
    expect(game.world.room.id).toBe("01-first-steps");
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
    expect(deaf?.you.pos?.x).toBeCloseTo(1.5 + 2, 3);
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

  // Task 64 (h): a secret door opening changes the map, so the sighted get it the tick it happens,
  // even when no seat was owed a full view; an ordinary tick sends none.
  it("sends tiles to every seat the tick a chamber door or a vault door opens, and not otherwise", () => {
    const cacheRooms = loadRooms("./spec/fixtures/rooms-cache");
    const game = startGame(lobby("a", "b", "c"), cacheRooms);
    const w = game.world;
    const moon = { x: 2.5, y: 4.5 };
    const anchor = { x: 5.5, y: 8.5 };
    tickGame(game); // an ordinary tick
    expect([0, 1, 2].map((i) => tickGame(game).views.get(i as Seat)?.tiles)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    let seq = 100;
    const actAt = (seatNo: Seat, at: { x: number; y: number }) => {
      w.players[seatNo].pos = { ...at };
      applyInput(game, seatNo, { seq: ++seq, move: { x: 0, y: 0 }, act: true });
      const views = tickGame(game).views;
      applyInput(game, seatNo, { seq: ++seq, move: { x: 0, y: 0 }, act: false });
      return views;
    };
    const uncover = actAt(0, moon);
    expect(w.cacheUncovered).toEqual(["Q1"]);
    for (const i of [1, 2] as const)
      expect(uncover.get(i)?.tiles, `uncover, seat ${i}`).toBeDefined();
    expect(uncover.get(0)?.tiles).toBeUndefined(); // Can't see has no map
    const station = w.stations.Q1 as NonNullable<(typeof w.stations)[string]>;
    station.answer = [3, 4];
    station.input = [3, 4];
    const solved = actAt(1, anchor);
    expect(w.cacheBy.Q1).toBe(1);
    for (const i of [1, 2] as const) expect(solved.get(i)?.tiles, `solve, seat ${i}`).toBeDefined();
    const after = tickGame(game).views;
    expect(after.get(1)?.tiles).toBeUndefined();
    expect(after.get(2)?.tiles).toBeUndefined();
  });

  // A send-back shuts a chamber that was open, so the sighted must be sent the map again that tick:
  // otherwise their client keeps the open chamber drawn and predicts it walkable while the server
  // treats it as wall (the user saw a door that stayed open on screen and could not be walked through).
  it("sends tiles to the sighted seats the tick a send-back shuts an open chamber", () => {
    const room4 = loadRooms("./rooms").find((r) => r.id === "04-the-safe");
    if (!room4) throw new Error("no room 4");
    const g = startGame(lobby("a", "b", "c"), [room4]);
    const world = g.world;
    world.cacheUncovered.push("Q3");
    syncCacheDoors(world);
    tickGame(g, new Set<Seat>([0, 1, 2])); // everyone holds the open map
    expect(world.doorOpen[secretDoors(world.room)[0]?.chamber.id as string]).toBe(true);
    // a wrong answer on the ordinary dial Q2 sends the team back to the spawns
    const q2 = world.stations.Q2 as NonNullable<(typeof world.stations)[string]>;
    q2.answer = [3, 3];
    q2.input = [5];
    world.players[1].pos = { x: 20.5, y: 1.5 }; // Q2's anchor tile
    applyInput(g, 1, { seq: 900, move: { x: 0, y: 0 }, act: true });
    const views = tickGame(g).views;
    expect(world.attempt, "the wrong answer sent the team back").toBe(1);
    expect(world.doorOpen[secretDoors(world.room)[0]?.chamber.id as string]).toBe(false);
    for (const i of [1, 2] as const) expect(views.get(i)?.tiles, `seat ${i}`).toBeDefined();
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

describe("stalledRestart: the guard for a restarted room that never ticks (playtest fixes, Task 6)", () => {
  // The playtest's freeze was not reproduced (20 restarts in spec/restart-resume.test.ts, 4 on the
  // page in spec/layout/hud.test.ts); this is the guard the plan asks for in that case.
  const restarted = () => {
    const game = startGame(lobby("a", "b", "c"), firstJob);
    for (const s of [0, 1, 2] as const) game.ready.add(s);
    restartGame(game);
    return game;
  };
  const idle = { ticking: false, holding: false };

  it("a restarted room with no tick loop and no hold, still at tick 0, has stalled", () => {
    expect(stalledRestart(restarted(), idle)).toBe(true);
  });

  it("a room that ticks, or is still in its hold, has not", () => {
    const game = restarted();
    expect(stalledRestart(game, { ticking: true, holding: false })).toBe(false);
    expect(stalledRestart(game, { ticking: false, holding: true })).toBe(false);
    tickGame(game);
    expect(stalledRestart(game, idle)).toBe(false);
  });

  it("a room held for a reason is not stalled: paused, a vote open, not all ready, or cleared", () => {
    const paused = restarted();
    pauseFor(paused, 1, Date.now(), PAUSE_MS);
    expect(stalledRestart(paused, idle)).toBe(false);
    const voting = restarted();
    proposeVote(voting, lobby("a", "b", "c"), 0, "room", Date.now());
    expect(stalledRestart(voting, idle)).toBe(false);
    const unready = restarted();
    unready.ready.delete(2);
    expect(stalledRestart(unready, idle)).toBe(false);
    const cleared = restarted();
    cleared.world.status = "cleared";
    expect(stalledRestart(cleared, idle)).toBe(false);
  });
});

describe("restartGame", () => {
  it("puts everyone back at spawn with crates and doors reset, keeping roles and ready", () => {
    const game = startGame(lobby("a", "b", "c"), firstJob);
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
    expect(game.world.players[1].pos).toEqual({ x: 1.5, y: 5.5 });
    expect(game.inputs).toEqual({});
    expect(game.roles).toEqual(roles);
    expect([...game.ready]).toEqual([0]);
    // a seq lower than the old one is accepted again
    expect(applyInput(game, 1, { seq: 1, move: { x: 0, y: 0 }, act: false })).toBe(true);
  });

  it("seeds each new world afresh, so a restart draws new station answers (FR5)", () => {
    const game = startGame(lobby("a", "b", "c"), rooms);
    const seeds = new Set([game.world.seed]);
    for (let i = 0; i < 5; i++) {
      restartGame(game);
      seeds.add(game.world.seed);
    }
    expect(seeds.size).toBe(6);
    for (const s of seeds) expect(Number.isInteger(s) && s >= 0).toBe(true);
  });
});

describe("advanceRoom", () => {
  let l: LobbyState;
  const started = () => {
    l = lobby("a", "b", "c");
    return startGame(l, rooms);
  };

  it("has ten rooms to play: the basics, The Safe, The Gallery, Lights Out, Night Shift, Music Room, then the old rooms until phase 10 replaces them", () => {
    expect(rooms.map((r) => r.id)).toEqual([
      "01-first-steps",
      "02-three-hands",
      "03-watchers",
      "04-the-safe",
      "05-the-gallery",
      "06-lights-out",
      "07-night-shift",
      "08-music-room",
      "09-the-vault",
    ]);
  });

  it("moves to the next room: new world, roles rotated, nobody ready, inputs and cooldowns cleared", () => {
    const game = started();
    game.ready.add(0);
    game.ready.add(1);
    applyInput(game, 1, { seq: 2, move: { x: 1, y: 0 }, act: false });
    game.cooldowns.until.sound = 123;
    game.world.status = "cleared";
    expect(advanceRoom(game, l, rooms)).toBe("next");
    expect(game.roomIndex).toBe(1);
    expect(game.world.room.id).toBe("02-three-hands");
    expect(game.world.status).toBe("playing");
    expect(game.world.tick).toBe(0);
    expect(game.roles).toEqual(rolesFor(1));
    expect(game.ready.size).toBe(0);
    expect(game.inputs).toEqual({});
    expect(game.cooldowns.until).toEqual({});
  });

  it("gives every seat every role once across any three rooms in a row, then reports done", () => {
    const game = started();
    const played: string[][] = [[], [], []];
    const record = () => {
      game.roles.forEach((r, seat) => {
        played[seat]?.push(r);
      });
    };
    record();
    for (let i = 1; i < rooms.length; i++) {
      expect(advanceRoom(game, l, rooms)).toBe("next");
      record();
    }
    for (const roles of played) {
      for (let i = 0; i + 3 <= roles.length; i++)
        expect(new Set(roles.slice(i, i + 3)).size).toBe(3);
    }
    expect(game.world.room.id).toBe(rooms.at(-1)?.id);
    expect(advanceRoom(game, l, rooms)).toBe("done");
    expect(game.roomIndex).toBe(rooms.length - 1);
  });
});

describe("bots in a game", () => {
  let bl: LobbyState;
  const botGame = () => {
    bl = withBots("a", 1, 2);
    return startGame(bl, rooms);
  };
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
    const callouts = said.filter((s) => s.message.method === "callout" && s.receivers.includes(0));
    expect(callouts.length).toBeGreaterThan(0);
    expect(callouts[0]?.from).toBe(1);
    expect(callouts[0]?.message.from).toMatchObject({ seat: 1, role: "deaf" });
  });

  it("stay inside the same rules and cooldowns as a person", () => {
    const game = botGame();
    const said = tick(game, 1500);
    for (const s of said) {
      // a Can't-speak bot never says callouts or text; everything went through route()
      if (s.from === 2) expect(["callout", "text"]).not.toContain(s.message.method);
    }
  });

  it("do not act when the room is over, and are made afresh for the next room", () => {
    const game = botGame();
    const first = game.bots[1]?.memory;
    game.world.status = "cleared";
    expect(advanceRoom(game, bl, rooms)).toBe("next");
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

// A mark a person sends lands in the world, where Can't hear and Can't speak see it drawn (relay).
// A bot's mark goes through the same router, so it must be drawn too: a mark nobody can see is
// not a message. Room 7's torch carrier marks the wire its ink names.
describe("a bot's mark is drawn on the wall like a person's", () => {
  it("room 7: the Can't-speak bot at the ink marks the wire, and a stamp lands in the world", () => {
    const l = withBots("a", 1, 2); // seat 0 a person, seats 1 and 2 bots
    const game = startGame(l, rooms);
    // walk to room 7 the way the server does: each cleared room advances the game
    while (game.roomIndex < 6) {
      game.world.status = "cleared";
      advanceRoom(game, l, rooms);
    }
    expect(game.world.room.id).toBe("07-night-shift");
    game.ready.add(0);
    const marks: number[] = [];
    for (let i = 0; i < 1500 && game.world.stamps.length === 0; i++) {
      const said = tickGame(game, new Set(), i * 50).sent;
      if (said.some((s) => s.message.method === "mark")) marks.push(i);
    }
    expect(marks.length, "a bot sent a mark").toBeGreaterThan(0);
    expect(game.world.stamps.length, "and it is drawn in the world").toBeGreaterThan(0);
    // a seat that is neither the bot that marked nor Can't see is shown it: the sighted roles that
    // receive marks (ADR 0011). Whoever the room's rotation made the other sighted seat, by role.
    const views = tickGame(game, new Set(), 99_999).views;
    const sighted = ([0, 1, 2] as const).filter((x) => game.roles[x] !== "blind");
    expect(sighted.length).toBe(2);
    for (const x of sighted) {
      expect(
        views.get(x)?.entities.some((e) => e.kind === "stamp"),
        `${game.roles[x]} (seat ${x}) is shown the stamp`,
      ).toBe(true);
    }
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

  it("keeps waiting for the seat that is away when a bot takes a different one", () => {
    // seat 2 dropped; seat 1's person leaves for good and a bot takes seat 1
    const l = lobby("a", "b", "c");
    const game = startGame(l, rooms);
    pauseFor(game, 2, 0);
    takeOverWithBot(game, l, 1, "b");
    expect(game.paused?.seat).toBe(2);
    expect(game.bots[1]).toBeDefined();
  });

  it("a bot taking a seat means the crew no longer names the person who had it", () => {
    const l = lobby("a", "b", "c", "d", "e");
    l.seats = [seat("a", 0), seat("b", 1), seat("c", 2)];
    l.sittingOut = ["d", "e"];
    const game = startGame(l, rooms);
    takeOverWithBot(game, l, 1, "b");
    expect(game.crew.people).toEqual([0, null, 2]); // not [0, 1, 2]: that is the person who has gone
    // so the bot can be swapped like any other, and nobody comes back into its seat by it
    swapPeople(game, l, 3, botRef(1));
    expect(l.seats.map((s) => s.who)).toEqual(["a", "d", "c"]);
    expect(l.seats[1]?.bot).toBe(false);
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
      nickname: "Bot Jinx",
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
    advanceRoom(game, l, rooms); // room 2: seat 0 is Can't hear, seat 2 is Can't see
    expect(game.roles).toEqual(["deaf", "mute", "blind"]);
    const before = { ...game.world.players[2].pos };
    const sent = relay(game, l, 0, { method: "callout", callout: "right" }, 1_000);
    expect(sent).toMatchObject({ ok: true });
    for (let i = 0; i < 10; i++) tickGame(game, new Set(), 1_000 + i * 50);
    expect(game.world.players[2].pos.x).toBeGreaterThan(before.x);
  });
});

describe("the crew can still talk once a room is cleared", () => {
  it("relays a text from Can't see (to Can't speak, its only reader) while the room is cleared", () => {
    const l = withBots("a", 1, 2);
    const game = startGame(l, rooms);
    game.world.status = "cleared";
    const blind = game.roles.indexOf("blind") as Seat;
    const sent = relay(game, l, blind, { method: "text", text: "nice one" }, 1_000);
    expect(sent).toMatchObject({ ok: true });
  });
});

describe("a mark must be on a tile the sender can see", () => {
  const first = (game: ReturnType<typeof startGame>, role: "deaf" | "blind" | "mute") =>
    game.roles.indexOf(role) as Seat;

  it("is refused as not-in-sight on a wall, not as the role being unable to send", () => {
    const l = withBots("a", 1, 2);
    const game = startGame(l, rooms);
    const deaf = first(game, "deaf");
    const sent = relay(game, l, deaf, { method: "mark", id: "x", at: { x: 0.5, y: 0.5 } }, 1_000);
    expect(sent).toEqual({ ok: false, code: "not-in-sight" });
    expect(game.world.stamps).toHaveLength(0);
  });

  it("is still cant-send for a role that can't send marks at all", () => {
    const l = withBots("a", 1, 2);
    const game = startGame(l, rooms);
    const blind = first(game, "blind");
    const here = game.world.players[blind].pos;
    const sent = relay(game, l, blind, { method: "mark", id: "x", at: here }, 1_000);
    expect(sent).toEqual({ ok: false, code: "cant-send" });
  });
});

describe("being caught", () => {
  it("is reported by tickGame: what, which player, and the checkpoint the team goes back to", () => {
    const game = startGame(lobby("a", "b", "c"), [roomById("09-cameras-lasers")]);
    game.ready.add(0);
    game.world.checkpoint = 1;
    game.world.players[1].pos = { x: 23.5, y: 4.5 }; // in L1's column (a laser column at x = 23)
    game.world.tick = 0;
    const caught = tickGame(game).caught;
    expect(caught).toEqual([{ hazard: "laser", seat: 1, checkpoint: 1 }]);
    expect(tickGame(game).caught).toEqual([]);
  });

  it("names the station type for a wrong answer, so the banner can say what was wrong", () => {
    const [draft] = loadRooms("./spec/fixtures/drafts");
    const game = startGame(lobby("a", "b", "c"), [draft as (typeof rooms)[0]]);
    game.ready.add(0);
    const wires = game.world.stations.Q4;
    if (!wires) throw new Error("no Q4");
    const wrong = [0, 1, 2, 3].find((i) => i !== wires.answer[0]) as number;
    const tile = draft?.objects.find((o) => o.id === "Q4")?.params?.wires as number[][];
    const [x, y] = tile[wrong] as [number, number];
    game.world.players[1].pos = { x: x + 0.5, y: y + 0.5 };
    game.inputs[1] = { seq: 1, move: { x: 0, y: 0 }, act: true };
    const caught = tickGame(game).caught;
    expect(caught).toEqual([{ hazard: "station", seat: 1, checkpoint: 0, station: "wires" }]);
  });
});

describe("coming back to a seat a bot took", () => {
  const taken = () => {
    const l = lobby("a", "b", "c");
    const game = startGame(l, rooms);
    for (let i = 0; i < 30; i++) tickGame(game);
    takeOverWithBot(game, l, 2, "c");
    return { l, game };
  };

  it("remembers who the seat belonged to", () => {
    expect(taken().game.vacated[2]).toBe("c");
  });

  it("gives the seat back to that person only, and the bot steps aside with the world kept", () => {
    const { l, game } = taken();
    const world = game.world;
    const where = { ...world.players[2].pos };
    expect(giveSeatBack(game, l, "z", "Zed")).toBeNull(); // not their seat
    expect(l.seats[2]?.bot).toBe(true);
    const seat = giveSeatBack(game, l, "c", "C");
    expect(seat).toBe(2);
    expect(l.seats[2]).toMatchObject({ who: "c", nickname: "C", connected: true, bot: false });
    expect(game.bots[2]).toBeUndefined();
    expect(game.vacated[2]).toBeUndefined();
    expect(game.world).toBe(world);
    expect(world.players[2].pos).toEqual(where);
    expect(game.inputs[2]).toBeUndefined();
    // and they can only take it once
    expect(giveSeatBack(game, l, "c", "C")).toBeNull();
  });

  it("makes the other bots start afresh, since who is a person has changed", () => {
    const l = withBots("a", 1);
    l.seats[2] = seat("c");
    const game = startGame(l, rooms);
    takeOverWithBot(game, l, 2, "c");
    const before = game.bots[1]?.memory;
    giveSeatBack(game, l, "c", "C");
    expect(game.bots[1]?.memory).not.toBe(before);
    expect(game.bots[1]?.memory.humans.has(2)).toBe(true);
  });
});

// With more than three people each room seats a fair crew of three and the rest sit out (ADR 0013).
describe("a lobby of five", () => {
  const five = () => {
    const l = lobby("a", "b", "c", "d", "e");
    l.seats = [seat("a", 0), seat("b", 1), seat("c", 2)];
    l.sittingOut = ["d", "e"];
    return l;
  };

  it("starts with the first three seated and records them as having played once the room ticks", () => {
    const l = five();
    const game = startGame(l, rooms);
    expect(game.crew).toEqual({ people: [0, 1, 2], roles: ["blind", "deaf", "mute"] });
    expect(l.people.map((p) => p.played)).toEqual([[], [], [], [], []]);
    expect(markPlayed(game, l)).toBe(true);
    expect(l.people.map((p) => p.played)).toEqual([["blind"], ["deaf"], ["mute"], [], []]);
    expect(markPlayed(game, l)).toBe(false); // a restart of the same room is not a second play
    expect(l.people[0]?.played).toEqual(["blind"]);
  });

  it("keeps a bot's roles too, under its own name, for the reveal's Played row (the user, Task 81 review)", () => {
    const l = withBots("a", 1, 2);
    const game = startGame(l, rooms);
    expect(playedBy(l, game)).toEqual({ A: [], "Bot Jinx": [], "Bot Moss": [] }); // nothing yet: nothing shown
    markPlayed(game, l);
    expect(markPlayed(game, l)).toBe(false); // a restart is not a second play
    expect(playedBy(l, game)).toEqual({
      A: [game.roles[0]],
      "Bot Jinx": [game.roles[1]],
      "Bot Moss": [game.roles[2]],
    });
  });

  it("seats the others next, and moves the first three to sit out", () => {
    const l = five();
    const game = startGame(l, rooms);
    markPlayed(game, l);
    game.world.status = "cleared";
    expect(advanceRoom(game, l, rooms)).toBe("next");
    expect(game.crew.people.slice().sort()).toEqual([0, 3, 4].sort());
    expect(l.seats.map((s) => s.who).sort()).toEqual(["a", "d", "e"]);
    expect(l.sittingOut.sort()).toEqual(["b", "c"]);
    expect(game.roles).toEqual(game.crew.roles);
    expect(
      crewOf(l, game)
        .map((c) => c.nickname)
        .sort(),
    ).toEqual(["A", "D", "E"]);
  });

  it("a host swap changes roles or seats, clears ready, and the new crew is what is recorded", () => {
    const l = five();
    const game = startGame(l, rooms);
    game.ready.add(0);
    game.ready.add(1);
    swapPeople(game, l, 0, 2);
    expect(game.roles).toEqual(["mute", "deaf", "blind"]);
    expect(game.ready.size).toBe(0);
    swapPeople(game, l, 1, 4);
    expect(l.seats.map((s) => s.who)).toEqual(["a", "e", "c"]);
    expect(l.sittingOut.sort()).toEqual(["b", "d"]);
    markPlayed(game, l);
    expect(l.people.map((p) => p.played)).toEqual([["mute"], [], ["blind"], [], ["deaf"]]);
  });

  it("a host swap with a bot trades roles, or seats a sitting-out person in the bot's place", () => {
    const l = lobby("a", "b", "c", "d", "e");
    l.seats = [seat("a", 0), seat("b", 1), bot("▲") as LobbyState["seats"][number]];
    l.sittingOut = ["c", "d", "e"];
    const game = startGame(l, rooms);
    game.crew = { people: [0, 1, null], roles: ["blind", "deaf", "mute"] }; // a bot where a person left
    swapPeople(game, l, 0, botRef(2));
    expect(game.roles).toEqual(["mute", "deaf", "blind"]);
    expect(l.seats[2]?.bot).toBe(true);
    expect(game.bots[2]).toBeDefined();
    swapPeople(game, l, 3, botRef(2));
    expect(l.seats.map((s) => s.who)).toEqual(["a", "b", "d"]);
    expect(l.seats[2]?.bot).toBe(false);
    expect(game.bots[2]).toBeUndefined();
    expect(l.sittingOut.sort()).toEqual(["c", "e"]);
  });

  it("the heist record names everyone who played any room, bots too, once each", () => {
    const l = five();
    const game = startGame(l, rooms);
    markPlayed(game, l);
    game.world.status = "cleared";
    advanceRoom(game, l, rooms);
    markPlayed(game, l);
    expect([...game.heistPeople.values()].map((p) => p.nickname).sort()).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
    ]);
  });

  it("with three people or fewer nobody sits out and the seats keep their people", () => {
    const l = lobby("a", "b");
    const game = startGame(withSeatsOf(l), rooms);
    markPlayed(game, l);
    expect(l.sittingOut).toEqual([]);
    expect(game.crew.people).toEqual([0, 1, null]);
  });
});

function withSeatsOf(l: LobbyState): LobbyState {
  l.seats = [seat(l.people[0]?.who ?? null, 0), seat(l.people[1]?.who ?? null, 1), bot("Moss")];
  return l;
}

// Restarting the room, or the whole heist, needs every connected person to say yes (ADR 0013).
describe("a restart vote", () => {
  const three = () => {
    const l = lobby("a", "b", "c");
    return { l, game: startGame(l, rooms) };
  };

  it("voters are the seats with a connected person: bots and people who dropped don't vote", () => {
    expect(voters(three().l)).toEqual([0, 1, 2]);
    expect(voters(withBots("a", 1, 2))).toEqual([0]);
    const l = lobby("a", "b", "c");
    l.seats[1].connected = false;
    expect(voters(l)).toEqual([0, 2]);
  });

  it("proposing counts as a yes, and the vote stays open until everyone has answered", () => {
    const { l, game } = three();
    expect(proposeVote(game, l, 0, "room", 1000)).toBe("open");
    expect(game.vote).toMatchObject({ kind: "room", by: 0, until: 1000 + VOTE_MS });
    expect([...(game.vote?.yes ?? [])]).toEqual([0]);
    expect(castVote(game, l, 1, true, 2000)).toBe("open");
    expect(castVote(game, l, 2, true, 3000)).toBe("passed");
  });

  it("passes at once for a lone person with bots, since they are the only voter", () => {
    const l = withBots("a", 1, 2);
    const game = startGame(l, rooms);
    expect(proposeVote(game, l, 0, "room", 0)).toBe("passed");
  });

  it("one no declines it", () => {
    const { l, game } = three();
    proposeVote(game, l, 1, "room", 0);
    expect(castVote(game, l, 2, false, 10)).toBe("declined");
  });

  it("a second proposal while one is open is ignored", () => {
    const { l, game } = three();
    proposeVote(game, l, 0, "room", 0);
    expect(proposeVote(game, l, 1, "heist", 5)).toBe("open");
    expect(game.vote?.kind).toBe("room");
    expect(game.vote?.by).toBe(0);
  });

  it("a person who answers twice, or who is not a voter, changes nothing", () => {
    const { l, game } = three();
    proposeVote(game, l, 0, "room", 0);
    expect(castVote(game, l, 1, true, 1)).toBe("open");
    expect(castVote(game, l, 1, false, 2)).toBe("open"); // already said yes: not taken back
    expect([...(game.vote?.yes ?? [])].sort()).toEqual([0, 1]);
    expect(castVote(game, l, 1, true, 3)).toBe("open");
    const stranger = withBots("a", 1, 2);
    const g2 = startGame(stranger, rooms);
    expect(castVote(g2, stranger, 1, false, 0)).toBe("open"); // no vote open at all
  });

  it("is not allowed while the game is paused or the room is cleared", () => {
    const { l, game } = three();
    pauseFor(game, 2, 0);
    expect(proposeVote(game, l, 0, "room", 1)).toBe("refused");
    expect(game.vote).toBeNull();
    game.paused = null;
    game.world.status = "cleared";
    expect(proposeVote(game, l, 0, "room", 1)).toBe("open"); // a cleared room may be restarted
  });

  it("a person leaving can complete it: the rest have all said yes", () => {
    const { l, game } = three();
    proposeVote(game, l, 0, "room", 0);
    castVote(game, l, 1, true, 1);
    l.seats[2] = bot("Moss");
    expect(settleVote(game, l)).toBe("passed");
  });

  it("a restart-room vote passing restarts the room, everyone back at spawn", () => {
    const { l, game } = three();
    game.world.players[0].pos = { x: 5, y: 5 };
    const world = game.world;
    expect(finishVote(game, l, rooms, "passed")).toBe(null);
    expect(game.vote).toBeNull();
    expect(game.world).toBe(world); // no vote open: nothing happened
    proposeVote(game, l, 0, "room", 0);
    castVote(game, l, 1, true, 1);
    castVote(game, l, 2, true, 2);
    expect(finishVote(game, l, rooms, "passed")).toBe("room");
    expect(game.world).not.toBe(world);
    expect(game.vote).toBeNull();
    expect(game.roomIndex).toBe(0);
  });

  it("a restart-heist vote passing clears who has played, and returns to room 1 with a fresh crew", () => {
    const l = lobby("a", "b", "c", "d", "e");
    l.seats = [seat("a", 0), seat("b", 1), seat("c", 2)];
    l.sittingOut = ["d", "e"];
    const game = startGame(l, rooms);
    markPlayed(game, l);
    game.world.status = "cleared";
    advanceRoom(game, l, rooms);
    markPlayed(game, l);
    expect(game.roomIndex).toBe(1);
    expect(l.people.flatMap((p) => p.played).length).toBe(6);

    proposeVote(game, l, 0, "heist", 0);
    for (const s of l.seats) castVote(game, l, s.person as 0, true, 1); // all three seated vote yes
    expect(finishVote(game, l, rooms, "passed")).toBe("heist");
    expect(game.roomIndex).toBe(0);
    expect(game.world.room.id).toBe(rooms[0]?.id);
    expect(l.people.map((p) => p.played)).toEqual([[], [], [], [], []]);
    expect(game.crew.people).toEqual([0, 1, 2]);
    expect(game.heistPeople.size).toBe(0);
    expect(game.counted).toBe(-1);
    expect(game.ready.size).toBe(0);
  });

  it("a declined or timed-out vote changes nothing but closing", () => {
    const { l, game } = three();
    const world = game.world;
    proposeVote(game, l, 0, "room", 0);
    expect(finishVote(game, l, rooms, "declined")).toBe(null);
    expect(game.vote).toBeNull();
    expect(game.world).toBe(world);
  });
});

// A person who leaves while others sit out: the host may pull one of them in to take the seat.
describe("takeOverWithPerson", () => {
  // five people, the first three playing room 1; the person in seat 1 (Bo) has just left the lobby
  const afterLeave = () => {
    const l = lobby("a", "b", "c", "d", "e");
    l.seats = [seat("a", 0), seat("b", 1), seat("c", 2)];
    l.sittingOut = ["d", "e"];
    const game = startGame(l, rooms);
    markPlayed(game, l);
    game.ready.add(0);
    game.ready.add(1);
    game.ready.add(2);
    return { l, game };
  };

  it("seats the pulled-in person in the leaver's seat, with the leaver's role, and they are no longer sitting out", () => {
    const { l, game } = afterLeave();
    const role = game.roles[1];
    expect(takeOverWithPerson(game, l, 1, 3)).toBe(true); // person 3 is Di
    expect(l.seats[1]).toMatchObject({
      who: "d",
      nickname: "D",
      bot: false,
      person: 3,
      connected: true,
    });
    expect(game.roles[1]).toBe(role);
    expect(game.crew.people[1]).toBe(3);
    expect(l.sittingOut).toEqual(["e"]);
  });

  it("at a reveal, does not count the role as played yet: the room counts it once when it starts", () => {
    const l = lobby("a", "b", "c", "d", "e");
    l.seats = [seat("a", 0), seat("b", 1), seat("c", 2)];
    l.sittingOut = ["d", "e"];
    const game = startGame(l, rooms); // nothing has ticked: the reveal is up
    takeOverWithPerson(game, l, 1, 3);
    expect(l.people[3]?.played).toEqual([]);
    markPlayed(game, l);
    expect(l.people[3]?.played).toEqual([game.roles[1]]); // once, not twice
  });

  it("records that they played the role, so the rotation counts it", () => {
    const { l, game } = afterLeave();
    takeOverWithPerson(game, l, 1, 3);
    expect(l.people[3]?.played).toEqual([game.roles[1]]);
    expect(game.heistPeople.has("d")).toBe(true);
  });

  it("is ready for nobody but the others: the one pulled in must press Ready, the rest keep theirs", () => {
    const { l, game } = afterLeave();
    takeOverWithPerson(game, l, 1, 3);
    expect([...game.ready].sort()).toEqual([0, 2]);
  });

  it("holds the game until they are ready: paused for that seat, which is not a countdown", () => {
    const { l, game } = afterLeave();
    takeOverWithPerson(game, l, 1, 3);
    expect(game.paused).toMatchObject({ seat: 1, choosing: false, forReady: true });
    expect(Number.isFinite(game.paused?.deadline)).toBe(true); // it goes over the wire as a number
    expect(tickGame(game).views.size).toBe(0); // nothing moves while they get ready
  });

  it("goes on when the pulled-in person is ready", () => {
    const { l, game } = afterLeave();
    takeOverWithPerson(game, l, 1, 3);
    expect(readyAgain(game, 1)).toBe(true);
    expect(game.paused).toBeNull();
    expect(game.ready.has(1)).toBe(true);
    expect(tickGame(game).views.size).toBe(3);
  });

  it("does not go on for anyone else's ready, or for a pause that waits for a dropped connection", () => {
    const { l, game } = afterLeave();
    takeOverWithPerson(game, l, 1, 3);
    expect(readyAgain(game, 0)).toBe(false);
    expect(game.paused).not.toBeNull();
    const other = lobby("a", "b", "c");
    const g2 = startGame(other, rooms);
    pauseFor(g2, 2, 0); // a dropped connection, not a wait for Ready
    expect(readyAgain(g2, 2)).toBe(false);
    expect(g2.paused).not.toBeNull();
  });

  it("refuses someone who is not sitting out, or a seat that is not empty", () => {
    const { l, game } = afterLeave();
    expect(takeOverWithPerson(game, l, 1, 0)).toBe(false); // Ana is playing
    expect(takeOverWithPerson(game, l, 1, 9)).toBe(false); // nobody
    expect(l.seats[1]?.who).toBe("b");
  });

  it("starts the bots afresh: who is a person has changed", () => {
    const l = lobby("a", "b", "c", "d", "e");
    l.seats = [seat("a", 0), bot("Jinx"), seat("c", 2)];
    l.sittingOut = ["d", "e"];
    const game = startGame(l, rooms);
    const before = game.bots[1]?.memory;
    takeOverWithPerson(game, l, 1, 3);
    expect(game.bots[1]).toBeUndefined();
    expect(before).toBeDefined();
  });
});

describe("unready", () => {
  it("takes a person's seat out of the ready set while the reveal is up", () => {
    const l = lobby("a", "b", "c");
    const game = startGame(l, rooms);
    game.ready.add(0);
    game.ready.add(1);
    expect(unready(game, 0)).toBe(true);
    expect([...game.ready]).toEqual([1]);
  });

  it("does nothing for a bot, who is always ready", () => {
    const game = startGame(withBots("a", 1, 2), rooms);
    expect(unready(game, 1)).toBe(false);
    expect(game.ready.has(1)).toBe(true);
  });

  it("does nothing once the room has started (its crew has played it)", () => {
    const l = lobby("a", "b", "c");
    const game = startGame(l, rooms);
    for (const s of [0, 1, 2] as const) game.ready.add(s);
    markPlayed(game, l);
    expect(unready(game, 0)).toBe(false);
    expect(game.ready.has(0)).toBe(true);
  });

  it("does nothing for a seat that was not ready", () => {
    const game = startGame(lobby("a", "b", "c"), rooms);
    expect(unready(game, 2)).toBe(false);
  });
});

describe("the comms map's counts", () => {
  it("counts a message once on each direction it reached: two callouts from seat 1 reach 0 and 2", () => {
    const comms = {};
    countComms(comms, 1, [0, 2], "callout");
    countComms(comms, 1, [0, 2], "callout");
    expect(comms).toEqual({ "1>0": { callout: 2 }, "1>2": { callout: 2 } });
    expect(commsEdges(comms)).toEqual([
      { from: 1, to: 0, count: 2, by: { callout: 2 } },
      { from: 1, to: 2, count: 2, by: { callout: 2 } },
    ]);
  });

  it("counts voice as time: each frame is 60 ms, however the person talks (toggle or push)", () => {
    const game = startGame(lobby("a", "b", "c"), rooms);
    for (let i = 0; i < 50; i++) countVoice(game, 1, [2]); // 50 frames: 3 s, with no gap to tell spurts apart
    expect(commsEdges(game.comms)).toEqual([{ from: 1, to: 2, count: 0, by: {}, voiceMs: 3000 }]);
    countComms(game.comms, 1, [2], "text");
    expect(commsEdges(game.comms)).toEqual([
      { from: 1, to: 2, count: 1, by: { text: 1 }, voiceMs: 3000 },
    ]);
  });

  it("counts what a person sends through relay, and only to the seats it reached", () => {
    const l = lobby("a", "b", "c");
    const game = startGame(l, rooms);
    const deaf = game.roles.indexOf("deaf") as Seat;
    const blind = game.roles.indexOf("blind") as Seat;
    const mute = game.roles.indexOf("mute") as Seat;
    relay(game, l, deaf, { method: "callout", callout: "wait" }, 1_000);
    // a refused send is not a delivery
    relay(game, l, mute, { method: "callout", callout: "wait" }, 1_000);
    expect(game.comms).toEqual({
      [`${deaf}>${blind}`]: { callout: 1 },
      [`${deaf}>${mute}`]: { callout: 1 },
    });
  });

  it("counts what the bots send, the same as a person's", () => {
    const l = withBots("a", 1, 2);
    const game = startGame(l, rooms);
    let sent = 0;
    for (let i = 0; i < 400 && sent === 0; i++) {
      sent += tickGame(game, new Set(), 1_000 + i * 50).sent.length;
    }
    expect(sent).toBeGreaterThan(0);
    expect(commsEdges(game.comms).reduce((n, e) => n + e.count, 0)).toBeGreaterThan(0);
    for (const edge of commsEdges(game.comms)) expect([1, 2]).toContain(edge.from);
  });

  it("starts again from nothing in the next room, and on a restart", () => {
    const l = lobby("a", "b", "c");
    const game = startGame(l, rooms);
    countComms(game.comms, 0, [1], "text");
    countVoice(game, 1, [2]);
    game.world.status = "cleared";
    advanceRoom(game, l, rooms);
    expect(game.comms).toEqual({});
    countVoice(game, 1, [2]); // a new room counts from nothing
    expect(commsEdges(game.comms)).toEqual([{ from: 1, to: 2, count: 0, by: {}, voiceMs: 60 }]);
    restartGame(game);
    expect(game.comms).toEqual({});
  });
});

describe("autopilot (playtest only, ADR 0027)", () => {
  let l: LobbyState;
  const started = () => {
    l = lobby("a", "b", "c");
    const game = startGame(l, rooms);
    for (const s of [0, 1, 2] as const) game.ready.add(s);
    return game;
  };

  it("hands a person's seat to a bot: it walks with no input from outside, and everyone stays ready", () => {
    const game = started();
    const before = { ...game.world.players[1].pos };
    expect(setAutopilot(game, l, 1, true)).toBe(true);
    expect(autopilotOn(game, 1)).toBe(true);
    for (let i = 0; i < 40; i++) tickGame(game, new Set(), i * 50);
    expect(game.world.players[1].pos).not.toEqual(before);
    expect([...game.ready].sort()).toEqual([0, 1, 2]);
  });

  it("drops the held key, and a second toggle the same way is no change", () => {
    const game = started();
    applyInput(game, 1, { seq: 4, move: { x: 1, y: 0 }, act: false });
    setAutopilot(game, l, 1, true);
    expect(game.inputs[1]).toBeUndefined();
    expect(setAutopilot(game, l, 1, true)).toBe(false);
  });

  it("gives the seat back when switched off", () => {
    const game = started();
    setAutopilot(game, l, 1, true);
    expect(setAutopilot(game, l, 1, false)).toBe(true);
    expect(game.bots[1]).toBeUndefined();
    expect(autopilotOn(game, 1)).toBe(false);
  });

  it("ends when the room advances", () => {
    const game = started();
    setAutopilot(game, l, 1, true);
    game.world.status = "cleared";
    advanceRoom(game, l, rooms);
    expect(game.autopilot.size).toBe(0);
    expect(game.bots).toEqual({});
  });

  it("ends on a restart, and the lobby's own bots stay", () => {
    const bl = withBots("a", 2); // seat 2 a lobby bot
    const game = startGame(bl, rooms);
    for (const s of [0, 1, 2] as const) game.ready.add(s);
    setAutopilot(game, bl, 1, true);
    restartGame(game);
    expect(game.bots[1]).toBeUndefined();
    expect(autopilotOn(game, 1)).toBe(false);
    expect(game.bots[2]).toBeDefined();
    expect(setAutopilot(game, bl, 1, true)).toBe(true);
  });

  it("an autopilot seat is not a person to the other bots", () => {
    const game = started();
    setAutopilot(game, l, 1, true);
    setAutopilot(game, l, 2, true);
    expect(game.bots[2]?.memory.humans.has(1)).toBe(false);
    expect(game.bots[1]?.memory.humans.has(0)).toBe(true);
  });
});

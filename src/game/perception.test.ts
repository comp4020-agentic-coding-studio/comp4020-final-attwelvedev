import { describe, expect, it } from "vitest";
import { visiblePolygon } from "./cone.ts";
import { inLight, lightPolygon } from "./light.ts";
import { spectatorView, viewFor } from "./perception.ts";
import { type RoomObject, secretDoors } from "./rooms/format.ts";
import { loadRooms } from "./rooms/load.ts";
import { brailleCells, plateNumber } from "./sim/braille.ts";
import { syncCacheDoors } from "./sim/cache.ts";
import { tuneGroups } from "./sim/chimes.ts";
import { cameraApex, cameraCone, caughtBy } from "./sim/hazards.ts";
import { blocksSight } from "./sim/sight.ts";
import { stationParts } from "./sim/stations.ts";
import { step } from "./sim/step.ts";
import { gather, place, tap, withChamber, worldFrom, worldWith } from "./sim/testing.ts";
import { decodeSeen } from "./sim/visibility.ts";
import { createWorld, TICK_MS } from "./sim/world.ts";

const GRID = [
  "##############################",
  "#1...........................#",
  "#2.....p.....................#",
  "#3...........................#",
  "##############################",
];

const world = () => worldFrom(GRID, ["p1"]);

describe("viewFor: what each role is told", () => {
  it("blind: no tiles, no entities, no own position, even on a full view", () => {
    const view = viewFor(world(), 0, "blind", true);
    expect(view.tiles).toBeUndefined();
    expect(view.entities).toEqual([]);
    expect(view.you.pos).toBeUndefined();
    expect(view.full).toBe(true);
    expect(JSON.stringify(view)).not.toContain("#");
  });

  it("deaf and mute: tiles only on a full view, and entities and own position always", () => {
    for (const role of ["deaf", "mute"] as const) {
      const full = viewFor(world(), 1, role, true);
      expect(full.tiles).toHaveLength(5);
      const quick = viewFor(world(), 1, role, false);
      expect(quick.tiles).toBeUndefined();
      expect(quick.you.pos).toEqual({ x: 1.5, y: 2.5 });
      const kinds = new Set(quick.entities.map((e) => e.kind));
      expect(kinds).toEqual(new Set(["player", "plate"]));
      expect(quick.entities.filter((e) => e.kind === "player")).toHaveLength(3);
    }
  });

  it("deaf: no sounds, even with others walking next to them", () => {
    const w = world();
    step(w, { 0: { seq: 1, move: { x: 1, y: 0 }, act: false } }, TICK_MS);
    expect(viewFor(w, 1, "deaf", false).sounds).toEqual([]);
  });

  it("mute and blind hear footsteps, panned toward the source", () => {
    const w = world();
    place(w, 0, { x: 10, y: 1 });
    place(w, 1, { x: 5, y: 1 });
    place(w, 2, { x: 20, y: 1 });
    w.players[1].moving = true;
    const left = viewFor(w, 0, "blind", false).sounds.filter((s) => s.kind === "footsteps");
    expect(left).toHaveLength(1);
    expect(left[0]?.pan).toBeLessThan(0);
    expect(left[0]?.gain).toBeGreaterThan(0);
    expect(viewFor(w, 0, "mute", false).sounds.some((s) => s.kind === "footsteps")).toBe(true);
    w.players[1].moving = false;
    w.players[2].moving = true; // 10 tiles to the right of seat 0
    const right = viewFor(w, 0, "blind", false).sounds.filter((s) => s.kind === "footsteps");
    expect(right[0]?.pan).toBeGreaterThan(0);
  });

  it("pan is (dx / 8) clamped, gain falls to 0 at 12 tiles", () => {
    const w = world();
    place(w, 0, { x: 1, y: 1 });
    place(w, 1, { x: 5, y: 1 }); // 4 tiles right
    w.players[1].moving = true;
    const near = viewFor(w, 0, "blind", false).sounds[0];
    expect(near?.pan).toBeCloseTo(0.5, 6);
    expect(near?.gain).toBeCloseTo(1 - 4 / 12, 6);
    place(w, 1, { x: 13, y: 1 }); // 12 tiles right
    expect(viewFor(w, 0, "blind", false).sounds).toEqual([]);
  });

  it("plays blind and mute their own steps: centred, and a different cue from other players'", () => {
    const w = world();
    w.players[0].moving = true;
    for (const role of ["blind", "mute"] as const) {
      const own = viewFor(w, 0, role, false).sounds;
      expect(own).toHaveLength(1);
      expect(own[0]).toMatchObject({ kind: "step", pan: 0 });
      expect(own[0]?.gain).toBeGreaterThan(0);
    }
    // deaf hears nothing, their own steps included
    expect(viewFor(w, 0, "deaf", false).sounds).toEqual([]);
  });

  it("tells your own steps from someone else's: theirs keep the footsteps cue, panned", () => {
    const w = world();
    place(w, 0, { x: 10, y: 1 });
    place(w, 1, { x: 6, y: 1 });
    w.players[0].moving = true;
    w.players[1].moving = true;
    const kinds = viewFor(w, 0, "blind", false).sounds.map((s) => s.kind);
    expect(kinds.sort()).toEqual(["footsteps", "step"]);
    const theirs = viewFor(w, 0, "blind", false).sounds.find((s) => s.kind === "footsteps");
    expect(theirs?.pan).toBeLessThan(0);
  });

  it("bumps instead of stepping while you push at something, and only you hear it", () => {
    const w = world();
    place(w, 0, { x: 10, y: 1 });
    place(w, 1, { x: 6, y: 1 });
    w.players[0].moving = true;
    w.players[0].blocked = true;
    const own = viewFor(w, 0, "blind", false).sounds;
    expect(own).toEqual([{ kind: "bump", pan: 0, gain: expect.any(Number) }]);
    // nobody else hears the bump, and a player stuck against a wall makes no footsteps
    expect(viewFor(w, 1, "blind", false).sounds).toEqual([]);
  });

  it("hums for the blind player only while standing on a plate", () => {
    const w = world();
    expect(viewFor(w, 0, "blind", false).sounds.some((s) => s.kind === "hum")).toBe(false);
    place(w, 0, { x: 7, y: 2 });
    const hum = viewFor(w, 0, "blind", false).sounds.filter((s) => s.kind === "hum");
    expect(hum).toHaveLength(1);
    expect(hum[0]?.pan).toBe(0);
  });

  it("gives a directional sound the unit vector to its source, rounded to 0.01", () => {
    const w = worldFrom(
      ["##########", "#1.pD...E#", "#2..D...E#", "#3..D...E#", "##########"],
      ["p1"],
    );
    place(w, 0, { x: 3, y: 1 });
    place(w, 1, { x: 2.5, y: 3.5 }); // the door opens to the east and north of this seat
    step(w, {}, TICK_MS);
    const click = viewFor(w, 1, "blind", false).sounds.find((s) => s.kind === "door");
    expect(click?.dir?.x).toBeGreaterThan(0);
    expect(click?.dir?.y).toBeLessThan(0);
    const { x, y } = click?.dir ?? { x: 0, y: 0 };
    expect(Math.hypot(x, y)).toBeCloseTo(1, 1);
    expect(Math.round(x * 100) / 100).toBe(x);
    // your own steps and the team-wide sounds point nowhere
    const own = viewFor(w, 0, "blind", false).sounds.filter((s) => s.kind === "step");
    for (const o of own) expect(o.dir).toBeUndefined();
  });

  it("clicks when a door opens, panned from the door", () => {
    const w = worldFrom(
      ["##########", "#1.pD...E#", "#2..D...E#", "#3..D...E#", "##########"],
      ["p1"],
    );
    place(w, 0, { x: 3, y: 1 });
    step(w, {}, TICK_MS);
    const click = viewFor(w, 1, "blind", false).sounds.filter((s) => s.kind === "door");
    expect(click).toHaveLength(1);
    expect(click[0]?.pan).toBeGreaterThan(0);
    step(w, {}, TICK_MS); // events last one tick
    expect(viewFor(w, 1, "blind", false).sounds.some((s) => s.kind === "door")).toBe(false);
  });

  it("carries tick, ack, room, role, status and elapsed time", () => {
    const w = world();
    step(w, { 2: { seq: 9, move: { x: 0, y: 0 }, act: false } }, TICK_MS);
    const view = viewFor(w, 2, "mute", false);
    expect(view).toMatchObject({ tick: 1, ack: 9, room: "t", role: "mute", status: "playing" });
    expect(view.elapsedMs).toBe(TICK_MS);
    expect(view.you.seat).toBe(2);
  });

  it("tells every role, and a spectator, how much loot the team has taken (a team-wide count)", () => {
    const grid = GRID.map((r, y) => (y === 2 ? "#2.....$....K.................#" : r));
    const w = worldWith(grid);
    for (const role of ["blind", "deaf", "mute"] as const)
      expect(viewFor(w, 0, role, false).loot).toBe(0);
    place(w, 1, { x: 7, y: 2 });
    step(w, {}, TICK_MS);
    expect(w.loot).toBeGreaterThan(0);
    for (const role of ["blind", "deaf", "mute"] as const) {
      expect(viewFor(w, 0, role, false).loot).toBe(w.loot);
    }
    expect(spectatorView(w, null, ["blind", "deaf", "mute"], false).loot).toBe(w.loot);
  });

  it("blind gets no entities even when an object lists blind in visibleTo", () => {
    const w = world();
    w.room.objects.find((o) => o.id === "p1")?.visibleTo.push("blind");
    expect(viewFor(w, 0, "blind", false).entities).toEqual([]); // blind still sees nothing
  });
});

describe("viewFor: movement cues (FR31)", () => {
  it("tells every role, blind included, whether its own seat is moving or blocked", () => {
    for (const role of ["blind", "deaf", "mute"] as const) {
      const w = world();
      expect(viewFor(w, 0, role, false).you.motion).toEqual({ moving: false, blocked: false });
      w.players[0].moving = true;
      expect(viewFor(w, 0, role, false).you.motion).toEqual({ moving: true, blocked: false });
      w.players[0].blocked = true;
      expect(viewFor(w, 0, role, false).you.motion).toEqual({ moving: true, blocked: true });
    }
  });

  it("gives the blind seat nothing else new: still no tiles, entities or position", () => {
    const w = world();
    w.players[0].moving = true;
    const view = viewFor(w, 0, "blind", true);
    expect(view.tiles).toBeUndefined();
    expect(view.entities).toEqual([]);
    expect(view.you).toEqual({ seat: 0, motion: { moving: true, blocked: false } });
  });

  it("reads only this seat's own state: another player's walking is not in your motion", () => {
    const w = world();
    w.players[1].moving = true;
    w.players[1].blocked = true;
    expect(viewFor(w, 0, "blind", false).you.motion).toEqual({ moving: false, blocked: false });
  });

  it("puts moving, blocked and facing on every player in a sighted view, still or not", () => {
    const w = world();
    gather(w, { x: 5, y: 2 });
    w.players[1].facing = { x: 0, y: -1 };
    w.players[2].moving = true;
    w.players[2].blocked = true;
    w.players[2].facing = { x: -1, y: 0 };
    for (const role of ["deaf", "mute"] as const) {
      const players = viewFor(w, 0, role, false).entities.filter((e) => e.kind === "player");
      const by = (seat: number) => players.find((e) => e.seat === seat);
      expect(by(1)).toMatchObject({ moving: false, blocked: false, facing: { x: 0, y: -1 } });
      expect(by(2)).toMatchObject({ moving: true, blocked: true, facing: { x: -1, y: 0 } });
    }
  });

  it("sends the same to a watcher", () => {
    const w = world();
    gather(w, { x: 5, y: 2 });
    w.players[1].moving = true;
    const me = spectatorView(w, 0, ["blind", "deaf", "mute"], false).entities.find(
      (e) => e.kind === "player" && e.seat === 1,
    );
    expect(me).toMatchObject({ moving: true, blocked: false });
  });
});

describe("viewFor: hazards", () => {
  const GRID = [
    "########################",
    "#1....C.......G....h...#",
    "#2....L.S........K.$...#",
    "#3.....................#",
    "########################",
  ];
  const OBJECTS = {
    C1: { facingDeg: 0, fovDeg: 90, range: 8, periodS: 6, watchingS: 3, offsetS: 0 },
    L1: { dir: "right", onS: 2, offS: 2, offsetS: 0 },
    G1: { sightTiles: 6, fovDeg: 70, speedTps: 1.5 },
    S1: { shows: ["p1"] },
  };
  const hazardWorld = () => worldWith(GRID, OBJECTS);
  const kinds = (view: ReturnType<typeof viewFor>) => view.entities.map((e) => e.kind);

  it("blind is told of no guard, camera, laser, hide spot, checkpoint, loot or sign", () => {
    const view = viewFor(hazardWorld(), 0, "blind", true);
    expect(view.entities).toEqual([]);
    expect(JSON.stringify(view)).not.toMatch(/cone|zone|beam|shows/);
  });

  it("deaf and mute get them, with the cones and beam to draw", () => {
    for (const role of ["deaf", "mute"] as const) {
      const view = viewFor(hazardWorld(), 1, role, false);
      for (const kind of ["guard", "camera", "laser", "hide", "checkpoint", "loot", "sign"]) {
        expect(kinds(view)).toContain(kind);
      }
      expect(view.entities.find((e) => e.kind === "guard")?.cone).toEqual({
        fovDeg: 70,
        range: 6,
      });
      expect(view.entities.find((e) => e.kind === "camera")?.cone).toEqual({
        fovDeg: 90,
        range: 8,
        from: { x: 6, y: 1.5 }, // it faces east from tile (6, 1), so it sees from that tile's west edge
      });
      expect(view.entities.find((e) => e.kind === "camera")?.facing?.x).toBeCloseTo(1, 6); // looking east
      const laser = view.entities.find((e) => e.kind === "laser");
      expect(laser?.beam?.length).toBeGreaterThan(5);
      expect(laser?.state).toBe("on");
      expect(view.entities.find((e) => e.kind === "sign")?.shows).toEqual(["p1"]);
    }
  });

  it("shows a camera as watching or idle and a laser as on or off", () => {
    const world = hazardWorld();
    world.tick = 70; // 3.5 s: camera idle, laser off
    const view = viewFor(world, 1, "deaf", false);
    expect(view.entities.find((e) => e.kind === "camera")?.state).toBe("idle");
    expect(view.entities.find((e) => e.kind === "laser")?.state).toBe("off");
  });

  it("stops sending loot once it is taken and marks a reached checkpoint", () => {
    // no guard or laser here: this checks what is sent, not who gets caught
    const world = worldWith(
      GRID.map((r) => r.replace(/[GL]/g, ".")),
      OBJECTS,
    );
    place(world, 0, { x: 19, y: 2 });
    step(world, {}, TICK_MS);
    expect(kinds(viewFor(world, 1, "deaf", false))).not.toContain("loot");
    const flag = () =>
      viewFor(world, 1, "deaf", false).entities.find((e) => e.kind === "checkpoint");
    place(world, 0, { x: 17, y: 2 });
    step(world, {}, TICK_MS);
    expect(flag()).toMatchObject({ state: "up", present: 1 }); // one of three is there
    gather(world, { x: 17, y: 2 });
    step(world, {}, TICK_MS);
    expect(flag()?.state).toBe("reached");
  });

  it("sends a moving guard's position and facing, never to blind", () => {
    const world = worldWith(GRID, {
      ...OBJECTS,
      G1: {
        ...OBJECTS.G1,
        patrol: [
          [14, 1],
          [18, 1],
        ],
      },
    });
    step(world, {}, TICK_MS);
    const guard = viewFor(world, 1, "mute", false).entities.find((e) => e.kind === "guard");
    expect(guard?.pos.x).toBeGreaterThan(14.5);
    expect(guard?.facing).toEqual({ x: 1, y: 0 });
    expect(JSON.stringify(viewFor(world, 0, "blind", true))).not.toContain("guard");
  });
});

describe("viewFor: environment flips", () => {
  const GRID = [
    "########################",
    "#1.....................#",
    "#2.....................#",
    "#3.....................#",
    "########################",
  ];
  const DARK = { flips: [{ kind: "dark", zone: [10, 1, 14, 3] }] };
  const ids = (view: ReturnType<typeof viewFor>) => view.entities.map((e) => e.id);

  it("deaf inside a dark zone: nothing in it is sent but their own dim ring, and dark is true", () => {
    const world = worldWith(GRID, {}, DARK);
    place(world, 0, { x: 3, y: 1 });
    place(world, 1, { x: 12, y: 2 });
    place(world, 2, { x: 11, y: 3 });
    const view = viewFor(world, 1, "deaf", true);
    expect(view.dark).toBe(true);
    expect(ids(view)).toContain("P0");
    expect(ids(view)).not.toContain("P2");
    expect(view.entities.find((e) => e.id === "P1")?.state).toBe("dim");
    expect(view.tiles?.slice(1, 4).every((row) => row.slice(10, 15) === "     ")).toBe(true);
    expect(view.tiles?.[0]).toBe("#".repeat(24));
  });

  it("mute outside the zone still gets nothing from inside it", () => {
    const world = worldWith(GRID, {}, DARK);
    place(world, 0, { x: 3, y: 1 });
    place(world, 1, { x: 12, y: 2 });
    place(world, 2, { x: 11, y: 3 });
    const view = viewFor(world, 0, "mute", false);
    expect(view.dark).toBe(false);
    expect(ids(view)).toEqual(["P0"]);
  });

  describe("a hazard's sight reaching out of the dark", () => {
    // a guard standing in the dark zone (x 10-14) looking east: its cone reaches x = 18
    const ROW = "#2.........G..........#";
    const GRID_G = GRID.map((r, y) => (y === 2 ? ROW : r));
    const GUARD = {
      G1: {
        sightTiles: 6,
        fovDeg: 70,
        speedTps: 0,
        patrol: [
          [11, 2],
          [20, 2],
        ],
      },
    };
    const inZone = (p: { x: number; y: number }) => p.x >= 10 && p.x < 15 && p.y >= 1 && p.y < 4;

    const inside = (p: { x: number; y: number }) =>
      p.x > 10 + 1e-6 && p.x < 15 - 1e-6 && p.y > 1 + 1e-6 && p.y < 4 - 1e-6;
    const within = (poly: { x: number; y: number }[], at: { x: number; y: number }) => {
      let hit = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [a, b] = [poly[i], poly[j]] as [typeof at, typeof at];
        if (a.y > at.y !== b.y > at.y && at.x < ((b.x - a.x) * (at.y - a.y)) / (b.y - a.y) + a.x) {
          hit = !hit;
        }
      }
      return hit;
    };

    it("shows the part of the guard's cone that is in the light, and not the guard or where it stands", () => {
      const world = worldWith(GRID_G, GUARD, DARK);
      place(world, 0, { x: 3, y: 1 });
      const view = viewFor(world, 0, "mute", false);
      expect(view.entities.some((e) => e.kind === "guard")).toBe(false);
      const sight = view.entities.find((e) => e.kind === "sight");
      expect(sight?.polys?.length).toBeGreaterThan(0);
      // nothing of it inside the dark: no corner, and no entity position
      for (const poly of sight?.polys ?? []) for (const p of poly) expect(inside(p)).toBe(false);
      for (const e of view.entities) expect(inZone(e.pos)).toBe(false);
      // and it is the real cone: lit just east of the dark along the guard's row, dark
      // behind the guard, and not past its range (the cone ends 6 tiles from x = 11.5)
      const polys = sight?.polys ?? [];
      const lit = (x: number, y: number) => polys.some((poly) => within(poly, { x, y }));
      expect(lit(16.5, 2.5)).toBe(true);
      expect(lit(18.5, 2.5)).toBe(false); // past its range
      expect(lit(7.5, 2.5)).toBe(false); // behind the guard
    });

    it("sends the same to Can't hear, and nothing to Can't see, who have no map to draw on", () => {
      const world = worldWith(GRID_G, GUARD, DARK);
      place(world, 0, { x: 3, y: 1 });
      expect(viewFor(world, 1, "deaf", false).entities.some((e) => e.kind === "sight")).toBe(true);
      expect(viewFor(world, 2, "blind", false).entities).toEqual([]);
    });

    it("sends the guard itself, as ever, once it is out in the light", () => {
      const lit = GRID.map((r, y) => (y === 2 ? "#2.................G...#" : r));
      const out = {
        G1: {
          ...GUARD.G1,
          patrol: [
            [19, 2],
            [21, 2],
          ],
        },
      };
      const world = worldWith(lit, out, DARK);
      place(world, 0, { x: 3, y: 1 });
      const view = viewFor(world, 0, "mute", false);
      expect(view.entities.some((e) => e.kind === "guard")).toBe(true);
      expect(view.entities.some((e) => e.kind === "sight")).toBe(false);
    });

    it("leaves out a cone that does not reach the light", () => {
      const short = { G1: { ...GUARD.G1, sightTiles: 2 } };
      const world = worldWith(GRID_G, short, DARK);
      place(world, 0, { x: 3, y: 1 });
      expect(viewFor(world, 0, "mute", false).entities.some((e) => e.kind === "sight")).toBe(false);
    });
  });

  it("blind's cues are the same with or without darkness", () => {
    const lit = worldWith(GRID);
    const dark = worldWith(GRID, {}, DARK);
    for (const w of [lit, dark]) {
      place(w, 0, { x: 3, y: 1 });
      place(w, 1, { x: 12, y: 2 });
      w.players[1].moving = true;
    }
    expect(viewFor(dark, 0, "blind", true).sounds).toEqual(viewFor(lit, 0, "blind", true).sounds);
    expect(viewFor(dark, 0, "blind", true).dark).toBe(false);
  });

  describe("the alarm", () => {
    const ALARM = { flips: [{ kind: "alarm", trigger: "p1", durationS: 8 }] };
    const PLATE = GRID.map((r, y) => (y === 2 ? "#2.....p...............#" : r));
    const alarmed = () => {
      const world = worldWith(PLATE, {}, ALARM);
      place(world, 0, { x: 7, y: 2 }); // the plate
      step(world, {}, TICK_MS);
      place(world, 0, { x: 3, y: 2 });
      return world;
    };

    it("blind and mute hear only the alarm; deaf hears nothing and sees it", () => {
      const world = alarmed();
      world.players[2].moving = true;
      for (const role of ["blind", "mute"] as const) {
        const view = viewFor(world, 0, role, false);
        expect(view.sounds).toEqual([{ kind: "alarm", pan: 0, gain: 1 }]);
      }
      expect(viewFor(world, 1, "deaf", false).sounds).toEqual([]);
      expect(viewFor(world, 1, "deaf", false).alarm).toBe(true);
      expect(viewFor(world, 0, "mute", false).alarm).toBe(true);
      expect(viewFor(world, 0, "blind", false).alarm).toBe(false);
    });

    it("ends after durationS, and cues come back", () => {
      const world = alarmed();
      for (let i = 0; i < 8 * 20; i++) step(world, {}, TICK_MS);
      world.players[2].moving = true;
      const view = viewFor(world, 0, "blind", false);
      expect(view.alarm).toBe(false);
      expect(view.sounds.some((s) => s.kind === "footsteps")).toBe(true);
    });

    it("is cleared when the team is caught: the retry starts clean", () => {
      const grid = PLATE.map((r, y) => (y === 1 ? `${r.slice(0, 9)}C${r.slice(10)}` : r));
      const world = worldWith(
        grid,
        { C1: { facingDeg: 0, fovDeg: 90, range: 8, periodS: 6, watchingS: 3, offsetS: 0 } },
        ALARM,
      );
      place(world, 0, { x: 7, y: 2 }); // the plate: alarm on
      step(world, {}, TICK_MS);
      expect(viewFor(world, 0, "mute", false).alarm).toBe(true);
      place(world, 0, { x: 3, y: 2 });
      place(world, 1, { x: 12, y: 2 }); // into the watched zone
      step(world, {}, TICK_MS);
      expect(world.events.some((e) => e.kind === "caught")).toBe(true);
      expect(viewFor(world, 0, "mute", false).alarm).toBe(false);
      expect(viewFor(world, 0, "blind", false).sounds.some((s) => s.kind === "alarm")).toBe(false);
    });

    it("makes cameras watch non-stop while it is on", () => {
      const grid = PLATE.map((r, y) => (y === 1 ? `${r.slice(0, 9)}C${r.slice(10)}` : r));
      const objects = {
        C1: { facingDeg: 0, fovDeg: 90, range: 8, periodS: 6, watchingS: 3, offsetS: 0 },
      };
      const world = worldWith(grid, objects, ALARM);
      world.tick = 70; // 3.5 s: the camera is idle
      place(world, 1, { x: 12, y: 2 });
      expect(caughtBy(world)).toBeNull();
      expect(
        viewFor(world, 1, "deaf", false).entities.find((e) => e.kind === "camera")?.state,
      ).toBe("idle");
      world.alarmUntil = world.tick + 100;
      expect(caughtBy(world)).toBe("C1");
      expect(
        viewFor(world, 1, "deaf", false).entities.find((e) => e.kind === "camera")?.state,
      ).toBe("watching");
    });

    it("makes guards walk half as fast again while it is on", () => {
      const grid = GRID.map((r, y) => (y === 2 ? `${r.slice(0, 5)}G${r.slice(6)}` : r));
      const patrolled = {
        G1: {
          patrol: [
            [5, 2],
            [20, 2],
          ],
          speedTps: 1.5,
          sightTiles: 1,
          fovDeg: 10,
        },
      };
      const calm = worldWith(grid, patrolled, ALARM);
      const loud = worldWith(grid, patrolled, ALARM);
      loud.alarmUntil = 1000;
      for (let i = 0; i < 20; i++) {
        step(calm, {}, TICK_MS);
        step(loud, {}, TICK_MS);
      }
      expect((calm.guards[0]?.pos.x ?? 0) - 5.5).toBeCloseTo(1.5, 1); // 1 s at 1.5 tiles/s
      expect((loud.guards[0]?.pos.x ?? 0) - 5.5).toBeCloseTo(2.25, 1); // 1.5 times that
    });
  });
});

describe("viewFor: audio cues for blind and mute", () => {
  const GRID = [
    "##############################",
    "#1............................#",
    "#2............................#",
    "#3............................#",
    "##############################",
  ];
  const patrol = (x: number) => ({
    patrol: [
      [x, 2],
      [x, 3],
    ],
    speedTps: 1.5,
    sightTiles: 6,
    fovDeg: 70,
  });

  it("pans a near guard left of the listener and louder than a far one", () => {
    const grid = GRID.map((r, y) =>
      y === 2 ? `${"#2.........G"}${".".repeat(12)}G${"....#"}` : r,
    );
    const world = worldWith(grid, { G1: patrol(11), G2: patrol(24) });
    place(world, 0, { x: 14, y: 2 });
    for (const g of world.guards) g.moving = true; // walking, so they make footsteps
    const guards = viewFor(world, 0, "blind", false).sounds.filter((s) => s.kind === "guard");
    expect(guards).toHaveLength(2);
    const [near, far] = guards.sort((a, b) => b.gain - a.gain) as [
      (typeof guards)[0],
      (typeof guards)[0],
    ];
    expect(near.pan).toBeLessThan(0);
    expect(near.gain).toBeGreaterThan(far.gain);
  });

  it("hums within 3 tiles of a laser that is on, and not beyond or while off", () => {
    const grid = GRID.map((r, y) => (y === 1 ? "#1..L.........................#" : r));
    const world = worldWith(grid, { L1: { dir: "down", onS: 2, offS: 2, offsetS: 0 } });
    place(world, 0, { x: 6, y: 3 }); // 2 tiles from the beam's last tile
    const near = viewFor(world, 0, "mute", false).sounds.filter((s) => s.kind === "laser");
    expect(near).toHaveLength(1);
    expect(near[0]?.pan).toBeLessThan(0);
    place(world, 0, { x: 20, y: 3 });
    expect(viewFor(world, 0, "mute", false).sounds.some((s) => s.kind === "laser")).toBe(false);
    place(world, 0, { x: 6, y: 3 });
    world.tick = 45; // laser off
    expect(viewFor(world, 0, "mute", false).sounds.some((s) => s.kind === "laser")).toBe(false);
  });

  it("whirs on the tick a camera starts watching, once", () => {
    const grid = GRID.map((r, y) => (y === 1 ? "#1....C.......................#" : r));
    const world = worldWith(grid, {
      C1: { facingDeg: 0, fovDeg: 90, range: 8, periodS: 6, watchingS: 3, offsetS: 0 },
    });
    place(world, 0, { x: 3, y: 3 });
    world.tick = 120;
    expect(viewFor(world, 0, "blind", false).sounds.some((s) => s.kind === "camera")).toBe(true);
    world.tick = 121;
    expect(viewFor(world, 0, "blind", false).sounds.some((s) => s.kind === "camera")).toBe(false);
  });

  it("chimes for loot, a checkpoint and being caught, to the whole team", () => {
    const grid = GRID.map((r, y) => (y === 2 ? "#2.....$....K.................#" : r));
    const world = worldWith(grid);
    place(world, 1, { x: 7, y: 2 });
    step(world, {}, TICK_MS);
    expect(viewFor(world, 0, "blind", false).sounds.some((s) => s.kind === "loot")).toBe(true);
    gather(world, { x: 12, y: 2 });
    step(world, {}, TICK_MS);
    expect(viewFor(world, 0, "blind", false).sounds.some((s) => s.kind === "checkpoint")).toBe(
      true,
    );
  });
});

describe("viewFor: a sign tracks its sequence door", () => {
  const GRID = [
    "####################",
    "#1..p.p.p..#.......#",
    "#2.....S...D.....E.#",
    "#3.........#.......#",
    "####################",
  ];
  const objects = {
    D1: { mode: "sequence", opensWhen: ["p2", "p1", "p3"] },
    S1: { shows: ["p2", "p1", "p3"] },
  };
  const press = (world: ReturnType<typeof worldWith>, x: number) =>
    tap(world, 0, { x, y: 1 }, { x: 2, y: 1 });
  // a plate is held (FR11): the seat stays on it
  const holdOn = (world: ReturnType<typeof worldWith>, seat: 0 | 1 | 2, x: number) => {
    place(world, seat, { x, y: 1 });
    step(world, {}, TICK_MS);
  };
  const sign = (world: ReturnType<typeof worldWith>) =>
    viewFor(world, 1, "deaf", false).entities.find((e) => e.kind === "sign");

  it("starts with nothing done and no clock", () => {
    const view = sign(worldWith(GRID, objects));
    expect(view?.progress).toBe(0);
    expect(view?.window).toBeUndefined();
  });

  it("counts plates done in order, with the share of the 5 s window left", () => {
    const world = worldWith(GRID, objects);
    holdOn(world, 0, 6); // p2
    step(world, {}, TICK_MS); // a tap took two steps; keep the 1% the window has lost by now
    expect(sign(world)?.progress).toBe(1);
    expect(sign(world)?.window).toBeCloseTo(0.99, 2);
    for (let i = 0; i < 50; i++) step(world, {}, TICK_MS); // 2.5 s
    expect(sign(world)?.window).toBeCloseTo(0.49, 1);
  });

  it("clears when the window runs out or a wrong plate is pressed", () => {
    const world = worldWith(GRID, objects);
    press(world, 6);
    for (let i = 0; i < 105; i++) step(world, {}, TICK_MS); // past 5 s
    expect(sign(world)?.progress).toBe(0);
    expect(sign(world)?.window).toBeUndefined();
    press(world, 6);
    press(world, 8); // p3 before p1: wrong
    expect(sign(world)?.progress).toBe(0);
  });

  it("shows every plate done, and no clock, once the door has opened", () => {
    const world = worldWith(GRID, objects);
    holdOn(world, 0, 6);
    holdOn(world, 1, 4);
    holdOn(world, 2, 8);
    expect(sign(world)?.progress).toBe(3);
    expect(sign(world)?.window).toBeUndefined();
  });

  it("tells blind nothing: the sign is not sent", () => {
    const world = worldWith(GRID, objects);
    press(world, 6);
    expect(JSON.stringify(viewFor(world, 0, "blind", false))).not.toMatch(/progress|window|sign/);
  });
});

describe("viewFor: how far each kind of sound carries", () => {
  const GRID = [
    "##############################",
    "#1............................#",
    "#2............................#",
    "#3............................#",
    "##############################",
  ];
  const heard = (w: ReturnType<typeof worldWith>, kind: string) =>
    viewFor(w, 0, "blind", false).sounds.filter((s) => s.kind === kind);
  const far = (put: string) =>
    worldWith(GRID.map((r, y) => (y === 2 ? `#2${put.padEnd(27, ".")}#` : r)));

  it("a plate click is local: loud beside you, fainter further off, gone beyond 8 tiles", () => {
    const w = far("........p"); // the plate is at x = 10
    place(w, 0, { x: 9, y: 1 });
    place(w, 1, { x: 10, y: 2 });
    step(w, {}, TICK_MS);
    const near = heard(w, "plate")[0];
    expect(near?.gain).toBeGreaterThan(0.7);
    place(w, 0, { x: 5, y: 1 }); // 5 tiles away
    const mid = heard(w, "plate")[0];
    expect(mid?.gain).toBeGreaterThan(0);
    expect(mid?.gain).toBeLessThan(near?.gain ?? 0);
    place(w, 0, { x: 1, y: 1 }); // 9 tiles away
    expect(heard(w, "plate")).toEqual([]);
  });

  it("releasing a plate and hiding are local too, and only a few tiles", () => {
    const w = far("........p");
    place(w, 1, { x: 10, y: 2 });
    step(w, {}, TICK_MS);
    place(w, 1, { x: 15, y: 3 });
    step(w, {}, TICK_MS);
    place(w, 0, { x: 3, y: 1 });
    expect(heard(w, "plate-up")).toEqual([]);
    place(w, 0, { x: 13, y: 1 });
    expect(heard(w, "plate-up")).toHaveLength(1);
    const h = worldWith(GRID.map((r, y) => (y === 2 ? "#2.......h....................#" : r)));
    place(h, 1, { x: 9, y: 2 });
    step(h, {}, TICK_MS);
    place(h, 0, { x: 1, y: 1 });
    expect(heard(h, "hide")).toEqual([]);
  });

  it("team signals stay global: the flag, the exit, the loot and a cleared room carry the whole room", () => {
    const w = worldWith(GRID.map((r, y) => (y === 2 ? "#2.....K.........E.$..........#" : r)));
    place(w, 0, { x: 28, y: 1 });
    place(w, 1, { x: 7, y: 2 }); // by the flag, 21 tiles from seat 0
    step(w, {}, TICK_MS);
    expect(heard(w, "flag")).toHaveLength(1);
    expect(heard(w, "flag")[0]?.gain).toBe(1);
    place(w, 1, { x: 17, y: 2 });
    step(w, {}, TICK_MS);
    expect(heard(w, "exit")).toHaveLength(1);
    place(w, 1, { x: 19, y: 2 });
    step(w, {}, TICK_MS);
    expect(heard(w, "loot")).toHaveLength(1);
  });
});

describe("spectatorView: a full view regardless of the followed role", () => {
  it("following the blind seat still gets tiles, entities and that seat's sounds", () => {
    const w = world();
    place(w, 0, { x: 10, y: 1 });
    place(w, 1, { x: 5, y: 1 });
    w.players[1].moving = true;
    const view = spectatorView(w, 0, ["blind", "deaf", "mute"], true);
    expect(view.role).toBe("blind");
    expect(view.tiles).toHaveLength(5);
    expect(view.entities.filter((e) => e.kind === "player")).toHaveLength(3);
    expect(view.you).toEqual({ seat: 0, pos: { x: 10.5, y: 1.5 } });
    expect(view.sounds.some((s) => s.kind === "footsteps")).toBe(true);
  });

  it("following the deaf seat gets no sounds, the same as that seat would", () => {
    const w = world();
    step(w, { 0: { seq: 1, move: { x: 1, y: 0 }, act: false } }, TICK_MS);
    const view = spectatorView(w, 1, ["blind", "deaf", "mute"], false);
    expect(view.role).toBe("deaf");
    expect(view.sounds).toEqual([]);
  });

  it("never masks tiles or entities for a dark zone", () => {
    const GRID_DARK = [
      "########################",
      "#1.....................#",
      "#2.....................#",
      "#3.....................#",
      "########################",
    ];
    const DARK = { flips: [{ kind: "dark", zone: [10, 1, 14, 3] }] };
    const w = worldWith(GRID_DARK, {}, DARK);
    place(w, 0, { x: 3, y: 1 });
    place(w, 1, { x: 12, y: 2 }); // inside the dark zone
    const view = spectatorView(w, 0, ["blind", "deaf", "mute"], true);
    expect(view.dark).toBe(false);
    expect(view.entities.map((e) => e.id)).toContain("P1");
    expect(view.tiles?.[2]?.slice(10, 15)).not.toBe("     ");
  });
});

describe("spectatorView with nobody followed: the whole room, no sounds", () => {
  it("has the tiles and every player and object, but hears nothing", () => {
    const w = world();
    place(w, 0, { x: 10, y: 1 });
    place(w, 1, { x: 5, y: 1 });
    w.players[1].moving = true;
    w.alarmUntil = w.tick + 100; // the alarm is on
    const view = spectatorView(w, null, ["blind", "deaf", "mute"], true);
    expect(view.tiles).toHaveLength(5);
    expect(view.entities.filter((e) => e.kind === "player")).toHaveLength(3);
    expect(view.sounds).toEqual([]);
    expect(view.alarm).toBe(false);
    expect(view.dark).toBe(false);
  });

  it("shows what Can't hear would see, even when seat 0 is Can't see", () => {
    const w = world();
    const some = spectatorView(w, null, ["blind", "deaf", "mute"], true);
    const deaf = spectatorView(w, 1, ["blind", "deaf", "mute"], true);
    // the same things drawn; only the followed seat's own marker (`role`) can differ
    const ids = (v: ReturnType<typeof spectatorView>) => v.entities.map((e) => `${e.kind}:${e.id}`);
    expect(ids(some)).toEqual(ids(deaf));
    expect(some.entities.some((e) => e.kind === "player" && e.role !== undefined)).toBe(true);
  });

  it("points the camera at no one: no position for you", () => {
    const view = spectatorView(world(), null, ["blind", "deaf", "mute"], false);
    expect(view.you.pos).toBeUndefined();
  });
});

describe("viewFor: line of sight", () => {
  // A wall at x = 6; `mid` is the tile in the middle row that is under test.
  const split = (mid: string, rest = "......") => [
    "##############",
    "#1....#......#",
    `#2....${mid}${rest}#`,
    "#3....#......#",
    "##############",
  ];
  const GUARD = { G1: { sightTiles: 3, fovDeg: 20, speedTps: 0 } };
  const ids = (view: ReturnType<typeof viewFor>) => view.entities.map((e) => e.id);

  it("does not send a guard behind a wall or a vent, but does through glass", () => {
    for (const [mid, seen] of [
      ["#", false],
      ["%", false],
      ["=", true],
    ] as const) {
      const w = worldWith(split(mid, "..G..."), GUARD);
      place(w, 1, { x: 3, y: 2 });
      expect(ids(viewFor(w, 1, "deaf", false)).includes("G1"), `through ${mid}`).toBe(seen);
    }
  });

  it("does not send a teammate who is out of sight, and always sends yourself", () => {
    const w = worldWith(split("#"));
    place(w, 1, { x: 3, y: 2 });
    place(w, 2, { x: 9, y: 2 });
    const got = ids(viewFor(w, 1, "deaf", false));
    expect(got).toContain("P1");
    expect(got).toContain("P0");
    expect(got).not.toContain("P2");
  });

  it("carries footsteps through a vent, but stops them at a wall or glass", () => {
    for (const [mid, heard] of [
      ["%", true],
      ["=", false],
      ["#", false],
    ] as const) {
      const w = worldWith(split(mid));
      place(w, 0, { x: 3, y: 2 });
      place(w, 2, { x: 9, y: 2 });
      w.players[2].moving = true;
      const kinds = viewFor(w, 0, "blind", false).sounds.map((s) => s.kind);
      expect(kinds.includes("footsteps"), `through ${mid}`).toBe(heard);
    }
  });

  it("sends a mark in a dark zone and one behind a wall: marks always show", () => {
    const open = [
      "########################",
      "#1.....................#",
      "#2.....................#",
      "#3.....................#",
      "########################",
    ];
    const dark = worldWith(open, {}, { flips: [{ kind: "dark", zone: [10, 1, 14, 3] }] });
    place(dark, 1, { x: 3, y: 1 });
    dark.stamps.push({ key: "s1", id: "x", pos: { x: 12.5, y: 2.5 }, ageMs: 0 });
    expect(ids(viewFor(dark, 1, "deaf", false))).toContain("s1");
    const walled = worldWith(split("#"));
    place(walled, 1, { x: 3, y: 2 });
    walled.stamps.push({ key: "s2", id: "bang", pos: { x: 9.5, y: 2.5 }, ageMs: 0 });
    expect(ids(viewFor(walled, 1, "deaf", false))).toContain("s2");
  });

  it("sends `seen` to the sighted, as the tiles in line of sight, and none to Can't see", () => {
    const w = worldWith(split("#"));
    place(w, 1, { x: 3, y: 2 });
    const seen = decodeSeen(viewFor(w, 1, "deaf", false).seen ?? []);
    expect(seen.has("3,2")).toBe(true);
    expect(seen.has("9,2")).toBe(false);
    expect(viewFor(w, 2, "mute", false).seen).toBeDefined();
    expect(viewFor(w, 0, "blind", false).seen).toBeUndefined();
  });

  it("keeps team-wide loot audible wherever you stand", () => {
    const w = worldWith(split("#", "..$..."));
    place(w, 0, { x: 3, y: 2 });
    place(w, 2, { x: 9, y: 2 });
    step(w, {}, TICK_MS);
    expect(viewFor(w, 0, "blind", false).sounds.map((s) => s.kind)).toContain("loot");
  });

  it("keeps the largest full view of room 05 under 8 KiB", () => {
    const room = loadRooms("./spec/fixtures/old-rooms").find((r) => r.id === "10-vault");
    if (!room) throw new Error("room 05 is missing");
    const w = createWorld(room);
    let worst = 0;
    for (let y = 1; y < room.height - 1; y++) {
      for (let x = 1; x < room.width - 1; x++) {
        if (room.grid[y]?.[x] !== ".") continue;
        place(w, 1, { x, y });
        worst = Math.max(worst, JSON.stringify(viewFor(w, 1, "deaf", true)).length);
      }
    }
    expect(worst).toBeGreaterThan(0);
    expect(worst, `largest view was ${worst} bytes`).toBeLessThan(8 * 1024);
  });
});

describe("viewFor: the clue sound", () => {
  const GRID = [
    "########################",
    "#1.....................#",
    "#2.......c.............#",
    "#3.....................#",
    "########################",
  ];
  const clue = () => worldWith(GRID, { c1: { n: 2, everyS: 2 } });
  const untilClue = (w: ReturnType<typeof clue>) => {
    for (let i = 0; i < 60 && !w.events.some((e) => e.kind === "clue"); i++) step(w, {}, TICK_MS);
  };

  it("reaches Can't see and Can't speak within 8 tiles, with its count, and never Can't hear", () => {
    const w = clue();
    place(w, 0, { x: 5, y: 2 });
    place(w, 2, { x: 2, y: 3 });
    untilClue(w);
    for (const [seat, role] of [
      [0, "blind"],
      [2, "mute"],
    ] as const) {
      const heard = viewFor(w, seat, role, false).sounds.find((s) => s.kind === "clue");
      expect(heard?.n, role).toBe(2);
    }
    const deaf = viewFor(w, 1, "deaf", false);
    expect(deaf.sounds).toEqual([]);
    expect(deaf.entities.map((e) => e.id)).not.toContain("c1");
  });

  it("is local: gone beyond 8 tiles", () => {
    const w = clue();
    place(w, 0, { x: 19, y: 2 });
    untilClue(w);
    expect(viewFor(w, 0, "blind", false).sounds.map((s) => s.kind)).not.toContain("clue");
  });
});

// Stations, gear and signals: what each role perceives of them (escape-room phase 01, Task 3).
describe("viewFor: stations, gear and signals", () => {
  const pressAct = (w: ReturnType<typeof worldWith>, seat: 0 | 1 | 2) => {
    step(w, { [seat]: { seq: 0, move: { x: 0, y: 0 }, act: true } }, TICK_MS);
  };
  const holdGear = (w: ReturnType<typeof worldWith>, id: string, seat: 0 | 1 | 2) => {
    const g = w.gear.find((x) => x.id === id);
    if (!g) throw new Error(`no gear ${id}`);
    Object.assign(g, { heldBy: seat, at: null });
  };
  const WIRES = {
    Q1: {
      type: "wires",
      wires: [
        [3, 2],
        [4, 2],
        [5, 2],
      ],
    },
  };
  const wiresWorld = () =>
    worldWith(["##########", "#1..Q....#", "#2.......#", "#3.......#", "##########"], WIRES);

  it("a sighted viewer sees wire colours in sight; Can't see is shown no station at all", () => {
    const w = wiresWorld();
    const colours = w.stations.Q1?.answer.slice(2);
    const q = viewFor(w, 1, "deaf", false).entities.find((e) => e.id === "Q1");
    expect(q?.kind).toBe("station");
    const parts = stationParts(w.room.objects.find((o) => o.id === "Q1") as RoomObject);
    expect(q?.station).toEqual({ type: "wires", shows: colours, solved: false, parts });
    const blind = viewFor(w, 0, "blind", false);
    expect(blind.entities).toEqual([]);
    expect(JSON.stringify(blind)).not.toContain("shows");
  });

  // The user heard the caption "Tumbler" and no sound: a click at a third of its level, 0.07 s long, on the
  // same tick as the dial's own louder tick. Within touch range it must carry, not fade to nothing.
  it("the tumbler is still plainly audible at the edge of touch range, and absent beyond it", () => {
    const grid = ["############", "#1.....Q...#", "#2.........#", "#3....g....#", "############"];
    const dial = {
      type: "dial",
      pads: [
        [6, 1],
        [8, 1],
      ],
      back: [7, 3],
      digits: 1,
    };
    const gainAt = (x: number, y: number) => {
      const w = worldWith(grid, { Q1: dial, g1: { item: "stethoscope" } });
      holdGear(w, "g1", 0);
      place(w, 0, { x, y });
      const s = w.stations.Q1;
      if (!s) throw new Error("no Q1");
      s.input[0] = ((s.answer[0] as number) + 9) % 10;
      place(w, 2, { x: 8, y: 1 });
      pressAct(w, 2);
      return viewFor(w, 0, "blind", false).sounds.find((c) => c.kind === "tumbler")?.gain;
    };
    expect(gainAt(7, 3), "on the back").toBeGreaterThanOrEqual(0.6);
    expect(gainAt(6, 3), "a tile away").toBeGreaterThanOrEqual(0.6);
    expect(gainAt(6, 2), "a tile and a half away, diagonally").toBeGreaterThanOrEqual(0.6);
    expect(gainAt(3, 3), "four tiles away").toBeUndefined();
  });

  it("the tumbler reaches only a hearing holder of the stethoscope beside the back", () => {
    const grid = ["############", "#1.....Q...#", "#2.........#", "#3....g....#", "############"];
    const dial = {
      type: "dial",
      pads: [
        [6, 1],
        [8, 1],
      ],
      back: [7, 3],
      digits: 1,
    };
    const turnRight = (w: ReturnType<typeof worldWith>) => {
      const s = w.stations.Q1;
      if (!s) throw new Error("no Q1");
      s.input[0] = ((s.answer[0] as number) + 9) % 10; // one notch short of the answer
      place(w, 2, { x: 8, y: 1 });
      pressAct(w, 2);
    };
    const heard = (w: ReturnType<typeof worldWith>, seat: 0 | 1 | 2, role: "blind" | "mute") =>
      viewFor(w, seat, role, false).sounds.some((s) => s.kind === "tumbler");

    const w = worldWith(grid, { Q1: dial, g1: { item: "stethoscope" } });
    holdGear(w, "g1", 0);
    place(w, 0, { x: 6, y: 3 });
    place(w, 1, { x: 8, y: 3 }); // beside the back too, but no stethoscope
    turnRight(w);
    expect(heard(w, 0, "blind")).toBe(true);
    expect(heard(w, 0, "mute")).toBe(true);
    expect(heard(w, 1, "blind")).toBe(false);
    expect(viewFor(w, 0, "deaf", false).sounds).toEqual([]);

    const far = worldWith(grid, { Q1: dial, g1: { item: "stethoscope" } });
    holdGear(far, "g1", 0);
    place(far, 0, { x: 2, y: 3 });
    turnRight(far);
    expect(heard(far, 0, "blind")).toBe(false);
  });

  it("the earpiece plays only to its hearing holder", () => {
    const grid = ["##########", "#1..Q....#", "#2.......#", "#3..g....#", "##########"];
    const keys = [0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => [5 + x, 1 + y]));
    const w = worldWith(grid, {
      Q1: { type: "keypad", keys, clue: "g1", length: 3 },
      g1: { item: "earpiece" },
    });
    holdGear(w, "g1", 0);
    place(w, 2, { x: 1, y: 2 }); // right beside the holder
    w.tick = tuneGroups(w.stations.Q1?.answer ?? []).period - 1; // the next tick starts the tune
    step(w, {}, TICK_MS);
    const mine = viewFor(w, 0, "blind", false).sounds.filter((s) => s.kind === "earpiece");
    expect(mine).toHaveLength(1);
    expect(mine[0]?.n).toBe(w.stations.Q1?.answer[0]);
    expect(viewFor(w, 2, "mute", false).sounds.some((s) => s.kind === "earpiece")).toBe(false);
    expect(viewFor(w, 0, "deaf", false).sounds).toEqual([]);
  });

  it("a station whose display is in a dark zone shows its state only to a goggles wearer", () => {
    // switches: buttons and anchor in the light, lamps at (9..10,1..2) in the dark
    const grid = ["############", "#1.Q......g#", "#2.........#", "#3.........#", "############"];
    const buttons = [
      [3, 2],
      [4, 2],
    ];
    const lamps = [
      [9, 1],
      [10, 1],
      [9, 2],
      [10, 2],
    ].slice(0, 2);
    const w = worldWith(
      grid,
      { Q1: { type: "switches", buttons, lamps, cols: 2 }, g1: { item: "goggles" } },
      { flips: [{ kind: "dark", zone: [8, 1, 10, 3] }] },
    );
    const station = (seat: 1 | 2, role: "deaf" | "mute") =>
      viewFor(w, seat, role, false).entities.find((e) => e.id === "Q1")?.station;
    expect(station(2, "mute")?.shows).toEqual([]);
    holdGear(w, "g1", 1);
    expect(station(1, "deaf")?.shows.length).toBe(2);
  });

  it("goggles let a sighted wearer see into a dark zone; a non-wearer still sees nothing there", () => {
    const grid = ["############", "#1.....$...#", "#2.........#", "#3....g....#", "############"];
    const w = worldWith(
      grid,
      { g1: { item: "goggles" } },
      {
        flips: [{ kind: "dark", zone: [5, 1, 10, 3] }],
      },
    );
    holdGear(w, "g1", 1);
    const wearer = viewFor(w, 1, "deaf", true);
    expect(wearer.entities.some((e) => e.id === "$1")).toBe(true);
    expect(wearer.tiles?.[1]).not.toContain(" ");
    expect(wearer.gear).toBe("goggles");
    const other = viewFor(w, 2, "mute", true);
    expect(other.entities.some((e) => e.id === "$1")).toBe(false);
    expect(other.tiles?.[1]).toContain(" ");
  });

  it("ink shows to the sighted only inside the UV pool and in their sight, never to Can't see", () => {
    const grid = [
      "##############",
      "#1....u..#...#",
      "#2.......#...#",
      "#3..g....#...#",
      "##############",
    ];
    const w = worldWith(grid, { g1: { item: "uv" }, u1: { text: "4 7 1" } });
    holdGear(w, "g1", 2);
    place(w, 2, { x: 4, y: 1 }); // 2 tiles from the ink
    const ink = (seat: 0 | 1 | 2, role: "deaf" | "mute" | "blind") =>
      viewFor(w, seat, role, false).entities.find((e) => e.id === "u1");
    expect(ink(1, "deaf")).toMatchObject({ kind: "ink", text: "4 7 1" });
    expect(viewFor(w, 1, "deaf", false).entities.some((e) => e.kind === "uv")).toBe(true);
    expect(ink(0, "blind")).toBeUndefined();
    place(w, 1, { x: 11, y: 2 }); // behind the wall
    expect(ink(1, "deaf")).toBeUndefined();
    place(w, 1, { x: 1, y: 2 });
    place(w, 2, { x: 1, y: 3 }); // the torch is too far from the ink
    expect(ink(1, "deaf")).toBeUndefined();
  });

  it("ink on a numbered wire panel is the wire's number, never shown to Can't see", () => {
    const grid = [
      "##############",
      "#1....uQ.#...#",
      "#2.......#...#",
      "#3..g....#...#",
      "##############",
    ];
    const w = worldWith(grid, {
      g1: { item: "uv" },
      u1: { text: "" },
      Q1: {
        type: "wires",
        wires: [
          [7, 1],
          [8, 1],
          [9, 1],
        ],
        plaque: "u1",
        numbered: true,
      },
    });
    holdGear(w, "g1", 2);
    place(w, 2, { x: 4, y: 1 });
    const ink = (seat: 0 | 1 | 2, role: "deaf" | "mute" | "blind") =>
      viewFor(w, seat, role, false).entities.find((e) => e.id === "u1");
    const answer = w.stations.Q1?.answer[0] as number;
    expect(ink(1, "deaf")).toMatchObject({
      kind: "ink",
      text: String(answer + 1),
    });
    expect(ink(0, "blind")).toBeUndefined();
  });

  it("the lamp flashes for the sighted, and is absent for Can't see", () => {
    const w = worldWith(["##########", "#1..l....#", "#2.......#", "#3.......#", "##########"]);
    place(w, 2, { x: 4, y: 1 });
    pressAct(w, 2);
    expect(viewFor(w, 1, "deaf", false).lamp).toEqual({ seat: 2, tick: w.tick });
    expect(viewFor(w, 2, "mute", false).lamp).toEqual({ seat: 2, tick: w.tick });
    expect(viewFor(w, 0, "blind", false).lamp).toBeUndefined();
  });

  it("Can't see's Act hint never names a colour; a sighted one may", () => {
    const w = wiresWorld();
    const colourWord = /red|blue|yellow|green|white|black/;
    for (const x of [3, 4, 5]) {
      place(w, 0, { x, y: 2 });
      const hint = viewFor(w, 0, "blind", false).act;
      expect(hint).toBe(`Cut wire ${x - 2}`);
      expect(hint).not.toMatch(colourWord);
    }
    place(w, 1, { x: 3, y: 2 });
    expect(viewFor(w, 1, "deaf", false).act).toMatch(colourWord);
  });

  it("a plate's crateOnly flag is in the view, for everyone who sees the plate (Task 33)", () => {
    const w = worldWith(["##########", "#1..p....#", "#2.......#", "#3...p...#", "##########"], {
      p1: { crateOnly: true },
    });
    for (const role of ["deaf", "mute"] as const) {
      const plates = viewFor(w, role === "deaf" ? 1 : 2, role, false).entities.filter(
        (e) => e.kind === "plate",
      );
      expect(plates.find((e) => e.id === "p1")?.crateOnly).toBe(true);
      expect(plates.find((e) => e.id === "p2")?.crateOnly).toBeUndefined();
    }
  });

  it("a station's practice field reaches only roles that perceive the station (Task 38)", () => {
    const grid = ["##########", "#1.Q.v...#", "#2.......#", "#3.......#", "##########"];
    const w = worldWith(grid, {
      Q1: {
        type: "keypad",
        keys: [
          [6, 1],
          [7, 1],
          [8, 1],
        ],
        length: 3,
        practice: "v1",
      },
    });
    place(w, 2, { x: 5, y: 1 });
    step(w, { 2: { seq: 1, move: { x: 0, y: 0 }, act: true } }, TICK_MS); // the mute seat flips it
    step(w, {}, TICK_MS);
    expect(w.levers.v1).toBe(true);
    const station = (role: "deaf" | "mute", seat: 1 | 2) =>
      viewFor(w, seat, role, false).entities.find((e) => e.id === "Q1")?.station;
    expect(station("deaf", 1)?.practice).toBe(true);
    expect(station("mute", 2)?.practice).toBe(true);
    // Can't see gets no entities at all, so no flag: it is told by the sound, not the dimming
    const blind = viewFor(w, 0, "blind", false);
    expect(blind.entities).toEqual([]);
    expect(JSON.stringify(blind)).not.toContain("practice");
    // and a station with the lever off carries no field at all
    w.levers.v1 = false;
    expect(station("deaf", 1)).not.toHaveProperty("practice");
  });

  it("a practice press carries its note and its source, only to roles that hear it (Task 42)", () => {
    const keys = [0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => [6 + x, 1 + y]));
    const w = worldWith(
      ["###########", "#1...Q....#", "#2.v......#", "#3........#", "###########"],
      {
        Q1: { type: "keypad", keys, clue: "c9", length: 3, practice: "v1" },
      },
    );
    place(w, 2, { x: 3, y: 2 });
    step(w, { 2: { seq: 1, move: { x: 0, y: 0 }, act: true } }, TICK_MS); // the lever on
    step(w, {}, TICK_MS);
    expect(w.levers.v1).toBe(true);
    place(w, 0, { x: 5, y: 3 });
    place(w, 2, { x: 8, y: 2 }); // on key 5 (the middle of the right column)
    step(w, { 2: { seq: 2, move: { x: 0, y: 0 }, act: true } }, TICK_MS);
    const heard = viewFor(w, 0, "blind", false).sounds.filter((s) => s.kind === "practice");
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ n: 5, of: "key" });
    // Can't hear gets no sounds at all, so no `n` or `of` either
    const deaf = viewFor(w, 1, "deaf", false);
    expect(deaf.sounds).toEqual([]);
    expect(JSON.stringify(deaf)).not.toContain('"of"');
  });

  it("a tug of war is heard by the two hand-holders and by nobody else (Task 40)", () => {
    const w = worldWith(["##########", "#1.......#", "#2.......#", "#3.......#", "##########"], {});
    place(w, 0, { x: 3, y: 1 });
    place(w, 1, { x: 4, y: 1 });
    place(w, 2, { x: 7, y: 3 }); // the third player is well away, but a pull is a sound of the pair
    step(w, { 0: { seq: 1, move: { x: 0, y: 0 }, act: true } }, TICK_MS);
    step(w, {}, TICK_MS);
    expect(w.holding).toEqual({ 1: 0 });
    step(
      w,
      {
        0: { seq: 2, move: { x: 1, y: 0 }, act: false },
        1: { seq: 3, move: { x: -1, y: 0 }, act: false },
      },
      TICK_MS,
    );
    const heard = (seat: 0 | 1 | 2, role: "blind" | "deaf" | "mute") =>
      viewFor(w, seat, role, false).sounds.some((s) => s.kind === "pull");
    expect(heard(0, "blind"), "the leader (Can't see) hears it").toBe(true);
    expect(heard(2, "mute"), "a third player does not").toBe(false);
    // Can't hear is one of the holders here: a view never carries sound for it, but it sees it
    const view = viewFor(w, 2, "mute", false);
    expect(view.entities.find((e) => e.id === "P0")?.pulling).toBe(true);
    expect(view.entities.find((e) => e.id === "P1")?.pulling).toBe(true);
    // a tug that is over is not pulled any more
    step(w, {}, TICK_MS);
    expect(
      viewFor(w, 2, "mute", false).entities.find((e) => e.id === "P0")?.pulling,
    ).toBeUndefined();
  });

  it("Act hint says Swap when a full slot stands on other gear, and only after the nearer actions", () => {
    const w = worldWith(["##########", "#1..gg...#", "#2.......#", "#3.......#", "##########"], {
      g1: { item: "uv" },
      g2: { item: "goggles" },
    });
    place(w, 0, { x: 4, y: 1 });
    step(w, { 0: { seq: 1, move: { x: 0, y: 0 }, act: true } }, TICK_MS); // takes the torch
    expect(viewFor(w, 0, "deaf", false).act).toBeUndefined(); // holding the torch, nothing under it
    place(w, 0, { x: 5, y: 1 });
    expect(viewFor(w, 0, "deaf", false).act).toBe("Swap the UV torch for the goggles");
    place(w, 1, { x: 5, y: 2 }); // a teammate beside: Space holds hands, so the hint says that
    expect(viewFor(w, 0, "deaf", false).act).toBe("Hold hands");
  });

  it("a teammate's gear and whose hand they hold are seen by the sighted in sight", () => {
    const w = worldWith(["##########", "#1..g....#", "#2.......#", "#3.......#", "##########"], {
      g1: { item: "uv" },
    });
    holdGear(w, "g1", 2);
    place(w, 0, { x: 4, y: 3 });
    place(w, 2, { x: 5, y: 3 });
    pressAct(w, 0);
    expect(w.holding).toEqual({ 2: 0 });
    const seen = viewFor(w, 1, "deaf", false).entities;
    expect(seen.find((e) => e.id === "P2")).toMatchObject({ item: "uv", heldBy: 0 });
    expect(seen.find((e) => e.id === "P0")).toMatchObject({ holding: 2 });
    expect(viewFor(w, 2, "mute", false).gear).toBe("uv");
    expect(viewFor(w, 0, "blind", false).gear).toBeNull();
  });
});

describe("viewFor: a station is seen where it shows its state", () => {
  it("switches: the lamps behind glass in another chamber are not shown from the buttons", () => {
    // buttons and the switch panel in the west room; the lamps in the east room, out of sight
    const grid = ["############", "#1..Q.#....#", "#2....#....#", "#3....#....#", "############"];
    const w = worldWith(grid, {
      Q1: {
        type: "switches",
        buttons: [
          [2, 2],
          [3, 2],
          [4, 2],
        ],
        lamps: [
          [8, 2],
          [9, 2],
          [10, 2],
        ],
        cols: 3,
      },
    });
    // on a button, the panel right beside: the buttons are furniture and drawn, the lamps' state
    // is not told (Task 8 of phase 02: parts on the station entity, `shows` only where it shows)
    w.stations.Q1?.input.splice(0, 3, 1, 0, 1);
    place(w, 1, { x: 3, y: 2 });
    const atButtons = viewFor(w, 1, "deaf", false).entities.find((e) => e.id === "Q1");
    expect(atButtons?.station?.shows).toEqual([]);
    expect(atButtons?.station?.furniture).toBe(true);
    expect(atButtons?.station?.parts).toContainEqual({
      key: "buttons",
      at: [
        { x: 2, y: 2 },
        { x: 3, y: 2 },
        { x: 4, y: 2 },
      ],
    });
    place(w, 1, { x: 8, y: 1 }); // in the lamp room
    expect(
      viewFor(w, 1, "deaf", false).entities.find((e) => e.id === "Q1")?.station?.shows,
    ).toEqual([1, 0, 1]);
  });

  // The user (screenshots 105 to 107): a safe's wire must show at every distance, so it is sent to every sighted seat as
  // layout of its own (a `wire` entity: only its route, nothing of the station's state), wherever the seat stands.
  it("a safe's wire is sent to every sighted seat from anywhere, as a route and nothing else", () => {
    const grid = [
      "##############",
      "#1Q.#....#...#",
      "#2..#....#...#",
      "#3..#....#...#",
      "##############",
    ];
    const dial = { type: "dial", pads: [[3, 2]], back: [12, 1], digits: 1 };
    const w = worldWith(grid, { Q1: dial });
    for (const at of [
      { x: 6, y: 2 },
      { x: 2, y: 2 },
      { x: 11, y: 3 },
    ]) {
      place(w, 1, at);
      for (const role of ["deaf", "mute"] as const) {
        const wire = viewFor(w, 1, role, false).entities.find((e) => e.kind === "wire");
        expect(wire?.route?.length, `${role} at ${at.x},${at.y}`).toBeGreaterThan(1);
        expect(Object.keys(wire ?? {}).sort()).toEqual(["id", "kind", "pos", "route"]);
      }
    }
    expect(viewFor(w, 0, "blind", false).entities.find((e) => e.kind === "wire")).toBeUndefined();
  });

  it("is never sent to Can't see, parts or not", () => {
    const grid = ["############", "#1..Q.#....#", "#2....#....#", "#3....#....#", "############"];
    const w = worldWith(grid, {
      Q1: {
        type: "wires",
        wires: [
          [2, 2],
          [3, 2],
          [4, 2],
          [5, 2],
        ],
      },
    });
    place(w, 0, { x: 3, y: 2 });
    expect(JSON.stringify(viewFor(w, 0, "blind", true))).not.toContain("parts");
  });

  it("names every part of the station by its key: a dial's pads, anchor and back", () => {
    const grid = ["############", "#1..Q.#....#", "#2....#....#", "#3....#....#", "############"];
    const w = worldWith(grid, {
      Q1: {
        type: "dial",
        pads: [
          [3, 2],
          [5, 2],
        ],
        back: [4, 3],
        digits: 2,
        range: 10,
      },
    });
    place(w, 1, { x: 4, y: 2 });
    const parts = viewFor(w, 1, "deaf", false).entities.find((e) => e.id === "Q1")?.station?.parts;
    expect(parts).toEqual([
      { key: "anchor", at: [{ x: 4, y: 1 }] },
      {
        key: "pads",
        at: [
          { x: 3, y: 2 },
          { x: 5, y: 2 },
        ],
      },
      { key: "back", at: [{ x: 4, y: 3 }] },
    ]);
  });
});

describe("viewFor: clue fields (escape-room Task 11)", () => {
  const GRID5 = ["############", "#1..Q.t.S..#", "#2..Q......#", "#3.........#", "############"];
  const OBJECTS = {
    Q1: {
      type: "switches",
      buttons: [
        [2, 3],
        [3, 3],
      ],
      cols: 2,
      lamps: [
        [9, 3],
        [10, 3],
      ],
      motif: "star",
    },
    Q2: {
      type: "sync",
      keys: [[6, 3]],
      windowMs: 500,
      reveal: true,
      teach: true,
    },
    T1: { of: "Q1" },
    S1: { text: "Red before blue." },
  };
  const w = () => worldWith(GRID5, OBJECTS);

  it("the sighted see the target card, the motif, a sign's text and a solved wing's reveal", () => {
    const world = w();
    place(world, 2, { x: 6, y: 3 });
    step(world, { 2: { seq: 0, move: { x: 0, y: 0 }, act: true } }, TICK_MS);
    const view = viewFor(world, 1, "deaf", false);
    const card = view.entities.find((e) => e.id === "T1");
    expect(card?.kind).toBe("card");
    expect(card?.card).toEqual(world.stations.Q1?.answer);
    expect(view.entities.find((e) => e.id === "Q1")?.station?.motif).toBe("star");
    expect(view.entities.find((e) => e.id === "S1")?.text).toBe("Red before blue.");
    const q2 = view.entities.find((e) => e.id === "Q2")?.station;
    expect(q2?.reveal).toBe(world.stations.Q2?.reveal);
    expect(q2?.teach).toBe(true);
  });

  it("Can't see is sent none of card, motif, reveal or text", () => {
    const world = w();
    place(world, 2, { x: 6, y: 3 });
    step(world, { 2: { seq: 0, move: { x: 0, y: 0 }, act: true } }, TICK_MS);
    const json = JSON.stringify(viewFor(world, 0, "blind", true));
    for (const k of ['"card"', '"motif"', '"reveal"', '"text"', '"teach"']) {
      expect(json).not.toContain(k);
    }
  });
});

describe("viewFor: a jammed station (FR13)", () => {
  it("shows station.jammed to the sighted while the jam lasts, and not after", () => {
    const world = worldWith(
      ["##########", "#1.......#", "#2..Q....#", "#3.......#", "##########"],
      {
        Q1: {
          type: "dial",
          pads: [
            [3, 2],
            [5, 2],
          ],
          digits: 1,
          teach: true,
        },
      },
    );
    const jammed = () =>
      viewFor(world, 1, "deaf", false).entities.find((e) => e.id === "Q1")?.station?.jammed;
    expect(jammed()).toBeUndefined();
    const s = world.stations.Q1 as NonNullable<(typeof world.stations)[string]>;
    s.input = [((s.answer[0] as number) + 1) % 10];
    place(world, 2, { x: 4, y: 2 });
    step(world, { 2: { seq: 0, move: { x: 0, y: 0 }, act: true } }, TICK_MS);
    expect(jammed()).toBe(true);
    while (world.tick < (world.jammedUntil.Q1 ?? 0)) step(world, {}, TICK_MS);
    expect(jammed()).toBeUndefined();
  });
});

describe("viewFor: a braille plate (Task 72, FR6 to FR8)", () => {
  // o1 at (7, 2) carries Q1's second digit; seat 0 is Can't see, 1 Can't hear, 2 Can't speak
  const plateWorld = () => {
    const w = worldWith(
      ["############", "#1.........#", "#2..Q..o...#", "#3.........#", "############"],
      {
        Q1: {
          type: "dial",
          pads: [
            [3, 1],
            [5, 1],
          ],
          digits: 2,
        },
        o1: { for: "Q1", part: 1 },
      },
    );
    w.roles = ["blind", "deaf", "mute"];
    return w;
  };
  const actAt = (w: ReturnType<typeof plateWorld>, seat: 0 | 1 | 2, x: number, y: number) => {
    place(w, seat, { x, y });
    step(w, { [seat]: { seq: 0, move: { x: 0, y: 0 }, act: true } }, TICK_MS);
  };

  it("(a) Act beside the plate gives Can't see its cells, and only them", () => {
    const w = plateWorld();
    actAt(w, 0, 6, 2);
    const view = viewFor(w, 0, "blind", false);
    expect(view.braille).toEqual({ id: "o1", cells: brailleCells(plateNumber(w, "o1") as number) });
    expect(view.sounds.some((s) => s.kind === "tap")).toBe(true);
  });

  it("(b) a seat that can see never gets the cells, and has no hint to read", () => {
    for (const [seat, role] of [
      [1, "deaf"],
      [2, "mute"],
    ] as const) {
      const w = plateWorld();
      actAt(w, seat, 7, 2);
      expect(w.reading[seat]).toBeUndefined();
      const view = viewFor(w, seat, role, false);
      expect(view.braille).toBeUndefined();
      expect(view.act).toBeUndefined();
    }
    // the reading seat itself, viewed as a sighted role, is told nothing either
    const w = plateWorld();
    actAt(w, 0, 6, 2);
    expect(viewFor(w, 0, "deaf", false).braille).toBeUndefined();
  });

  it("(c) stepping off closes the plate", () => {
    const w = plateWorld();
    actAt(w, 0, 6, 2);
    place(w, 0, { x: 7, y: 3 });
    step(w, {}, TICK_MS);
    expect(viewFor(w, 0, "blind", false).braille).toBeDefined();
    place(w, 0, { x: 9, y: 2 });
    step(w, {}, TICK_MS);
    expect(viewFor(w, 0, "blind", false).braille).toBeUndefined();
  });

  it("(d) no other view or entity carries the number", () => {
    const w = plateWorld();
    place(w, 1, { x: 7, y: 1 });
    place(w, 2, { x: 8, y: 3 });
    actAt(w, 0, 6, 2);
    const blind = viewFor(w, 0, "blind", true);
    const cells = JSON.stringify(blind.braille?.cells);
    const { braille: _own, ...rest } = blind;
    const others = [rest, viewFor(w, 1, "deaf", true), viewFor(w, 2, "mute", true)];
    for (const v of others) {
      expect(JSON.stringify(v)).not.toContain(cells);
      expect(v).not.toHaveProperty("braille");
      const plate = v.entities.find((e) => e.id === "o1");
      if (plate) expect(Object.keys(plate).sort()).toEqual(["flash", "id", "kind", "pos", "state"]);
    }
    expect(viewFor(w, 1, "deaf", false).entities.find((e) => e.id === "o1")).toMatchObject({
      kind: "braille",
      flash: "ok",
      state: "on",
    });
    // the hand stays on it while it is read; the pulse is the tick it was opened
    step(w, {}, TICK_MS);
    const plate = viewFor(w, 1, "deaf", false).entities.find((e) => e.id === "o1");
    expect(plate?.state).toBe("on");
    expect(plate?.flash).toBeUndefined();
  });

  it("(e) a spectator following Can't see gets the cells", () => {
    const w = plateWorld();
    actAt(w, 0, 6, 2);
    expect(spectatorView(w, 0, ["blind", "deaf", "mute"], false).braille?.id).toBe("o1");
    expect(spectatorView(w, 1, ["blind", "deaf", "mute"], false).braille).toBeUndefined();
  });

  it("the Act hint for Can't see beside a plate is Read the plate", () => {
    const w = plateWorld();
    place(w, 0, { x: 8, y: 1 });
    expect(viewFor(w, 0, "blind", false).act).toBe("Read the plate");
    place(w, 0, { x: 9, y: 1 });
    expect(viewFor(w, 0, "blind", false).act).toBeUndefined();
  });

  it("a world with no roles reads nothing", () => {
    const w = plateWorld();
    delete w.roles;
    actAt(w, 0, 6, 2);
    expect(w.reading[0]).toBeUndefined();
  });

  it("the tumbler stays silent for the digit the plate carries, and sounds for the other", () => {
    const tumbles = (digit: number) => {
      const w = worldWith(
        ["############", "#1.........#", "#2..Q..o...#", "#3..g......#", "############"],
        {
          Q1: {
            type: "dial",
            pads: [
              [3, 1],
              [5, 1],
            ],
            back: [4, 3],
            digits: 2,
          },
          o1: { for: "Q1", part: 1 },
          g1: { item: "stethoscope" },
        },
      );
      const s = w.stations.Q1 as NonNullable<(typeof w.stations)[string]>;
      s.input = [...s.answer.slice(0, digit), ((s.answer[digit] as number) + 9) % 10];
      place(w, 0, { x: 4, y: 3 });
      step(w, { 0: { seq: 0, move: { x: 0, y: 0 }, act: false, gear: true } }, TICK_MS);
      place(w, 2, { x: 5, y: 1 });
      step(w, { 2: { seq: 1, move: { x: 0, y: 0 }, act: true } }, TICK_MS);
      return viewFor(w, 0, "blind", false).sounds.some((c) => c.kind === "tumbler");
    };
    expect(tumbles(0)).toBe(true);
    expect(tumbles(1)).toBe(false);
  });

  it("marks the plate's teaching line", () => {
    const w = plateWorld();
    const o = w.room.objects.find((x) => x.id === "o1");
    if (o?.params) o.params.teach = true;
    actAt(w, 0, 6, 2);
    expect(viewFor(w, 0, "blind", false).braille?.teach).toBe(true);
  });
});

describe("viewFor: the hollow step on a cache dial's inspection plate (Task 66)", () => {
  const BASE_GRID = [
    "##############################",
    "#1...........................#",
    "#2...........................#",
    "#3...........................#",
    "##############################",
  ];
  const PLATE = { x: 20, y: 2 };
  // a dial at (6,1) whose back tile is (20,2); `cache` makes it a cache with a chamber under the room
  const dialWorld = (cache: boolean) => {
    const grid = BASE_GRID.map((r, y) => (y === 1 ? `#1.....Q${r.slice(8)}` : r));
    const built = withChamber(grid, 14);
    const dial = {
      type: "dial",
      pads: [
        [5, 1],
        [7, 1],
      ],
      back: [PLATE.x, PLATE.y],
      digits: 1,
    };
    return worldWith(built.grid, {
      Q1: cache
        ? {
            ...dial,
            cache: {
              owner: 2,
              motif: "moon",
              riddle: "Where the moon watches, listen twice.",
              item: "watch",
              tiles: [
                { at: [10, 1], motif: "moon" },
                { at: [12, 1], motif: "star" },
              ],
              chamber: built.chamber,
            },
          }
        : dial,
    });
  };
  const walk = (w: ReturnType<typeof worldWith>, seat: 0 | 1 | 2, at: { x: number; y: number }) => {
    place(w, seat, at);
    w.players[seat].moving = true;
    w.players[seat].blocked = false;
  };
  const kinds = (
    w: ReturnType<typeof worldWith>,
    seat: 0 | 1 | 2,
    role: "blind" | "deaf" | "mute",
  ) => viewFor(w, seat, role, false).sounds.map((s) => s.kind);

  it("a walker on the plate hears hollow in place of their own step", () => {
    const w = dialWorld(true);
    walk(w, 0, PLATE);
    expect(kinds(w, 0, "blind")).toContain("hollow");
    expect(kinds(w, 0, "blind")).not.toContain("step");
  });

  it("a hearing teammate in earshot hears hollow, with a direction, not footsteps", () => {
    const w = dialWorld(true);
    place(w, 0, { x: 17, y: 2 });
    walk(w, 2, PLATE);
    const heard = viewFor(w, 0, "blind", false).sounds;
    expect(heard.map((s) => s.kind)).toContain("hollow");
    expect(heard.map((s) => s.kind)).not.toContain("footsteps");
    expect(heard.find((s) => s.kind === "hollow")?.dir).toEqual({ x: 1, y: 0 });
  });

  it("hollow carries 6 tiles and is stopped by a wall", () => {
    const w = dialWorld(true);
    walk(w, 2, PLATE);
    place(w, 0, { x: 13, y: 2 }); // 7 tiles away: out of range
    expect(kinds(w, 0, "blind")).not.toContain("hollow");
    place(w, 0, { x: 15, y: 2 }); // 5 tiles away: in range
    expect(kinds(w, 0, "blind")).toContain("hollow");
    const walled = dialWorld(true);
    walled.room.grid[2] = `${walled.room.grid[2]?.slice(0, 18)}#${walled.room.grid[2]?.slice(19)}`;
    walk(walled, 2, PLATE);
    place(walled, 0, { x: 17, y: 2 });
    expect(kinds(walled, 0, "blind")).not.toContain("hollow");
  });

  it("another tile, and a non-cache dial's back tile, keep the ordinary step and footsteps", () => {
    const w = dialWorld(true);
    walk(w, 0, { x: 19, y: 2 });
    walk(w, 2, { x: 18, y: 2 });
    expect(kinds(w, 0, "blind")).toEqual(expect.arrayContaining(["step", "footsteps"]));
    expect(kinds(w, 0, "blind")).not.toContain("hollow");
    const plain = dialWorld(false);
    walk(plain, 0, PLATE);
    walk(plain, 2, { x: 18, y: 2 });
    expect(kinds(plain, 0, "blind")).toContain("step");
    expect(kinds(plain, 0, "blind")).not.toContain("hollow");
    place(plain, 1, { x: 15, y: 2 });
    walk(plain, 2, PLATE);
    expect(kinds(plain, 1, "mute")).toContain("footsteps");
    expect(kinds(plain, 1, "mute")).not.toContain("hollow");
  });

  it("a walker pressed against a wall on the plate makes no hollow; Can't hear is told nothing", () => {
    const w = dialWorld(true);
    walk(w, 2, PLATE);
    w.players[2].blocked = true;
    place(w, 0, { x: 17, y: 2 });
    expect(kinds(w, 0, "blind")).not.toContain("hollow");
    w.players[2].blocked = false;
    place(w, 1, { x: 17, y: 2 });
    expect(viewFor(w, 1, "deaf", false).sounds).toEqual([]);
  });

  it("marks a cache dial's station entity, and not an ordinary dial's", () => {
    const open = dialWorld(true);
    open.cacheUncovered.push("Q1");
    syncCacheDoors(open);
    const station = (w: ReturnType<typeof worldWith>) =>
      viewFor(w, 1, "deaf", false).entities.find((e) => e.id === "Q1")?.station;
    expect(station(open)?.cache).toBe(true);
    expect(station(dialWorld(false))?.cache).toBeUndefined();
  });
});

// The door chip says how a door opens, so the view must carry it for every door of every shipped room
// (the user found "opens while its plates are held" on a door that waits for solved stations).
describe("viewFor: how every door in every room opens", () => {
  const shipped = loadRooms("./rooms");
  const doorsIn = (id: string) => {
    const room = shipped.find((r) => r.id === id);
    if (!room) throw new Error(`no room ${id}`);
    const w = createWorld(room);
    const view = viewFor(w, 1, "deaf", true);
    return { room, view };
  };

  it("marks a door that waits for a station, and leaves a plates-only door unmarked", () => {
    let withStation = 0;
    let plateOnly = 0;
    for (const room of shipped) {
      const { view } = doorsIn(room.id);
      for (const door of room.objects.filter(
        (o) => o.kind === "door" && !secretDoorIds(room).has(o.id),
      )) {
        const shown = view.entities.find((e) => e.kind === "door" && e.id === door.id);
        if (!shown) continue; // out of the spawn's sight
        const needsStation = (door.opensWhen ?? []).some((id) =>
          room.objects.some((o) => o.id === id && o.kind === "station"),
        );
        if (door.mode === "sequence") expect(shown.opens, `${room.id} ${door.id}`).toBe("sequence");
        else if (needsStation) {
          expect(shown.opens, `${room.id} ${door.id}`).toBe("stations");
          withStation++;
        } else {
          expect(shown.opens, `${room.id} ${door.id}`).toBeUndefined();
          plateOnly++;
        }
      }
    }
    expect(withStation, "some shipped door waits on a station").toBeGreaterThan(0);
    expect(plateOnly, "some shipped door is plates only").toBeGreaterThan(0);
  });
});

// A door is part of the map every sighted player holds, so it is sent whole whether or not its tile is
// in your light (it used to be sent only when seen, and its outline popped in and out as you moved by a
// hair). What is not sent is its state out of sight: it reads closed there, whatever the truth.
describe("viewFor: a door out of sight is sent, as closed", () => {
  const GRID = [
    "####################",
    "#1.....#.....#.....#",
    "#2.....D.....D....E#",
    "#3.....#.....#.....#",
    "####################",
  ];
  const doors = (w: ReturnType<typeof worldWith>) =>
    viewFor(w, 1, "deaf", true).entities.filter((e) => e.kind === "door");

  it("sends a door the viewer cannot see, and says it is closed", () => {
    const w = worldWith(GRID, { D1: { opensWhen: ["p1"] }, D2: { opensWhen: ["p1"] } });
    w.doorOpen.D2 = true; // open, but behind the first door: out of sight
    place(w, 1, { x: 3, y: 2 });
    const got = doors(w);
    expect(got.map((d) => d.id).sort()).toEqual(["D1", "D2"]);
    expect(got.find((d) => d.id === "D2")?.state, "an unseen door reads closed").toBe("closed");
  });

  it("tells the truth about a door that is in sight", () => {
    const w = worldWith(GRID, { D1: { opensWhen: ["p1"] }, D2: { opensWhen: ["p1"] } });
    w.doorOpen.D1 = true;
    place(w, 1, { x: 3, y: 2 });
    expect(doors(w).find((d) => d.id === "D1")?.state).toBe("open");
  });
});

describe("viewFor: what a place sees is kept, but only while nothing that changes it has", () => {
  const GRID = [
    "####################",
    "#1.....#.....#.....#",
    "#2.....D.....D....E#",
    "#3.....#.....#.....#",
    "####################",
  ];
  const seenFrom = (w: ReturnType<typeof worldWith>) =>
    decodeSeen(viewFor(w, 1, "deaf", false).seen ?? []);

  it("shows what lies past a door once it opens, from a viewer who has not moved", () => {
    const w = worldWith(GRID, { D1: { opensWhen: ["p1"] }, D2: { opensWhen: ["p1"] } });
    place(w, 1, { x: 3, y: 2 });
    expect(seenFrom(w).has("10,2"), "shut: the far side is not seen").toBe(false);
    w.doorOpen.D1 = true;
    expect(seenFrom(w).has("10,2"), "open: the same place now sees through").toBe(true);
  });

  it("gives each view its own `seen`, so a caller changing one cannot change the next", () => {
    const w = worldWith(GRID, { D1: { opensWhen: ["p1"] }, D2: { opensWhen: ["p1"] } });
    place(w, 1, { x: 3, y: 2 });
    const first = viewFor(w, 1, "deaf", false);
    first.seen?.splice(0, first.seen.length);
    expect(viewFor(w, 1, "deaf", false).seen?.length).toBeGreaterThan(0);
  });
});

describe("viewFor: a sequence door says it opens in order", () => {
  it("carries opens: sequence on a door in sequence mode", () => {
    const w = worldWith(
      [
        "####################",
        "#1..p.p.p..#.......#",
        "#2.....S...D.....E.#",
        "#3.........#.......#",
        "####################",
      ],
      {
        D1: { mode: "sequence", opensWhen: ["p2", "p1", "p3"] },
        S1: { shows: ["p2", "p1", "p3"] },
      },
    );
    place(w, 1, { x: 9, y: 2 });
    const door = viewFor(w, 1, "deaf", true).entities.find((e) => e.kind === "door");
    expect(door?.opens).toBe("sequence");
  });
});

const secretDoorIds = (room: ReturnType<typeof loadRooms>[number]) =>
  new Set(secretDoors(room).flatMap((d) => [d.chamber.id, d.vault.id]));

// The user (screenshots 57 and 58, room 3): Can't hear far along the corridor sees the glass run, and the
// camera's cone through it, but "the cone isn't shown at all" until they walk close. A camera is sent only when
// the tile it stands on is in sight; the one in room 3 stands on a wall behind the glass, out of sight from far
// away, so its cone went unsent although it falls on ground the seat can see. What a hazard in the dark does
// already (the lit part of its cone is sent as `sight`, nothing of where it stands) now holds for a camera that
// is out of sight: the seat is told where the camera looks on ground it can see, never the camera itself.
describe("a camera out of sight still shows its cone where the seat can see ground (room 3)", () => {
  const room = loadRooms().find((r) => r.id === "03-watchers") as ReturnType<typeof loadRooms>[0];
  const cameraObject = room.objects.find((o) => o.kind === "camera") as RoomObject;
  const FAR = { x: 8.5, y: 4.5 };
  const NEAR = { x: 22.5, y: 4.5 };
  const viewAt = (at: { x: number; y: number }) => {
    const world = createWorld(room, 1);
    world.players[1].pos = at;
    return viewFor(world, 1, "deaf", true);
  };
  // a point is inside a polygon (even-odd)
  const within = (poly: { x: number; y: number }[], at: { x: number; y: number }) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [a, b] = [poly[i], poly[j]] as [typeof at, typeof at];
      if (a.y > at.y !== b.y > at.y && at.x < ((b.x - a.x) * (at.y - a.y)) / (b.y - a.y) + a.x)
        hit = !hit;
    }
    return hit;
  };

  const polyArea = (poly: { x: number; y: number }[]) =>
    Math.abs(
      poly.reduce((sum, p, i) => {
        const q = poly[(i + 1) % poly.length] as typeof p;
        return sum + (p.x * q.y - q.x * p.y);
      }, 0),
    ) / 2;
  // how far a point is from the nearest edge of a polygon
  const edgeDistance = (poly: { x: number; y: number }[], q: { x: number; y: number }) => {
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j] as typeof q;
      const b = poly[i] as typeof q;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = Math.max(
        0,
        Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
      );
      best = Math.min(best, Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy)));
    }
    return best;
  };

  it("sends no camera from far away, as ADR 0012 says: it stands out of sight", () => {
    expect(viewAt(FAR).entities.some((e) => e.kind === "camera")).toBe(false);
  });

  it("sends the part of its cone that the seat's light covers, from far away, and nothing else", () => {
    // oracle: the camera's own cone (its fan from the room's parameters) and the seat's light polygon, taken
    // apart from perception.ts. A ground point is in the sent sight exactly when it is in both.
    const world = createWorld(room, 1);
    const cone = cameraCone(cameraObject);
    const fan = visiblePolygon(
      {
        origin: cameraApex(cameraObject),
        facing: cone.facing,
        fovDeg: cone.fovDeg,
        range: cone.range,
      },
      (tx, ty) => blocksSight(world, tx, ty, true),
      32,
    );
    let both = 0;
    let coneOnly = 0;
    let lightOnly = 0;
    const wrong: string[] = [];
    for (const at of [FAR, { x: 12.5, y: 5.5 }, { x: 14.5, y: 4.5 }]) {
      const view = viewAt(at);
      expect(view.entities.some((e) => e.kind === "camera")).toBe(false);
      const sight = view.entities.find((e) => e.kind === "sight");
      const polys = sight?.polys ?? [];
      const light = lightPolygon(at, room.grid, () => false);
      for (let x = 17; x < 28; x += 0.1)
        for (let y = 1.05; y < 8; y += 0.1) {
          const g = { x, y };
          const inCone = within(fan, g);
          const inSeatLight = inLight(light, g);
          const sent = polys.some((poly) => within(poly, g));
          // the cone's edge and the light's edge are lines: a point a hair from either may go either way
          if (edgeDistance(fan, g) < 0.05 || edgeDistance(light, g) < 0.05) continue;
          if (inCone && inSeatLight) both++;
          else if (inCone) coneOnly++;
          else if (inSeatLight) lightOnly++;
          if (sent !== (inCone && inSeatLight))
            wrong.push(`viewer ${at.x},${at.y} at ${x.toFixed(1)},${y.toFixed(2)} sent ${sent}`);
        }
    }
    expect(both, "ground in both the cone and the light").toBeGreaterThan(1000);
    expect(coneOnly, "cone the seat cannot see, which must not be sent").toBeGreaterThan(300);
    expect(lightOnly, "ground the seat sees outside the cone").toBeGreaterThan(1000);
    expect(wrong.slice(0, 6), `${wrong.length} ground points wrong`).toEqual([]);
  });

  // the client draws all the pieces of a sight as one shape: one non-zero clip for the fill, and an outline
  // kept to the outside by the even-odd rule. Both are only right if the pieces tile their region: no ground in
  // two pieces (it would be left out of the outline's inside, and drawn as a seam), and none lost between them.
  it("sends pieces that tile their region: no ground is in two of them", () => {
    for (const at of [FAR, { x: 12.5, y: 5.5 }, { x: 14.5, y: 4.5 }]) {
      const polys = viewAt(at).entities.find((e) => e.kind === "sight")?.polys ?? [];
      expect(polys.length, `pieces from ${at.x},${at.y}`).toBeGreaterThan(0);
      let covered = 0;
      const twice: string[] = [];
      for (let x = 17; x < 28; x += 0.05)
        for (let y = 1.02; y < 8; y += 0.05) {
          const g = { x, y };
          const n = polys.filter((poly) => within(poly, g) && edgeDistance(poly, g) > 0.01).length;
          if (n > 0) covered++;
          if (n > 1) twice.push(`${x.toFixed(2)},${y.toFixed(2)} in ${n}`);
        }
      expect(covered, `ground covered from ${at.x},${at.y}`).toBeGreaterThan(5000);
      expect(twice.slice(0, 4), `${twice.length} points in two pieces`).toEqual([]);
      // and the pieces' areas add up to the region they cover (no overlap, so the sum is the union)
      const sum = polys.reduce((n, poly) => n + polyArea(poly), 0);
      expect(sum, `total area from ${at.x},${at.y}`).toBeGreaterThan(5);
    }
  });

  it("sends nothing of where the camera stands", () => {
    const view = viewAt(FAR);
    const t = cameraObject.tiles[0] as { x: number; y: number };
    expect(view.entities.some((e) => e.kind === "camera")).toBe(false);
    for (const e of view.entities)
      if (e.kind !== "door")
        expect(Math.floor(e.pos.x) === t.x && Math.floor(e.pos.y) === t.y).toBe(false);
    // and no corner of the sent sight is the camera's apex, or inside the wall it stands on
    const apex = cameraApex(cameraObject);
    for (const poly of view.entities.find((e) => e.kind === "sight")?.polys ?? [])
      for (const p of poly) expect(Math.hypot(p.x - apex.x, p.y - apex.y) > 0.5).toBe(true);
  });

  it("sends the camera itself, as ever, once its tile is in sight, and no separate sight", () => {
    const view = viewAt(NEAR);
    expect(view.entities.some((e) => e.kind === "camera")).toBe(true);
    expect(view.entities.some((e) => e.kind === "sight")).toBe(false);
  });

  it("sends an idle camera's cone too, marked idle, so it can be drawn dashed as it is up close", () => {
    const world = createWorld(room, 1);
    world.players[1].pos = FAR;
    world.tick = Math.round(6000 / TICK_MS); // 6 s into the 8 s period: past its 2.5 s of watching (offset 0)
    const view = viewAt(FAR);
    const idle = viewFor(world, 1, "deaf", true).entities.find((e) => e.kind === "sight");
    expect(idle, "a sight for an idle camera").toBeDefined();
    expect(idle?.state).toBe("idle");
    expect(idle?.polys?.length).toBeGreaterThan(0);
    // the same ground as when it watches: only the state differs
    const watching = view.entities.find((e) => e.kind === "sight");
    expect(watching?.state).toBe("watching");
    expect(idle?.polys).toEqual(watching?.polys);
    // and still nothing of where the camera stands
    expect(viewFor(world, 1, "deaf", true).entities.some((e) => e.kind === "camera")).toBe(false);
  });

  it("sends nothing to Can't see", () => {
    const world = createWorld(room, 1);
    world.players[2].pos = FAR;
    expect(viewFor(world, 2, "blind", true).entities).toEqual([]);
  });
});

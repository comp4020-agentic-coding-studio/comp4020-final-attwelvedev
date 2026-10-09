import { describe, expect, it } from "vitest";
import { spectatorView, viewFor } from "./perception.ts";
import { caughtBy } from "./sim/hazards.ts";
import { step } from "./sim/step.ts";
import { gather, place, tap, worldFrom, worldWith } from "./sim/testing.ts";
import { TICK_MS } from "./sim/world.ts";

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

  it("blind gets no entities even when an object lists blind in visibleTo", () => {
    const w = world();
    w.room.objects.find((o) => o.id === "p1")?.visibleTo.push("blind");
    expect(viewFor(w, 0, "blind", false).entities).toEqual([]); // blind still sees nothing
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
  const sign = (world: ReturnType<typeof worldWith>) =>
    viewFor(world, 1, "deaf", false).entities.find((e) => e.kind === "sign");

  it("starts with nothing done and no clock", () => {
    const view = sign(worldWith(GRID, objects));
    expect(view?.progress).toBe(0);
    expect(view?.window).toBeUndefined();
  });

  it("counts plates done in order, with the share of the 5 s window left", () => {
    const world = worldWith(GRID, objects);
    press(world, 6); // p2
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
    press(world, 6);
    press(world, 4);
    press(world, 8);
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

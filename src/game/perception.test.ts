import { describe, expect, it } from "vitest";
import { viewFor } from "./perception.ts";
import { step } from "./sim/step.ts";
import { place, worldFrom, worldWith } from "./sim/testing.ts";
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

  it("does not play a seat its own footsteps", () => {
    const w = world();
    w.players[0].moving = true;
    expect(viewFor(w, 0, "blind", false).sounds).toEqual([]);
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
    C1: { zone: [8, 1, 12, 3], periodS: 6, watchingS: 3, offsetS: 0 },
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

  it("deaf and mute get them, with the cone, zone and beam to draw", () => {
    for (const role of ["deaf", "mute"] as const) {
      const view = viewFor(hazardWorld(), 1, role, false);
      for (const kind of ["guard", "camera", "laser", "hide", "checkpoint", "loot", "sign"]) {
        expect(kinds(view)).toContain(kind);
      }
      expect(view.entities.find((e) => e.kind === "guard")?.cone).toEqual({
        fovDeg: 70,
        range: 6,
      });
      expect(view.entities.find((e) => e.kind === "camera")?.zone).toEqual([8, 1, 12, 3]);
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
    place(world, 0, { x: 17, y: 2 });
    step(world, {}, TICK_MS);
    expect(
      viewFor(world, 1, "deaf", false).entities.find((e) => e.kind === "checkpoint")?.state,
    ).toBe("reached");
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

    it("can be set off by being caught", () => {
      const grid = GRID.map((r, y) => (y === 1 ? `${r.slice(0, 9)}C${r.slice(10)}` : r));
      const world = worldWith(
        grid,
        { C1: { zone: [10, 1, 14, 3], periodS: 6, watchingS: 3, offsetS: 0 } },
        { flips: [{ kind: "alarm", trigger: "caught", durationS: 8 }] },
      );
      place(world, 1, { x: 12, y: 2 });
      step(world, {}, TICK_MS);
      expect(viewFor(world, 0, "mute", false).alarm).toBe(true);
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
      C1: { zone: [8, 1, 12, 3], periodS: 6, watchingS: 3, offsetS: 0 },
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
    place(world, 1, { x: 12, y: 2 });
    step(world, {}, TICK_MS);
    expect(viewFor(world, 0, "blind", false).sounds.some((s) => s.kind === "checkpoint")).toBe(
      true,
    );
  });
});

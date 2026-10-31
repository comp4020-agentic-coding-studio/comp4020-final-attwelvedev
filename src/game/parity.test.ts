import { describe, expect, it } from "vitest";
import { cueCaptions } from "../client/hud.ts";
import { type EntityView, type RoleView, type SoundCue, viewFor } from "./perception.ts";
import { tuneGroups } from "./sim/chimes.ts";
import { step } from "./sim/step.ts";
import { gather, hold, input, place, worldWith } from "./sim/testing.ts";
import { TICK_MS, type World, type WorldEvent } from "./sim/world.ts";

// THE SENSORY PARITY PROMISE. Whatever happens in a room reaches every role
// through something that role can perceive: Can't see and Can't speak HEAR it
// (and it is captioned), Can't hear SEES it, in the same tick. There is one row
// per sound the game can make; adding a sound without a row here fails the build
// (the Record type), and a row that can't show both halves fails the test.
// "Heard" means heard within the sound's range: the sounds the world makes fade
// with distance (a plate click carries 8 tiles, a footstep 12), so these scenarios
// stand the listener within it; the sounds the game makes to the team carry the
// whole room. Distance changes how far a sound goes, never whether it has a sight.
// The one deliberate exception is the alarm, which silences every other cue for
// the roles that hear: that is its whole point, and the sighted still see it all.
// Sounds with no picture by design are rows marked `exempt` with the reason: the clue chime,
// the tumbler and the earpiece. UV ink and goggle sight are pictures with no sound: they change
// only what a holder sees, and perception.test.ts checks that both are gated by the gear.

type Scenario = {
  world: World;
  act: () => void; // does the thing, in one or more ticks
  // what Can't hear sees: compared before and after, or true of the view after
  sees: (before: RoleView, after: RoleView) => boolean;
  // set when the sighted need nothing extra: why that is true (a reviewer reads it)
  exempt?: string;
};

const BASE = [
  "##############################",
  "#1............................#",
  "#2............................#",
  "#3............................#",
  "##############################",
];
// BASE with single tiles changed: put([x, y, "p"], ...). The spawns stay where they are.
const put = (...cells: [number, number, string][]): string[] =>
  BASE.map((line, y) =>
    [...line].map((ch, x) => cells.find(([cx, cy]) => cx === x && cy === y)?.[2] ?? ch).join(""),
  );

const BLIND = 0;
const DEAF = 1;
const ent = (v: RoleView, id: string): EntityView | undefined =>
  v.entities.find((e) => e.id === id);
const east = (seat: 0 | 1 | 2) => ({ [seat]: input(1, 0) });
const go = (w: World) => step(w, {}, TICK_MS);
// steps until the world says `kind` happened (a push takes a moment to complete)
const until = (w: World, kind: WorldEvent["kind"], inputs = {}) => {
  for (let i = 0; i < 30 && !w.events.some((e) => e.kind === kind); i++) step(w, inputs, TICK_MS);
};

const SEQ = [
  "####################",
  "#1..p.p.p..#.......#",
  "#2.....S...D.....E.#",
  "#3.........#.......#",
  "####################",
];
const SEQ_OBJECTS = {
  D1: { mode: "sequence", opensWhen: ["p2", "p1", "p3"] },
  S1: { shows: ["p2", "p1", "p3"] },
};
const seqWorld = () => worldWith(SEQ, SEQ_OBJECTS);
// Plates in a sequence are held (FR11), so each press is by the seat that then stays on it.
const press = (w: World, x: number, seat: 0 | 1 | 2 = 0) => {
  place(w, seat, { x, y: 1 });
  go(w);
};
const sign = (v: RoleView) => ent(v, "S1");

// Stations, gear and signals (escape-room phase 01). The listener stands at (2, 2), the station's
// parts lie east of it in the open room, and DEAF stands in sight at the spawn.
const stationAt = (q: Record<string, unknown>, cells: [number, number, string][] = [], more = {}) =>
  worldWith(put([6, 1, "Q"], ...cells), { Q1: q, ...more });
const actBy = (w: World, seat: 0 | 1 | 2, tile: { x: number; y: number }) => {
  place(w, seat, tile);
  step(w, { [seat]: input(0, 0, true) }, TICK_MS);
};
const shows = (v: RoleView, id = "Q1") => ent(v, id)?.station?.shows;
const solvedIn = (v: RoleView) => ent(v, "Q1")?.station?.solved === true;
const PADS = [
  [5, 1],
  [7, 1],
];
const KEYS = [0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => [8 + x, 1 + y]));
const MUTE = 2;

const PARITY: Record<SoundCue["kind"], Scenario> = {
  tick: (() => {
    const world = stationAt({ type: "dial", pads: PADS, back: [6, 3], digits: 1 });
    place(world, BLIND, { x: 4, y: 2 });
    return {
      world,
      act: () => actBy(world, MUTE, { x: 7, y: 1 }),
      sees: (b, a) => shows(b)?.[0] !== shows(a)?.[0],
    };
  })(),
  tumbler: (() => {
    const world = stationAt({ type: "dial", pads: PADS, back: [6, 3], digits: 1 }, [[6, 2, "g"]], {
      g1: { item: "stethoscope" },
    });
    Object.assign(world.gear[0] as object, { heldBy: BLIND, at: null });
    place(world, BLIND, { x: 6, y: 2 });
    const s = world.stations.Q1;
    if (s) s.input[0] = ((s.answer[0] as number) + 9) % 10;
    return {
      world,
      act: () => actBy(world, MUTE, { x: 7, y: 1 }),
      sees: () => true,
      exempt:
        "The tumbler is a sound with no picture by design (spec FR6, FR20): only a stethoscope at the safe's back hears the right number, like the clue chime.",
    };
  })(),
  key: (() => {
    const world = stationAt({ type: "keypad", keys: KEYS, length: 3 });
    const first = KEYS[world.stations.Q1?.answer[0] as number] as number[]; // the right key: no dye
    place(world, BLIND, { x: 6, y: 2 });
    return {
      world,
      act: () => actBy(world, MUTE, { x: first[0] as number, y: first[1] as number }),
      sees: (b, a) => (shows(a)?.length ?? 0) > (shows(b)?.length ?? 0),
    };
  })(),
  practice: (() => {
    // a keypad with its practice lever on: the right key sounds as "practice", never as a real key,
    // and Can't hear sees the keypad dimmed (the station's `practice` field)
    const world = worldWith(put([6, 1, "Q"], [4, 3, "v"]), {
      Q1: { type: "keypad", keys: KEYS, length: 3, practice: "v1" },
    });
    actBy(world, MUTE, { x: 4, y: 3 }); // the lever on
    go(world);
    const first = KEYS[world.stations.Q1?.answer[0] as number] as number[];
    place(world, BLIND, { x: 6, y: 2 });
    return {
      world,
      act: () => actBy(world, MUTE, { x: first[0] as number, y: first[1] as number }),
      // the keypad is drawn dimmed before and after (the lever is on the whole time): what the
      // sighted see of a practice press is that nothing counts: the pad shows no key pressed
      sees: (b, a) =>
        ent(b, "Q1")?.station?.practice === true &&
        ent(a, "Q1")?.station?.practice === true &&
        (shows(a)?.length ?? 0) === 0,
    };
  })(),
  snap: (() => {
    const world = stationAt({
      type: "wires",
      wires: [
        [8, 1],
        [9, 1],
        [10, 1],
      ],
    });
    const right = world.stations.Q1?.answer[0] as number;
    place(world, BLIND, { x: 6, y: 2 });
    return {
      world,
      act: () => actBy(world, MUTE, { x: 8 + right, y: 1 }),
      sees: (b, a) => !solvedIn(b) && solvedIn(a),
    };
  })(),
  static: (() => {
    const world = stationAt({ type: "radio", pads: PADS, range: 10 });
    place(world, BLIND, { x: 4, y: 2 });
    return {
      world,
      act: () => go(world),
      sees: (_b, a) => !solvedIn(a) && shows(a)?.[0] === 0,
    };
  })(),
  tone: (() => {
    const world = stationAt({ type: "radio", pads: PADS, range: 10 });
    const s = world.stations.Q1;
    if (s) s.input[0] = (s.answer[0] as number) - 1;
    place(world, BLIND, { x: 4, y: 2 });
    return {
      world,
      act: () => actBy(world, MUTE, { x: 7, y: 1 }),
      sees: (_b, a) => solvedIn(a),
    };
  })(),
  pip: (() => {
    const world = stationAt({ type: "radio", pads: PADS, range: 10 });
    const s = world.stations.Q1;
    if (s) s.solved = true;
    world.tick = 39; // the next tick pips
    place(world, BLIND, { x: 4, y: 2 });
    return {
      world,
      act: () => go(world),
      sees: (_b, a) => shows(a)?.length === 2, // the light blinks the digit
    };
  })(),
  clunk: (() => {
    const world = stationAt({
      type: "switches",
      buttons: KEYS.slice(0, 6),
      lamps: [
        [14, 1],
        [15, 1],
        [16, 1],
        [14, 2],
        [15, 2],
        [16, 2],
      ],
    });
    place(world, BLIND, { x: 6, y: 2 });
    return {
      world,
      act: () => actBy(world, MUTE, { x: 8, y: 1 }),
      sees: (b, a) => shows(b)?.join() !== shows(a)?.join(),
    };
  })(),
  bellnote: (() => {
    const world = stationAt({
      type: "bells",
      bells: [
        [8, 1],
        [9, 1],
        [10, 1],
        [11, 1],
      ],
      tune: [6, 3],
    });
    const first = world.stations.Q1?.answer[0] as number; // the right bell: no dye
    place(world, BLIND, { x: 6, y: 2 });
    return {
      world,
      act: () => actBy(world, MUTE, { x: 8 + first, y: 1 }),
      sees: (b, a) => (shows(a)?.length ?? 0) > (shows(b)?.length ?? 0),
    };
  })(),
  bell: (() => {
    const world = worldWith(put([12, 1, "b"]));
    return {
      world,
      act: () => actBy(world, MUTE, { x: 12, y: 1 }),
      sees: (b, a) => ent(b, "b1")?.state !== "on" && ent(a, "b1")?.state === "on",
    };
  })(),
  dye: (() => {
    const world = stationAt({
      type: "wires",
      wires: [
        [8, 1],
        [9, 1],
        [10, 1],
      ],
    });
    const wrong = ((world.stations.Q1?.answer[0] as number) + 1) % 3;
    return {
      world,
      act: () => actBy(world, MUTE, { x: 8 + wrong, y: 1 }),
      sees: (_b, a) => ent(a, "P1")?.dyed === true,
    };
  })(),
  earpiece: (() => {
    const world = stationAt({ type: "keypad", keys: KEYS, clue: "g1", length: 3 }, [[3, 3, "g"]], {
      g1: { item: "earpiece" },
    });
    Object.assign(world.gear[0] as object, { heldBy: BLIND, at: null });
    world.tick = tuneGroups(world.stations.Q1?.answer ?? []).period - 1; // the next tick starts the tune
    return {
      world,
      act: () => go(world),
      sees: () => true,
      exempt:
        "The earpiece is a private tone feed with no picture by design (spec FR17): only its holder hears it, like the clue chime.",
    };
  })(),
  lever: (() => {
    const world = worldWith(put([12, 1, "v"]), {});
    return {
      world,
      act: () => actBy(world, MUTE, { x: 12, y: 1 }),
      sees: (b, a) => ent(b, "v1")?.state !== "on" && ent(a, "v1")?.state === "on",
    };
  })(),
  gear: (() => {
    const world = worldWith(put([4, 2, "g"]), { g1: { item: "uv" } });
    return {
      world,
      act: () => actBy(world, MUTE, { x: 4, y: 2 }),
      sees: (b, a) => ent(b, "g1") !== undefined && ent(a, "P2")?.item === "uv",
    };
  })(),
  solved: (() => {
    const world = stationAt({ type: "radio", pads: PADS, range: 10 });
    const s = world.stations.Q1;
    if (s) s.input[0] = (s.answer[0] as number) - 1;
    place(world, BLIND, { x: 25, y: 2 });
    return {
      world,
      act: () => actBy(world, MUTE, { x: 7, y: 1 }),
      sees: (b, a) => !solvedIn(b) && solvedIn(a),
    };
  })(),
  footsteps: (() => {
    const world = worldWith(BASE);
    place(world, 0, { x: 5, y: 1 });
    place(world, 2, { x: 10, y: 1 });
    return {
      world,
      act: () => step(world, east(2), TICK_MS),
      sees: (b, a) => (ent(a, "P2")?.pos.x ?? 0) > (ent(b, "P2")?.pos.x ?? 0),
    };
  })(),
  step: (() => {
    const world = worldWith(BASE);
    return {
      world,
      act: () => step(world, east(BLIND), TICK_MS),
      sees: (b, a) => (ent(a, "P0")?.pos.x ?? 0) > (ent(b, "P0")?.pos.x ?? 0),
    };
  })(),
  bump: (() => {
    const world = worldWith(BASE);
    place(world, BLIND, { x: 1, y: 2 });
    return {
      world,
      act: () => hold(world, { [BLIND]: input(-1, 0) }, 8),
      sees: () => true,
      exempt: "heard only by the player who bumps, who watches their own avatar stop at the wall",
    };
  })(),
  hum: (() => {
    const world = worldWith(put([7, 2, "p"]));
    return {
      world,
      act: () => {
        place(world, BLIND, { x: 7, y: 2 });
        go(world);
      },
      sees: (_b, a) => ent(a, "p1")?.state === "pressed",
    };
  })(),
  plate: (() => {
    const world = worldWith(put([5, 2, "p"]));
    return {
      world,
      act: () => {
        place(world, DEAF, { x: 5, y: 2 });
        go(world);
      },
      sees: (b, a) => ent(b, "p1")?.state === "up" && ent(a, "p1")?.state === "pressed",
    };
  })(),
  "plate-up": (() => {
    const world = worldWith(put([5, 2, "p"]));
    place(world, DEAF, { x: 5, y: 2 });
    go(world);
    return {
      world,
      act: () => {
        place(world, DEAF, { x: 12, y: 2 });
        go(world);
      },
      sees: (b, a) => ent(b, "p1")?.state === "pressed" && ent(a, "p1")?.state === "up",
    };
  })(),
  door: (() => {
    const grid = ["##########", "#1.p.D..E#", "#2.p.D...#", "#3.p.D...#", "##########"];
    const world = worldWith(grid, { D1: { opensWhen: ["p1", "p2", "p3"] } });
    return {
      world,
      act: () => {
        place(world, 0, { x: 3, y: 1 });
        place(world, 1, { x: 3, y: 2 });
        place(world, 2, { x: 3, y: 3 });
        go(world);
      },
      sees: (b, a) => ent(b, "D1")?.state === "closed" && ent(a, "D1")?.state === "open",
    };
  })(),
  crate: (() => {
    const world = worldWith(put([5, 2, "B"]));
    place(world, DEAF, { x: 4, y: 2 });
    return {
      world,
      act: () => until(world, "crate", east(DEAF)),
      sees: (b, a) => (ent(a, "B1")?.pos.x ?? 0) > (ent(b, "B1")?.pos.x ?? 0),
    };
  })(),
  loot: (() => {
    const world = worldWith(put([6, 2, "$"]));
    return {
      world,
      act: () => {
        place(world, DEAF, { x: 6, y: 2 });
        go(world);
      },
      sees: (b, a) => ent(b, "$1") !== undefined && ent(a, "$1") === undefined,
    };
  })(),
  flag: (() => {
    const world = worldWith(put([5, 2, "K"]));
    return {
      world,
      act: () => {
        place(world, DEAF, { x: 5, y: 2 });
        go(world);
      },
      sees: (_b, a) => ent(a, "K1")?.present === 1,
    };
  })(),
  checkpoint: (() => {
    const world = worldWith(put([5, 2, "K"]));
    return {
      world,
      act: () => {
        gather(world, { x: 5, y: 2 });
        go(world);
      },
      sees: (b, a) => ent(b, "K1")?.state === "up" && ent(a, "K1")?.state === "reached",
    };
  })(),
  exit: (() => {
    const world = worldWith(put([5, 2, "E"]));
    return {
      world,
      act: () => {
        place(world, DEAF, { x: 5, y: 2 });
        go(world);
      },
      sees: (b, a) => ent(b, "E1")?.state !== "occupied" && ent(a, "E1")?.state === "occupied",
    };
  })(),
  cleared: (() => {
    const world = worldWith(put([5, 2, "E"]));
    return {
      world,
      act: () => {
        gather(world, { x: 5, y: 2 });
        go(world);
      },
      sees: (b, a) => b.status === "playing" && a.status === "cleared",
    };
  })(),
  hide: (() => {
    const world = worldWith(put([4, 2, "h"]));
    return {
      world,
      act: () => {
        place(world, DEAF, { x: 4, y: 2 });
        go(world);
      },
      sees: (b, a) => ent(b, "P1")?.state !== "hidden" && ent(a, "P1")?.state === "hidden",
    };
  })(),
  "seq-ok": (() => {
    const world = seqWorld();
    return {
      world,
      act: () => press(world, 6),
      sees: (_b, a) => sign(a)?.progress === 1 && sign(a)?.flash === "ok",
    };
  })(),
  "seq-wrong": (() => {
    const world = seqWorld();
    return {
      world,
      act: () => press(world, 4),
      sees: (_b, a) => sign(a)?.flash === "wrong",
    };
  })(),
  "seq-open": (() => {
    const world = seqWorld();
    press(world, 6, 0);
    press(world, 4, 1);
    return {
      world,
      act: () => press(world, 8, 2),
      sees: (b, a) => (sign(b)?.progress ?? 0) < 3 && sign(a)?.progress === 3,
    };
  })(),
  clue: (() => {
    const world = worldWith(put([6, 2, "c"]), { c1: { n: 2, everyS: 1 } });
    world.tick = 19; // the next tick is when it chimes
    place(world, BLIND, { x: 3, y: 2 });
    return {
      world,
      act: () => go(world),
      sees: () => true,
      exempt:
        "A clue is the one sound with no picture: rooms use it for twin and split cues (A2), and the linter only allows it inside a beat that declares one.",
    };
  })(),
  guard: (() => {
    const world = worldWith(put([11, 2, "G"]), {
      G1: {
        patrol: [
          [11, 2],
          [22, 2],
        ],
        speedTps: 1.5,
        sightTiles: 3,
        fovDeg: 20,
      },
    });
    place(world, BLIND, { x: 8, y: 1 });
    return {
      world,
      act: () => hold(world, {}, 4),
      sees: (b, a) => (ent(a, "G1")?.pos.x ?? 0) > (ent(b, "G1")?.pos.x ?? 0),
    };
  })(),
  camera: (() => {
    const world = worldWith(put([9, 1, "C"]), {
      C1: { facingDeg: 0, fovDeg: 90, range: 8, periodS: 6, watchingS: 3, offsetS: 0 },
    });
    world.tick = 119; // the next tick is when it starts looking
    return {
      world,
      act: () => go(world),
      sees: (b, a) => ent(b, "C1")?.state === "idle" && ent(a, "C1")?.state === "watching",
    };
  })(),
  laser: (() => {
    const world = worldWith(put([10, 1, "L"]), {
      L1: { dir: "down", onS: 2, offS: 2, offsetS: 0 },
    });
    place(world, BLIND, { x: 12, y: 3 });
    return {
      world,
      act: () => go(world),
      sees: (_b, a) => ent(a, "L1")?.state === "on",
    };
  })(),
  caught: (() => {
    const world = worldWith(put([9, 1, "C"]), {
      C1: { facingDeg: 0, fovDeg: 90, range: 8, periodS: 6, watchingS: 3, offsetS: 0 },
    });
    place(world, DEAF, { x: 12, y: 2 });
    return {
      world,
      act: () => go(world),
      sees: (b, a) => (ent(a, "P1")?.pos.x ?? 0) < (ent(b, "P1")?.pos.x ?? 0) - 5,
    };
  })(),
  alarm: (() => {
    const world = worldWith(
      put([5, 2, "p"]),
      {},
      {
        flips: [{ kind: "alarm", trigger: "p1", durationS: 8 }],
      },
    );
    return {
      world,
      act: () => {
        place(world, DEAF, { x: 5, y: 2 });
        go(world);
      },
      sees: (_b, a) => a.alarm,
    };
  })(),
};

describe("sensory parity: every sound has a sight, and every sound is captioned", () => {
  for (const [kind, scenario] of Object.entries(PARITY) as [SoundCue["kind"], Scenario][]) {
    it(`${kind}: heard by Can't see, seen by Can't hear, in the same tick`, () => {
      const before = viewFor(scenario.world, DEAF, "deaf", false);
      scenario.act();
      const heard = viewFor(scenario.world, BLIND, "blind", false).sounds;
      const after = viewFor(scenario.world, DEAF, "deaf", false);
      expect(
        heard.some((s) => s.kind === kind),
        `Can't see should hear "${kind}"; heard ${JSON.stringify(heard.map((s) => s.kind))}`,
      ).toBe(true);
      expect(after.sounds, "Can't hear is told nothing in sound").toEqual([]);
      expect(scenario.sees(before, after), `Can't hear should see what "${kind}" is`).toBe(true);
      if (scenario.exempt) expect(scenario.exempt.length).toBeGreaterThan(20); // a real reason
    });
  }

  it("captions every sound, except your own steps, which you made yourself", () => {
    for (const kind of Object.keys(PARITY) as SoundCue["kind"][]) {
      const captions = cueCaptions([{ kind, pan: 0.5, gain: 1, n: 2 }]);
      if (kind === "step") expect(captions).toEqual([]);
      else expect(captions.length, `"${kind}" needs a caption`).toBeGreaterThan(0);
    }
  });

  it("the alarm is the one thing that silences the rest, for those who hear", () => {
    const world = worldWith(
      put([5, 2, "p"]),
      {},
      {
        flips: [{ kind: "alarm", trigger: "p1", durationS: 8 }],
      },
    );
    place(world, DEAF, { x: 5, y: 2 });
    go(world);
    place(world, 2, { x: 10, y: 1 });
    world.players[2].moving = true;
    for (const [seat, role] of [
      [BLIND, "blind"],
      [2, "mute"],
    ] as const) {
      expect(viewFor(world, seat, role, false).sounds.map((s) => s.kind)).toEqual(["alarm"]);
    }
  });
});

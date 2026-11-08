// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { ClientMsg } from "../net/protocol.ts";
import {
  bareScene,
  installPlaytest,
  type PlaytestHook,
  playtestFrame,
  uninstallPlaytest,
} from "./playtest.ts";
import type { Scene } from "./render/index.ts";
import type { GameSocket } from "./socket.ts";

type W = { __playtest?: PlaytestHook; __cuesPlayed?: string[] };
const w = () => window as unknown as W;

const sent: ClientMsg[] = [];
const socket = { send: (m: ClientMsg) => sent.push(m) } as unknown as GameSocket;

// A 2d context that only answers getImageData, with every pixel a known grey.
const ctx = {
  canvas: { width: 200, height: 100 },
  getImageData: () => ({ data: new Uint8ClampedArray([7, 8, 9, 255]) }),
} as unknown as CanvasRenderingContext2D;

const scene = (): Scene => ({
  w: 100,
  h: 50,
  role: "deaf",
  seat: 1,
  roles: ["blind", "deaf", "mute"],
  tiles: ["###", "#.#", "###"],
  entities: [],
  self: { x: 1.5, y: 1.5 },
  layout: "follow",
  cam: { scale: 10, ox: 0, oy: 0 } as Scene["cam"],
  report: { chips: [{ x: 1, y: 2, w: 3, h: 4 }], plaques: [] },
});

afterEach(() => uninstallPlaytest());

describe("the playtest page hook", () => {
  it("is not there until installed", () => {
    expect(w().__playtest).toBeUndefined();
    expect(w().__cuesPlayed).toBeUndefined();
    playtestFrame(ctx, scene()); // a no-op without the hook
    expect(w().__playtest).toBeUndefined();
  });

  it("gives the last frame drawn: its seat, role, camera, labels and boxes", () => {
    installPlaytest(socket);
    expect(w().__cuesPlayed).toEqual([]);
    expect(w().__playtest?.frame()).toBeNull();
    const labels = [{ kind: "door", text: "Door", at: { x: 1, y: 0 } }];
    playtestFrame(ctx, scene(), labels);
    expect(w().__playtest?.frame()).toEqual({
      seat: 1,
      role: "deaf",
      cam: scene().cam,
      labels,
      boxes: [{ x: 1, y: 2, w: 3, h: 4 }],
    });
  });

  it("answers a sample on the next frame drawn, not before", async () => {
    installPlaytest(socket);
    let done = false;
    const asked = w().__playtest?.sample([{ x: 1, y: 1 }]);
    asked?.then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    playtestFrame(ctx, scene());
    const samples = await asked;
    expect(samples?.[0]?.at).toEqual({ x: 1, y: 1 });
    expect(samples?.[0]?.drawn).toEqual([7, 8, 9, 255]);
  });

  it("sends autopilot on the page's own socket", () => {
    installPlaytest(socket);
    w().__playtest?.autopilot(true);
    expect(sent.at(-1)).toEqual({ t: "autopilot", on: true });
  });
});

describe("bareScene", () => {
  it("drops every entity but the closed doors, which the light is cut by", () => {
    const door = { id: "D1", kind: "door", pos: { x: 5.5, y: 1.5 }, state: "closed" };
    const open = { id: "D2", kind: "door", pos: { x: 6.5, y: 1.5 }, state: "open" };
    const crate = { id: "K1", kind: "crate", pos: { x: 2.5, y: 1.5 } };
    const bare = bareScene({
      ...scene(),
      entities: [door, open, crate],
      floorEntities: [crate],
    } as unknown as Scene);
    expect(bare.entities.map((e) => e.id)).toEqual(["D1"]);
    expect(bare.floorEntities).toEqual([]);
    expect(bare.fx).toEqual([]);
    expect(bare.report).toBeUndefined();
  });
});

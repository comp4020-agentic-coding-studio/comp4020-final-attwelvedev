import { describe, expect, it } from "vitest";
import { step } from "../game/sim/step.ts";
import { roomFrom } from "../game/sim/testing.ts";
import { createWorld, TICK_MS } from "../game/sim/world.ts";
import type { PlayerInput, Vec } from "../game/types.ts";
import { createPredictor } from "./predict.ts";

const EMPTY = [
  "##############",
  "#1...........#",
  "#2...........#",
  "#3...........#",
  "#............#",
  "#............#",
  "##############",
];
const room = () => roomFrom(EMPTY);
const near = (a: Vec, b: Vec) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
};

describe("createPredictor", () => {
  it("predicts the same positions as step for the same inputs on an empty room", () => {
    const world = createWorld(room());
    const predictor = createPredictor({ ...world.players[0].pos }, world.room.grid);
    const script: [number, number][] = [
      [1, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [0.3, -0.7],
      [0, 0],
      [1, 0],
    ];
    for (const [i, [x, y]] of script.entries()) {
      const move: PlayerInput = { seq: i + 1, move: { x, y }, act: false };
      step(world, { 0: move }, TICK_MS);
      near(predictor.apply(move, TICK_MS), world.players[0].pos);
    }
  });

  it("stops at walls exactly where step does", () => {
    const world = createWorld(room());
    const predictor = createPredictor({ ...world.players[0].pos }, world.room.grid);
    for (let i = 0; i < 80; i++) {
      const move: PlayerInput = { seq: i + 1, move: { x: 1, y: i % 4 === 0 ? -1 : 1 }, act: false };
      step(world, { 0: move }, TICK_MS);
      near(predictor.apply(move, TICK_MS), world.players[0].pos);
    }
  });

  it("walks through an open door only once it has seen the door open", () => {
    const grid = ["########", "#1..D..#", "#2..D..#", "#3..D..#", "########"];
    const r = roomFrom(grid);
    const predictor = createPredictor({ x: 1.5, y: 2.5 }, r.grid);
    let pos = { x: 1.5, y: 2.5 };
    for (let i = 0; i < 30; i++)
      pos = predictor.apply({ seq: i + 1, move: { x: 1, y: 0 }, act: false }, TICK_MS);
    expect(pos.x).toBeLessThanOrEqual(4 - 0.4 + 1e-9);
    predictor.observe([{ id: "D1", kind: "door", pos: { x: 4.5, y: 2.5 }, state: "open" }]);
    for (let i = 0; i < 30; i++)
      pos = predictor.apply({ seq: 100 + i, move: { x: 1, y: 0 }, act: false }, TICK_MS);
    expect(pos.x).toBeGreaterThan(5);
  });

  it("is stopped by a crate it has seen", () => {
    const predictor = createPredictor({ x: 1.5, y: 1.5 }, room().grid);
    predictor.observe([{ id: "B1", kind: "crate", pos: { x: 4.5, y: 1.5 } }]);
    let pos = { x: 1.5, y: 1.5 };
    for (let i = 0; i < 30; i++)
      pos = predictor.apply({ seq: i + 1, move: { x: 1, y: 0 }, act: false }, TICK_MS);
    expect(pos.x).toBeLessThanOrEqual(4 - 0.4 + 1e-9);
  });

  it("reconcile with a later ack replays only the unacked inputs", () => {
    const predictor = createPredictor({ x: 1.5, y: 1.5 }, room().grid);
    const right = (seq: number): PlayerInput => ({ seq, move: { x: 1, y: 0 }, act: false });
    for (let seq = 1; seq <= 5; seq++) predictor.apply(right(seq), TICK_MS);
    // the server has applied seqs 1..3 and says the avatar is at x = 3 (not where we guessed)
    const after = predictor.reconcile({ x: 3, y: 1.5 }, 3);
    near(after, { x: 3 + 2 * 0.2, y: 1.5 }); // two inputs left, 0.2 tiles each
    // a later ack drops more, and a repeat of the same ack changes nothing
    near(predictor.reconcile({ x: 3.2, y: 1.5 }, 4), { x: 3.4, y: 1.5 });
    near(predictor.reconcile({ x: 3.2, y: 1.5 }, 4), { x: 3.4, y: 1.5 });
    near(predictor.reconcile({ x: 3.4, y: 1.5 }, 5), { x: 3.4, y: 1.5 });
  });

  it("with everything acked, the server position is the answer", () => {
    const predictor = createPredictor({ x: 1.5, y: 1.5 }, room().grid);
    predictor.apply({ seq: 1, move: { x: 1, y: 0 }, act: false }, TICK_MS);
    near(predictor.reconcile({ x: 7, y: 2 }, 1), { x: 7, y: 2 });
  });
});

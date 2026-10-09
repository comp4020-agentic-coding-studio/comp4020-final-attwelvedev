import { describe, expect, it } from "vitest";
import { findPath, nearestReachable, planSafe, STEP_TICKS, type Step } from "./path.ts";

const open = (rows: string[]) => ({
  width: rows[0]?.length ?? 0,
  height: rows.length,
  blocked: (x: number, y: number) => rows[y]?.[x] !== ".",
});

describe("findPath", () => {
  it("walks around a wall", () => {
    const g = open(["....", ".##.", "...."]);
    const path = findPath(g, { x: 0, y: 1 }, { x: 3, y: 1 });
    expect(path?.length).toBe(6);
    expect(path?.[0]).toEqual({ x: 0, y: 1 });
    expect(path?.at(-1)).toEqual({ x: 3, y: 1 });
  });

  it("goes round a closed door and through an open one", () => {
    const rows = ["....", "D...", "...."];
    const closed = {
      ...open(["....", "#...", "...."]),
      blocked: (x: number, y: number) => x === 0 && y === 1,
    };
    expect(findPath(closed, { x: 0, y: 0 }, { x: 0, y: 2 })?.length).toBe(5);
    const through = open(rows.map((r) => r.replace("D", ".")));
    expect(findPath(through, { x: 0, y: 0 }, { x: 0, y: 2 })?.length).toBe(3);
  });

  it("is null when the goal is walled in", () => {
    expect(findPath(open([".#.", ".#."]), { x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
  });
});

describe("nearestReachable", () => {
  it("picks the reachable tile closest to a goal it cannot reach", () => {
    const g = open([".#.", ".#."]);
    expect(nearestReachable(g, { x: 0, y: 0 }, { x: 2, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe("planSafe", () => {
  const g = open(["........"]);
  const never = () => false;

  it("takes one step per tile when nothing is dangerous", () => {
    const plan = planSafe({
      ...g,
      from: { x: 0, y: 0 },
      to: { x: 4, y: 0 },
      tick: 0,
      danger: never,
    });
    expect(plan).toEqual(["right", "right", "right", "right"]);
  });

  it("waits for a tile that is dangerous for a while", () => {
    // tile 2 is deadly until tick 40
    const danger = (x: number, _y: number, t: number) => x === 2 && t < 40;
    const plan = planSafe({
      ...g,
      from: { x: 0, y: 0 },
      to: { x: 4, y: 0 },
      tick: 0,
      danger,
    }) as Step[];
    expect(plan.filter((s) => s === "wait").length).toBeGreaterThan(0);
    // follow it: nobody is on tile 2 while it is deadly
    let x = 0;
    plan.forEach((s, i) => {
      const t0 = i * STEP_TICKS;
      const nx = s === "right" ? x + 1 : x;
      for (let t = t0; t < t0 + STEP_TICKS; t++) {
        if (x === 2 || nx === 2) expect(t).toBeGreaterThanOrEqual(40);
      }
      x = nx;
    });
    expect(x).toBe(4);
  });

  it("keeps clear of a tile that is dangerous when it arrives, with a tick of margin", () => {
    const danger = (x: number, _y: number, t: number) => x === 1 && t === 3;
    const plan = planSafe({
      ...g,
      from: { x: 0, y: 0 },
      to: { x: 2, y: 0 },
      tick: 0,
      danger,
    }) as Step[];
    expect(plan[0]).toBe("wait");
  });

  it("is null when no safe way exists inside the horizon", () => {
    const danger = (x: number) => x === 2;
    expect(
      planSafe({ ...g, from: { x: 0, y: 0 }, to: { x: 4, y: 0 }, tick: 0, danger }),
    ).toBeNull();
  });

  it("needs the goal to stay safe for a while after arriving", () => {
    const danger = (x: number, _y: number, t: number) => x === 3 && t >= 30 && t < 200;
    const plan = planSafe({
      ...g,
      from: { x: 0, y: 0 },
      to: { x: 3, y: 0 },
      tick: 0,
      danger,
      dwell: 6,
    });
    // arriving by tick 15 would be ambushed at 30, so it must hold back until the danger is over
    expect(plan?.length).toBeGreaterThan(10);
  });
});

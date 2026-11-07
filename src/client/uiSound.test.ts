import { describe, expect, it } from "vitest";
import { UI_PLANS, type UiSoundKind, uiSound } from "./uiSound.ts";

const fakeContext = () => {
  const counts = { started: 0 };
  const param = () => ({
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  const node = (): Record<string, unknown> => {
    const n: Record<string, unknown> = {
      frequency: param(),
      gain: param(),
      connect: (to: unknown) => to,
      start: () => {
        counts.started++;
      },
      stop() {},
    };
    return n;
  };
  const c = {
    currentTime: 0,
    state: "running",
    destination: {},
    createOscillator: node,
    createGain: node,
  };
  return { c: c as unknown as AudioContext, counts };
};

describe("uiSound", () => {
  it("plays nothing when menuSounds is off", () => {
    const { c, counts } = fakeContext();
    uiSound("press", { menuSounds: false }, c);
    expect(counts.started).toBe(0);
  });

  it("schedules nothing while the context is suspended (its clock is stuck at 0)", () => {
    const { c, counts } = fakeContext();
    (c as unknown as { state: string }).state = "suspended";
    (c as unknown as { resume: () => Promise<void> }).resume = () => Promise.resolve();
    uiSound("join", { menuSounds: true }, c);
    expect(counts.started).toBe(0);
    (c as unknown as { state: string }).state = "running";
    uiSound("join", { menuSounds: true }, c);
    expect(counts.started).toBe(UI_PLANS.join.length);
  });

  it("plays a node per note when menuSounds is on", () => {
    const { c, counts } = fakeContext();
    uiSound("toggle-on", { menuSounds: true }, c);
    expect(counts.started).toBe(UI_PLANS["toggle-on"].length);
  });

  it("never throws, with or without audio", () => {
    expect(() => uiSound("press", { menuSounds: true })).not.toThrow();
  });

  it("each kind's plan is distinct: toggle-on rises, toggle-off falls, error is low", () => {
    const [a, b] = UI_PLANS["toggle-on"] as [
      (typeof UI_PLANS)["press"][0],
      (typeof UI_PLANS)["press"][0],
    ];
    expect(b.hz).toBeGreaterThan(a.hz);
    const [c, d] = UI_PLANS["toggle-off"] as [
      (typeof UI_PLANS)["press"][0],
      (typeof UI_PLANS)["press"][0],
    ];
    expect(d.hz).toBeLessThan(c.hz);
    const lowest = (k: UiSoundKind) => Math.max(...UI_PLANS[k].map((n) => n.hz));
    for (const k of Object.keys(UI_PLANS) as UiSoundKind[]) {
      if (k !== "error") expect(lowest("error"), k).toBeLessThan(lowest(k));
    }
    const join = UI_PLANS.join;
    const leave = UI_PLANS.leave;
    expect(join[1]?.hz).toBeGreaterThan(join[0]?.hz ?? 0);
    expect(leave[1]?.hz).toBeLessThan(leave[0]?.hz ?? 0);
    const sigs = Object.values(UI_PLANS).map((p) => JSON.stringify(p));
    expect(new Set(sigs).size).toBe(sigs.length);
  });
});

describe("diffPeople", () => {
  it("a join, a leave, and a reorder (which is neither)", async () => {
    const { diffPeople } = await import("./uiSound.ts");
    expect(diffPeople(["a", "b"], ["a", "b", "c"])).toEqual({ joined: ["c"], left: [] });
    expect(diffPeople(["a", "b", "c"], ["a", "c"])).toEqual({ joined: [], left: ["b"] });
    expect(diffPeople(["a", "b", "c"], ["c", "a", "b"])).toEqual({ joined: [], left: [] });
  });
});

describe("peopleSound", () => {
  it("is a join or a leave while the lobby is open, and silent once the game is on", async () => {
    const { peopleSound } = await import("./uiSound.ts");
    expect(peopleSound(["a", "b"], ["a", "b", "c"], "open")).toBe("join");
    expect(peopleSound(["a", "b", "c"], ["a", "c"], "open")).toBe("leave");
    expect(peopleSound(["a", "b", "c"], ["a", "c"], "playing")).toBeNull();
    expect(peopleSound(["a", "b"], ["a", "b", "c"], "playing")).toBeNull();
    expect(peopleSound(["a", "b"], ["b", "a"], "open")).toBeNull();
  });
});

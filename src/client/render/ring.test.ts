// FR16: the ring is reserved for a station solved (big, at its anchor) and your landing (small, at
// your feet). Every other event moves its own object (FR15). Behavioural: no other event makes a
// ring. Structural: the only `kind: "ring"` in the client is at the two allowed sites, each marked.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EntityView } from "../../net/protocol.ts";
import { detectFx, type Fx, fxOfCacheEvent, fxOfCaught, fxOfCleared } from "../fx.ts";

const e = (over: Partial<EntityView> & Pick<EntityView, "id" | "kind">): EntityView => ({
  pos: { x: 5.5, y: 2.5 },
  ...over,
});
const a = e({ id: "P0", kind: "player", seat: 0, pos: { x: 2.5, y: 2.5 } });
const b = e({ id: "P1", kind: "player", seat: 1, pos: { x: 3.5, y: 2.5 } });
const parts = [{ key: "anchor" as const, at: [{ x: 5, y: 2 }] }];
const station = (over: Partial<NonNullable<EntityView["station"]>> = {}) =>
  e({
    id: "Q1",
    kind: "station",
    station: { type: "dial", shows: [3], solved: false, parts, ...over },
  });
const sign = e({ id: "S1", kind: "sign", progress: 1, shows: ["p1", "p2", "p3"] });

const SCENARIOS: [string, () => Fx[]][] = [
  [
    "plate press",
    () =>
      detectFx(
        [e({ id: "p1", kind: "plate", state: "up" })],
        [e({ id: "p1", kind: "plate", state: "pressed" })],
      ),
  ],
  [
    "plate release",
    () =>
      detectFx(
        [e({ id: "p1", kind: "plate", state: "pressed" })],
        [e({ id: "p1", kind: "plate", state: "up" })],
      ),
  ],
  [
    "door",
    () =>
      detectFx(
        [e({ id: "D1", kind: "door", state: "closed" })],
        [e({ id: "D1", kind: "door", state: "open" })],
      ),
  ],
  [
    "braille",
    () =>
      detectFx([e({ id: "o1", kind: "braille" })], [e({ id: "o1", kind: "braille", flash: "ok" })]),
  ],
  [
    "checkpoint",
    () =>
      detectFx(
        [e({ id: "K1", kind: "checkpoint", state: "up", present: 2 })],
        [e({ id: "K1", kind: "checkpoint", state: "reached", present: 3 })],
      ),
  ],
  ["seq up", () => detectFx([sign], [{ ...sign, progress: 2 }])],
  ["seq down", () => detectFx([sign], [{ ...sign, progress: 0 }])],
  ["seq done", () => detectFx([sign], [{ ...sign, progress: 3 }])],
  [
    "bell",
    () => detectFx([e({ id: "b1", kind: "bell" })], [e({ id: "b1", kind: "bell", state: "on" })]),
  ],
  [
    "crate",
    () =>
      detectFx(
        [e({ id: "B1", kind: "crate" })],
        [e({ id: "B1", kind: "crate", pos: { x: 6.5, y: 2.5 } })],
      ),
  ],
  ["loot", () => detectFx([e({ id: "$1", kind: "loot" }), a], [a])],
  ["gear", () => detectFx([{ ...a, item: "uv" }, b], [a, { ...b, item: "uv" }])],
  ["dye", () => detectFx([a, station()], [{ ...a, dyed: true }, station()])],
  ["hands", () => detectFx([a, b], [{ ...a, heldBy: 1 }, b])],
  [
    "lever",
    () =>
      detectFx(
        [e({ id: "L1", kind: "lever", state: "off" })],
        [e({ id: "L1", kind: "lever", state: "on" })],
      ),
  ],
  [
    "camera",
    () =>
      detectFx(
        [e({ id: "C1", kind: "camera", state: "idle" })],
        [e({ id: "C1", kind: "camera", state: "watching" })],
      ),
  ],
  ["station part", () => detectFx([station()], [station({ shows: [4] })])],
  ["jam", () => detectFx([station()], [station({ jammed: true })])],
  ["caught", () => fxOfCaught([{ ...a, pos: { x: 9.5, y: 2.5 } }], [a])],
  ["cleared", () => fxOfCleared([a, b])],
  ["keepsake take", () => fxOfCacheEvent({ result: "taken", at: a.pos, owner: 0, item: "watch" })],
  ["uncover", () => fxOfCacheEvent({ result: "uncover", at: a.pos, owner: 0 })],
];

describe("the ring is reserved (FR16)", () => {
  it.each(SCENARIOS)("%s makes its own motion and no ring", (_name, run) => {
    const fx = run();
    expect(fx.length, "it moves something").toBeGreaterThan(0);
    expect(fx.filter((f) => f.kind === "ring")).toEqual([]);
  });

  it("a station solved makes exactly one ring, big", () => {
    const rings = detectFx([station()], [station({ solved: true })]).filter(
      (f) => f.kind === "ring",
    );
    expect(rings).toHaveLength(1);
    expect(rings[0]?.big).toBe(true);
  });

  it('has `kind: "ring"` only at the two reserved sites, each marked', () => {
    const root = join(import.meta.dirname, "..", "..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
      }
    };
    walk(join(root, "client"));
    walk(join(root, "components"));
    const sites: string[] = [];
    const bad: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!/kind: "ring"/.test(line)) return;
        const where = `${file.slice(root.length + 1)}:${i + 1}`;
        // the mark sits on the line before, or the line before the object the kind opens
        const near = lines.slice(Math.max(0, i - 2), i).join("\n");
        if (near.includes("// ring: reserved (FR16)")) sites.push(where);
        else bad.push(where);
      });
    }
    expect(bad, "a ring outside the reserved sites").toEqual([]);
    expect(sites.map((s) => s.replace(/:\d+$/, "")).sort()).toEqual([
      "client/fx.ts",
      "components/Game.tsx",
    ]);
  });
});

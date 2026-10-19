import { describe, expect, it } from "vitest";
import { forecast } from "./rotation.ts";

describe("forecast", () => {
  it("seats everyone in every room with three or fewer people, bots filling the rest", () => {
    const f = forecast(2, 3);
    expect(f.rooms.map((r) => r.playing)).toEqual([
      [0, 1, null],
      [0, 1, null],
      [0, 1, null],
    ]);
    expect(f.rooms.every((r) => r.out.length === 0)).toBe(true);
    expect(f.plays).toEqual([3, 3]);
  });

  it("with five people names who sits out each room, and counts plays per person", () => {
    const f = forecast(5, 3);
    for (const room of f.rooms) {
      expect(room.playing.filter((p) => p !== null)).toHaveLength(3);
      expect(room.out).toHaveLength(2);
      // everyone is either playing or out, once
      const all = [...room.playing, ...room.out].filter((p) => p !== null);
      expect([...all].sort()).toEqual([0, 1, 2, 3, 4]);
    }
    expect(f.plays.reduce((a, b) => a + b, 0)).toBe(9);
    expect(Math.max(...f.plays) - Math.min(...f.plays)).toBeLessThanOrEqual(1);
  });

  it("follows the host's order: the first room's crew is the first three people", () => {
    const f = forecast(6, 2);
    expect(f.rooms[0]?.playing.slice().sort()).toEqual([0, 1, 2]);
    expect(f.rooms[1]?.playing.slice().sort()).toEqual([3, 4, 5]);
  });
});

import { describe, expect, it } from "vitest";
import type { Role } from "../game/types.ts";
import { forecast, nextRoomFor } from "./rotation.ts";

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

describe("nextRoomFor", () => {
  // `played` is what each person had played before the room at `roomIndex`, which is being played now
  const nobody = (n: number) => Array.from({ length: n }, () => ({ played: [] as Role[] }));
  it("is null when the room in play is the last one", () => {
    expect(nextRoomFor(3, nobody(4), 2, 3)).toBeNull();
  });
  it("names the next room, counting from 1, in which someone sitting out is seated", () => {
    // room 1 seats persons 0-2, so person 3, who has played nothing, plays room 2
    expect(nextRoomFor(3, nobody(4), 0, 3)).toBe(2);
  });
  it("follows the rotation on past rooms that other people play", () => {
    // six people: 0-2 play room 1, 3-5 play room 2, then 0-2 again
    expect(nextRoomFor(4, nobody(6), 0, 3)).toBe(2);
    expect(nextRoomFor(0, nobody(6), 1, 3)).toBe(3);
  });
  it("is null for someone the rotation does not reach in the rooms that remain", () => {
    expect(nextRoomFor(3, nobody(6), 2, 3)).toBeNull();
    expect(nextRoomFor(3, nobody(6), 1, 2)).toBeNull();
  });
});

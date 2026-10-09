import { describe, expect, it } from "vitest";
import { loadRooms } from "../rooms/load.ts";
import { caughtBy } from "../sim/hazards.ts";
import { step } from "../sim/step.ts";
import { createWorld, TICK_MS } from "../sim/world.ts";
import { forecastFor } from "./forecast.ts";

const rooms = loadRooms();
const room = (id: string) => {
  const found = rooms.find((r) => r.id === id);
  if (!found) throw new Error(`no room ${id}`);
  return found;
};

describe("forecastFor", () => {
  it("says danger wherever the real simulation would catch a player standing still", () => {
    for (const id of ["02-cameras-lasers", "03-vault"]) {
      const r = room(id);
      const forecast = forecastFor(r);
      const world = createWorld(r);
      for (const d of Object.keys(world.doorOpen)) world.doorOpen[d] = true;
      let misses = 0;
      let cases = 0;
      for (let tick = 1; tick <= 400; tick += 3) {
        while (world.tick < tick) step(world, {}, TICK_MS);
        const mask = forecast.rest(tick);
        const through = forecast.danger(tick);
        for (let y = 0; y < r.height; y++) {
          for (let x = 0; x < r.width; x++) {
            if (r.grid[y]?.[x] !== ".") continue;
            for (const p of world.players) p.pos = { x: x + 0.5, y: y + 0.5 };
            if (caughtBy(world) !== null) {
              cases++;
              if (!mask[y * r.width + x] || !through[y * r.width + x]) misses++;
            }
          }
        }
      }
      expect(cases).toBeGreaterThan(0);
      expect(misses).toBe(0);
    }
  });

  it("is not all danger: some tiles are safe at every tick", () => {
    const r = room("02-cameras-lasers");
    const forecast = forecastFor(r);
    const spawn = r.objects.find((o) => o.id === "s1")?.tiles[0] ?? { x: 2, y: 3 };
    for (let tick = 0; tick < 200; tick++) {
      expect(forecast.danger(tick)[spawn.y * r.width + spawn.x]).toBe(0);
    }
  });

  it("is the same object for the same room and alarm windows, a new one for others", () => {
    const r = room("03-vault");
    expect(forecastFor(r)).toBe(forecastFor(r));
    expect(forecastFor(r, [{ from: 10, to: 100 }])).not.toBe(forecastFor(r));
  });

  it("holds every camera on while the alarm rings", () => {
    const r = room("03-vault");
    const quiet = forecastFor(r);
    const alarmed = forecastFor(r, [{ from: 1, to: 400 }]);
    const sum = (a: Uint8Array) => a.reduce((n, v) => n + v, 0);
    let more = false;
    for (let tick = 1; tick < 200; tick++) {
      expect(sum(alarmed.danger(tick))).toBeGreaterThanOrEqual(0);
      if (sum(alarmed.danger(tick)) > sum(quiet.danger(tick))) more = true;
    }
    expect(more).toBe(true);
  });
});

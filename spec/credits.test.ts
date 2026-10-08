import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, inject, it } from "vitest";
import { CLIPS, FACES } from "../src/game/channels.ts";
import { mp3Seconds } from "./mp3.ts";

const baseUrl = inject("baseUrl");
const credits = readFileSync("CREDITS.md", "utf8");

// Every outside asset the game ships is named in CREDITS.md with its licence.
describe("credits", () => {
  for (const dir of ["public/faces", "public/sounds"]) {
    it(`names every file in ${dir}`, () => {
      const files = existsSync(dir) ? readdirSync(dir) : [];
      const missing = files.filter((f) => !credits.includes(`\`${f}\``));
      expect(missing).toEqual([]);
    });
  }

  it("gives every asset row a licence and a check date", () => {
    const rows = credits.split("\n").filter((l) => /^\| `.+\.(png|mp3)`/.test(l));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const cells = row.split("|").map((c) => c.trim());
      expect(cells[4], row).toMatch(/licen[cs]e|license|cc0|pixabay/i);
      expect(cells[5], row).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("serves the credits page, naming the source", async () => {
    const res = await fetch(new URL("/credits/", baseUrl));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("bluemoji.io");
  });

  it("ships exactly the faces the game lists", () => {
    expect(readdirSync("public/faces").sort()).toEqual(FACES.map((f) => f.file).sort());
  });

  it("ships exactly the clips the soundboard lists, each at most 3 s", () => {
    const shipped = existsSync("public/sounds") ? readdirSync("public/sounds").sort() : [];
    expect(shipped).toEqual(CLIPS.map((c) => `${c.id}.mp3`).sort());
    expect(CLIPS.length).toBeLessThanOrEqual(12);
    const long = shipped
      .map((f) => [f, mp3Seconds(`public/sounds/${f}`)] as const)
      .filter(([, s]) => s > 3);
    expect(long).toEqual([]);
  });
});

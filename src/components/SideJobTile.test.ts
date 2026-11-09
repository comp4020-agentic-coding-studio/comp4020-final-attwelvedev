// @vitest-environment jsdom
import { h, render } from "preact";
import { afterEach, describe, expect, it } from "vitest";
import { SideJobTile, type TileCache } from "./SideJobTile.tsx";

afterEach(() => {
  render(null, document.body);
  document.body.innerHTML = "";
});

const names = ["Ana", "Bo", "Cy"];
const base: TileCache = {
  room: "04-the-safe",
  found: true,
  opened: true,
  item: "watch",
  owner: 0,
  by: 1,
  riddle: "Where the moon watches, listen twice.",
};
const mount = (cache: TileCache, n: string[] = names) =>
  render(h(SideJobTile, { cache, names: n }), document.body);
const tile = () => document.querySelector(".side-job-tile") as HTMLElement;

describe("SideJobTile", () => {
  it("taken by the owner after someone else opened the way: plate, name, tick and both names", () => {
    mount(base);
    expect(tile().classList.contains("is-taken")).toBe(true);
    expect(tile().querySelector(".keepsake:not(.is-missed)")).not.toBeNull();
    expect(tile().querySelector(".side-job-tick")).not.toBeNull();
    expect(tile().textContent).toContain(
      "Ana took the gold watch. Bo opened the way. Worth 1 loot.",
    );
  });

  it("taken by the owner who opened it too: one clause, no 'opened the way'", () => {
    mount({ ...base, by: 0 });
    expect(tile().textContent).toContain(
      "Ana opened the vault and took the gold watch. Worth 1 loot.",
    );
    expect(tile().textContent).not.toMatch(/opened the way/);
  });

  it("opened but left behind: a dashed tile with the plate empty and the item named", () => {
    mount({ ...base, found: false });
    expect(tile().classList.contains("is-left")).toBe(true);
    expect(tile().querySelector(".keepsake.is-missed")).not.toBeNull();
    expect(tile().querySelector(".side-job-tick")).toBeNull();
    expect(tile().textContent).toContain("Side job opened, but the gold watch was left behind.");
  });

  it("not found: a dashed tile with the riddle and no item name", () => {
    mount({ ...base, found: false, opened: false, by: undefined });
    expect(tile().classList.contains("is-unfound")).toBe(true);
    expect(tile().querySelector(".keepsake.is-missed")).not.toBeNull();
    expect(tile().textContent).toContain(
      "Side job not found: Where the moon watches, listen twice.",
    );
    expect(tile().textContent).not.toMatch(/watch\b.*watch|gold/);
  });

  it("does not let an opened vault count as found", () => {
    mount({ ...base, found: false, opened: true });
    expect(tile().classList.contains("is-taken")).toBe(false);
    expect(tile().textContent).not.toMatch(/Worth 1 loot/);
  });

  it("takes names from the crew, and says 'a teammate' for an empty seat", () => {
    mount(base, ["", "Bo", "Cy"]);
    expect(tile().textContent).toContain("A teammate took the gold watch.");
  });

  it("gives all three states one shared tile class and wrapping text", () => {
    for (const cache of [
      base,
      { ...base, found: false },
      { ...base, found: false, opened: false },
    ]) {
      mount(cache);
      expect(tile().classList.contains("side-job-tile")).toBe(true);
      expect(tile().querySelector(".side-job-tile-text")).not.toBeNull();
    }
  });
});

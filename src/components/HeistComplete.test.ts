// @vitest-environment jsdom
import { h, render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeistComplete } from "./HeistComplete.tsx";

afterEach(() => {
  render(null, document.body);
  document.body.innerHTML = "";
});

type Caches = NonNullable<Parameters<typeof HeistComplete>[0]["caches"]>;
const six = (taken: number): Caches =>
  (["04", "05", "06", "07", "08", "09"] as const).map((n, i) => ({
    room: `${n}-slug`,
    name: `Name ${n}`,
    found: i < taken,
    item: (["watch", "ledger", "ring", "goblet", "pen", "necklace"] as const)[
      i
    ] as Caches[number]["item"],
  }));
const mount = (caches?: Caches) =>
  render(
    h(HeistComplete, {
      ms: 300_000,
      loot: 3,
      lootTotal: 9,
      rank: 2,
      onBoard: vi.fn(),
      caches,
      crew: [],
    }),
    document.body,
  );
const slots = () => [...document.querySelectorAll(".keepsake-shelf li")];

describe("HeistComplete shelf", () => {
  it("shows six slots in room order: taken ones named, the rest empty with their room", () => {
    mount(six(3));
    expect(slots()).toHaveLength(6);
    // every slot, taken or missed, is the same three lines in the same order
    const lines = (s: Element) =>
      [".keepsake-room", ".keepsake-num", ".keepsake-what"].map(
        (c) => s.querySelector(c)?.textContent,
      );
    expect(slots().map(lines)).toEqual([
      ["Name 04", "Room 4", "gold watch"],
      ["Name 05", "Room 5", "ledger"],
      ["Name 06", "Room 6", "signet ring"],
      ["Name 07", "Room 7", "Not found"],
      ["Name 08", "Room 8", "Not found"],
      ["Name 09", "Room 9", "Not found"],
    ]);
    expect(slots().filter((s) => s.querySelector(".keepsake.is-missed"))).toHaveLength(3);
  });

  it("shows at 0 of 6, every slot empty, and counts the taken ones", () => {
    mount(six(0));
    expect(slots()).toHaveLength(6);
    expect(slots().every((s) => s.querySelector(".keepsake.is-missed"))).toBe(true);
    expect(document.querySelector(".keepsake-shelf")?.textContent).toContain("0 of 6");
  });

  it("says 6 of 6 when every item was taken", () => {
    mount(six(6));
    expect(document.querySelector(".keepsake-shelf")?.textContent).toContain("6 of 6");
  });

  it("sits above the rank line", () => {
    mount(six(2));
    const shelf = document.querySelector(".keepsake-shelf") as Element;
    const rank = [...document.querySelectorAll("p")].find((p) => /Rank/.test(p.textContent ?? ""));
    expect(
      shelf.compareDocumentPosition(rank as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("is absent when no room had a side job", () => {
    mount([]);
    expect(document.querySelector(".keepsake-shelf")).toBeNull();
    mount(undefined);
    expect(document.querySelector(".keepsake-shelf")).toBeNull();
  });
});

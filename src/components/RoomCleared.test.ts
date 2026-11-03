// @vitest-environment jsdom
import { h, render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomCleared } from "./RoomCleared.tsx";

afterEach(() => {
  render(null, document.body);
  document.body.innerHTML = "";
});

const mount = (over: Partial<Parameters<typeof RoomCleared>[0]> = {}) =>
  render(
    h(RoomCleared, {
      ms: 95_000,
      loot: 1,
      lootTotal: 2,
      last: false,
      host: true,
      onNext: vi.fn(),
      onRestart: vi.fn(),
      onRestartHeist: vi.fn(),
      onBoard: vi.fn(),
      ...over,
    }),
    document.body,
  );
// the card's own buttons; "Full leaderboard" sits with the board, after them
const names = () =>
  [...document.querySelectorAll(".cleared-actions button")].map((b) => b.textContent);

describe("RoomCleared", () => {
  it("never offers Leave: it is too easy to press without reading", () => {
    for (const host of [true, false]) {
      for (const last of [true, false]) {
        mount({ host, last });
        expect(names().join("|")).not.toMatch(/leave/i);
      }
    }
  });

  it("gives the host Next room, and anyone clearly named restarts that the others vote on", () => {
    mount({ host: true, last: false });
    expect(names()).toEqual(["Next room", "Restart room", "Restart heist"]);
  });

  it("after the last room there is no next, but a room or the heist can still be restarted", () => {
    mount({ host: true, last: true });
    expect(names()).toEqual(["Restart room", "Restart heist"]);
    expect(document.body.textContent).toMatch(/last room/i);
  });

  it("gives everyone else the restarts too, and says the host picks the next room", () => {
    mount({ host: false, last: false });
    expect(names()).toEqual(["Restart room", "Restart heist"]);
    expect(document.body.textContent).toMatch(/host picks the next room/i);
  });

  it("asking to restart takes two presses and sends a proposal, not a restart", async () => {
    const onRestart = vi.fn();
    mount({ host: false, onRestart });
    const room = document.querySelectorAll("button")[0] as HTMLButtonElement;
    room.click();
    await Promise.resolve();
    expect(onRestart).not.toHaveBeenCalled();
  });

  it("shows the room's board with this run highlighted, and opens the full board", () => {
    const onBoard = vi.fn();
    mount({
      onBoard,
      board: {
        top: [
          { rank: 1, teamName: "Team AAAA", ms: 60_000, loot: 1, lootTotal: 2, mine: false },
          { rank: 2, teamName: "Team MINE", ms: 95_000, loot: 1, lootTotal: 2, mine: true },
        ],
        mine: null,
      },
    });
    const rows = [...document.querySelectorAll(".room-board tbody tr")];
    expect(rows.map((r) => r.textContent)).toEqual(["1Team AAAA1:001/2", "2Team MINE1:351/2"]);
    expect(rows[1]?.classList.contains("mine")).toBe(true);
    expect(rows[1]?.getAttribute("aria-current")).toBe("true");
    const full = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Full leaderboard",
    ) as HTMLButtonElement;
    full.click();
    expect(onBoard).toHaveBeenCalled();
  });

  it("adds a sixth line with this run's rank when it is outside the top 5", () => {
    const top = [1, 2, 3, 4, 5].map((rank) => ({
      rank,
      teamName: `Team ${rank}`,
      ms: rank * 10_000,
      loot: 0,
      lootTotal: 0,
      mine: false,
    }));
    mount({
      ms: 95_000,
      board: { top, mine: { rank: 9, ms: 95_000, loot: 1, lootTotal: 2 } },
    });
    const rows = [...document.querySelectorAll(".room-board tbody tr")];
    expect(rows).toHaveLength(6);
    expect(rows[5]?.textContent).toMatch(/^9.*You.*1:35.*1\/2/);
    expect(rows[5]?.classList.contains("mine")).toBe(true);
  });

  it("says it is the first clear of the room when the board is empty", () => {
    mount({ board: { top: [], mine: null } });
    expect(document.querySelector(".room-board")?.textContent).toMatch(/First clear of this room/);
  });

  it("shows the time and the loot", () => {
    mount();
    expect(document.body.textContent).toContain("1:35");
    expect(document.body.textContent).toMatch(/Loot\s*1 of 2/);
  });

  it("shows a card per player: their name, role and what they did, one line each", () => {
    mount({
      credits: [
        { name: "Ana", role: "blind", lines: ["cracked 2 safes", "side job: the ledger"] },
        { name: "Cy", role: "mute", lines: ["kept the crew moving"] },
      ],
    });
    const cards = [...document.querySelectorAll(".credits > li")];
    expect(cards.map((c) => c.querySelector("h3")?.textContent)).toEqual(["Ana", "Cy"]);
    expect([...(cards[0] as Element).querySelectorAll("li")].map((l) => l.textContent)).toEqual([
      "cracked 2 safes",
      "side job: the ledger",
    ]);
  });

  it("shows time and loot as two stats, and no credits list when there are none", () => {
    mount({});
    expect([...document.querySelectorAll(".cleared-stats dd")].map((d) => d.textContent)).toEqual([
      "1:35",
      "1 of 2",
    ]);
    expect(document.querySelector(".credits")).toBeNull();
  });

  it("keeps the whole card, board included, in one column", () => {
    mount({ board: { top: [], mine: null } });
    const card = document.querySelector(".overlay > .cleared");
    expect(card?.querySelector(".room-board")).not.toBeNull();
    expect(card?.querySelector(".cleared-actions")).not.toBeNull();
  });
});

describe("RoomCleared side-job tile", () => {
  const cache = {
    room: "04-the-safe",
    found: true,
    opened: true,
    item: "watch" as const,
    owner: 0,
    by: 1,
    riddle: "Where the moon watches, listen twice.",
  };
  const kids = () => [...(document.querySelector(".cleared") as Element).children];

  it("sits after the credits and before the buttons", () => {
    mount({
      credits: [{ name: "Ana", role: "blind", lines: ["x"] }],
      cache,
      names: ["Ana", "Bo", "Cy"],
    });
    const at = (sel: string) => kids().findIndex((k) => k.matches(sel));
    expect(at(".credits")).toBeGreaterThanOrEqual(0);
    expect(at(".side-job-tile")).toBe(at(".credits") + 1);
    expect(at(".side-job-tile")).toBeLessThan(at(".cleared-actions"));
  });

  it("is absent in a room with no side job", () => {
    mount({});
    expect(document.querySelector(".side-job-tile")).toBeNull();
  });
});

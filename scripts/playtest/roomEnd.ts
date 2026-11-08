import { formatTime } from "../../src/client/hud.ts";
import type { ServerMsg } from "../../src/net/protocol.ts";
import type { Seat3 } from "./table.ts";

// Task 128: when a room ends, what each tab shows equals what the server sent in `cleared` (and
// `heist` after the last room).
type Cleared = Extract<ServerMsg, { t: "cleared" }>;
type Heist = Extract<ServerMsg, { t: "heist" }>;

export interface EndFinding {
  invariant: string;
  detail: string;
}

// The HUD clock reads `m:ss` of a time that kept running a moment after the server froze it, so
// "within one second" is the promise: the text's seconds against the server's.
export function clockMatches(text: string, ms: number): boolean {
  const m = /^(\d+):(\d{2})$/.exec(text.trim());
  if (!m) return false;
  const shown = Number(m[1]) * 60 + Number(m[2]);
  return Math.abs(shown - Math.floor(ms / 1000)) <= 1;
}

export async function roomEnd(
  seat: number,
  tab: Seat3,
  cleared: Cleared,
  heist?: Heist,
): Promise<EndFinding[]> {
  const out: EndFinding[] = [];
  const fail = (what: string, detail: string) =>
    out.push({ invariant: `room-end:${what}`, detail });
  const page = tab.page;
  const hudLoot = await page.locator(".hud-loot").getAttribute("aria-label");
  if (hudLoot !== `Loot ${cleared.loot}`)
    fail("loot", `the HUD says "${hudLoot}", the server cleared with ${cleared.loot}`);
  const clock = (await page.locator(".hud-clock").innerText()).trim();
  if (!clockMatches(clock, cleared.ms))
    fail("clock", `the HUD clock says ${clock}, the server's time was ${formatTime(cleared.ms)}`);

  if (heist) {
    const card = page.locator(".overlay").filter({ hasText: "Heist complete" });
    const text = await card.innerText({ timeout: 5000 }).catch(() => "");
    if (!text) return [...out, { invariant: "room-end:heist", detail: "no heist-complete screen" }];
    if (!text.includes(`Time ${formatTime(heist.ms)}`))
      fail("heist-time", `the heist screen does not say Time ${formatTime(heist.ms)}`);
    if (heist.lootTotal > 0 && !text.includes(`Loot ${heist.loot} of ${heist.lootTotal}`))
      fail("heist-loot", `the heist screen does not say Loot ${heist.loot} of ${heist.lootTotal}`);
    if (seat === 0) {
      await card.getByRole("button", { name: "See the leaderboard" }).click();
      const panel = page.getByRole("dialog", { name: "Leaderboard" });
      if (
        !(await panel.waitFor({ timeout: 3000 }).then(
          () => true,
          () => false,
        ))
      )
        fail("heist-board", "the leaderboard did not open from the heist screen");
    }
    return out;
  }

  const card = page.locator(".cleared");
  const text = await card.innerText({ timeout: 5000 }).catch(() => "");
  if (!text) return [...out, { invariant: "room-end:card", detail: "no cleared card" }];
  if (!text.includes(formatTime(cleared.ms)))
    fail("card-time", `the cleared card does not show ${formatTime(cleared.ms)}`);
  if (cleared.lootTotal > 0 && !text.includes(`${cleared.loot} of ${cleared.lootTotal}`))
    fail("card-loot", `the cleared card does not show ${cleared.loot} of ${cleared.lootTotal}`);
  return out;
}

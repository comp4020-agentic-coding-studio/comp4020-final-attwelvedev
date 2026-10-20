import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { axeViolations, DESKTOP, horizontalOverflow, launch, openPage, PHONE } from "../browser.ts";
import { createLobbyAs, joinWithCode, leaveGameAndClose } from "../lobbyUi.ts";

const baseUrl = inject("baseUrl");
let browser: Browser;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser.close();
});

interface Revealed {
  pages: Page[]; // by person: Ana (host), Bo, Cy, then whoever sits out
  code: string;
}

// People through the real screens up to the reveal: nobody has pressed I'm ready.
async function revealed(names: string[], viewport = DESKTOP): Promise<Revealed> {
  const [first, ...rest] = names;
  const host = await createLobbyAs(browser, baseUrl, first as string, viewport);
  const pages = [host.page];
  for (const name of rest)
    pages.push(await joinWithCode(browser, baseUrl, host.code, name, viewport));
  for (const name of rest) {
    await host.page
      .locator(".player-row")
      .filter({ has: host.page.getByText(name, { exact: true }) })
      .waitFor();
  }
  await host.page.getByRole("button", { name: /^Start/ }).click();
  // the first three play room 1; anyone else sits out and watches, with no card of their own
  for (const page of pages.slice(0, 3)) await page.locator(".reveal").waitFor();
  return { pages, code: host.code };
}
const closeAll = async (pages: Page[]) => {
  for (const page of pages) await leaveGameAndClose(page, baseUrl).catch(() => {});
};
const title = (page: Page) => page.getByRole("heading", { level: 1 }).innerText();
const crewRow = (page: Page, name: string) =>
  page.locator(".reveal-crew li").filter({ has: page.getByText(name, { exact: false }) });

describe("each role's reveal card", () => {
  it("names who hears what they send, by name, and never says Say, Sound or Show", async () => {
    const { pages } = await revealed(["Ana", "Bo", "Cy"]);
    const [blind, deaf, mute] = pages as [Page, Page, Page];
    expect(await title(blind)).toBe("You can't see");
    expect(await title(deaf)).toBe("You can't hear");
    expect(await title(mute)).toBe("You can't speak");

    // Can't see sends talk (Cy hears it, Bo can't) and faces (both see them)
    const talk = blind.locator(".reveal-lines li").filter({ hasText: "Talk" });
    expect(await talk.innerText()).toMatch(/Cy hears this/);
    expect(await talk.innerText()).toMatch(/Bo can't/);
    // Can't hear's faces and marks reach Can't speak, and Can't see only hears talk and clips
    expect(await deaf.locator(".reveal-lines li").filter({ hasText: "Marks" }).innerText()).toMatch(
      /Cy sees this/,
    );
    expect(await deaf.locator(".reveal-lines li").filter({ hasText: "Marks" }).innerText()).toMatch(
      /Ana can't/,
    );
    for (const page of pages) {
      const text = await page.locator(".reveal").innerText();
      expect(text).not.toMatch(/\b(Say|Sound|Show)\b/);
      expect(text).toContain("You can send");
      expect(text).toContain("You get");
    }
    await closeAll(pages);
  });

  it("tells Can't see their screen goes dark on purpose, and its Play buttons start the cues", async () => {
    const { pages } = await revealed(["Ana", "Bo", "Cy"]);
    const [blind, deaf] = pages as [Page, Page];
    await blind.getByText("Your screen goes dark. That's on purpose.").waitFor();
    expect(await deaf.getByText("Your screen goes dark.").count()).toBe(0);
    expect(await deaf.getByRole("heading", { name: "Learn the sounds" }).count()).toBe(0);

    await blind.evaluate(() => {
      (window as unknown as { __cuesPlayed: string[] }).__cuesPlayed = [];
    });
    await blind.getByRole("button", { name: "Play hum" }).click();
    await expect
      .poll(() =>
        blind.evaluate(() => (window as unknown as { __cuesPlayed: string[] }).__cuesPlayed),
      )
      .toContain("hum");
    await blind.getByRole("button", { name: /Play all/ }).click();
    await expect
      .poll(
        () => blind.evaluate(() => (window as unknown as { __cuesPlayed: string[] }).__cuesPlayed),
        { timeout: 5000 },
      )
      .toContain("door");
    await closeAll(pages);
  });

  it("shows the room behind the card, visible but blurred", async () => {
    const { pages } = await revealed(["Ana", "Bo", "Cy"]);
    const deaf = pages[1] as Page;
    const canvas = deaf.locator(".reveal-canvas canvas");
    await expect
      .poll(() =>
        canvas.evaluate((el) => {
          const c = el as HTMLCanvasElement;
          const ctx = c.getContext("2d");
          if (!ctx) return 0;
          const seen = new Set<string>();
          for (let x = 0; x < c.width; x += 5) {
            for (let y = 0; y < c.height; y += 5)
              seen.add(ctx.getImageData(x, y, 1, 1).data.join(","));
          }
          return seen.size; // a drawn room has several colours; an empty canvas has one
        }),
      )
      .toBeGreaterThan(2);
    const blur = await deaf.locator(".reveal-canvas").evaluate((el) => getComputedStyle(el).filter);
    expect(blur).toContain("blur(6px)");
    await closeAll(pages);
  });
});

describe("the crew column", () => {
  it("shows Ready for those who pressed I'm ready, and bots as ready", async () => {
    const { pages } = await revealed(["Ana", "Bo", "Cy"]);
    const [host, bo, cy] = pages as [Page, Page, Page];
    expect(await crewRow(host, "Bo").innerText()).not.toContain("Ready");
    await bo.getByRole("button", { name: "I'm ready" }).click();
    await expect.poll(() => crewRow(host, "Bo").innerText()).toContain("Ready");
    await expect.poll(() => crewRow(cy, "Bo").innerText()).toContain("Ready");
    expect(await crewRow(host, "Cy").innerText()).not.toContain("Ready");
    await host.getByText("1 of 3 ready").waitFor();
    await closeAll(pages);
  });

  it("shows who has played what as pips, and who sits out", async () => {
    const { pages } = await revealed(["Ana", "Bo", "Cy", "Di", "Ed"]);
    const host = pages[0] as Page;
    await host.getByText("Watching").first().waitFor();
    expect(await crewRow(host, "Di").innerText()).toContain("Watching");
    expect(await crewRow(host, "Ed").innerText()).toContain("Watching");
    // nobody has played yet, so no pips and no placeholder mark: nothing to say is nothing drawn
    expect(await host.locator(".reveal-crew .pips").count()).toBe(0);
    expect(await host.locator(".reveal-crew").innerText()).not.toMatch(/[—–─-]\s*$/m);
    await closeAll(pages);
  });

  it("names each person's role under their name, in words, with sitting out having none", async () => {
    const { pages } = await revealed(["Ana", "Bo", "Cy", "Di"]);
    const host = pages[0] as Page;
    expect(await crewRow(host, "Ana").locator(".crew-role").innerText()).toBe("Can't see");
    expect(await crewRow(host, "Bo").locator(".crew-role").innerText()).toBe("Can't hear");
    expect(await crewRow(host, "Cy").locator(".crew-role").innerText()).toBe("Can't speak");
    expect(await crewRow(host, "Di").locator(".crew-role").count()).toBe(0);
    await closeAll(pages);
  });

  it("says Not ready in words for someone who has not pressed I'm ready", async () => {
    const { pages } = await revealed(["Ana", "Bo", "Cy"]);
    const host = pages[0] as Page;
    expect(await crewRow(host, "Bo").innerText()).toContain("Not ready");
    expect(await crewRow(host, "Bo").innerText()).not.toContain("…");
    await closeAll(pages);
  });

  it("lets a person take I'm ready back, and everyone sees them not ready again", async () => {
    const { pages } = await revealed(["Ana", "Bo", "Cy"]);
    const [host, bo] = pages as [Page, Page];
    await bo.getByRole("button", { name: "I'm ready" }).click();
    await expect.poll(() => crewRow(host, "Bo").innerText()).toContain("Ready");
    await bo.getByRole("button", { name: "Not ready yet" }).click();
    await bo.getByRole("button", { name: "I'm ready" }).waitFor();
    await expect.poll(() => crewRow(host, "Bo").innerText()).toContain("Not ready");
    await host.getByText("0 of 3 ready").waitFor();
    await closeAll(pages);
  });

  it("after I'm ready the big button goes: one status line says you are ready and waiting, and Not ready yet is the only button", async () => {
    const { pages } = await revealed(["Ana", "Bo", "Cy"]);
    const bo = pages[1] as Page;
    await bo.getByRole("button", { name: "I'm ready" }).click();
    const status = bo.locator(".reveal-go [role=status]");
    await expect
      .poll(() => status.innerText())
      .toBe("You're ready. Waiting for the others · 1 of 3");
    // nothing that looks like a button says "waiting": a disabled button invites a click
    expect(await bo.getByRole("button", { name: /Waiting/ }).count()).toBe(0);
    expect(await bo.getByRole("button", { name: "I'm ready" }).count()).toBe(0);
    expect(await bo.locator(".reveal-go button").allInnerTexts()).toEqual(["Not ready yet"]);
    // and the line is not button-shaped: no border, no fill
    const look = await status.evaluate((el) => {
      const s = getComputedStyle(el);
      return { border: s.borderTopWidth, bg: s.backgroundColor };
    });
    expect(look.border).toBe("0px");
    expect(look.bg).toBe("rgba(0, 0, 0, 0)");
    await closeAll(pages);
  });

  it("before I'm ready the status is only the count, and it does not pulse", async () => {
    const { pages } = await revealed(["Ana", "Bo", "Cy"]);
    const bo = pages[1] as Page;
    const status = bo.locator(".reveal-go [role=status]");
    expect(await status.innerText()).toBe("0 of 3 ready");
    expect(await status.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    await closeAll(pages);
  });

  it("pulses the waiting line, keeps it readable through the breath, and holds it still under reduced motion", async () => {
    const { pages } = await revealed(["Ana", "Bo", "Cy"]);
    const bo = pages[1] as Page;
    await bo.getByRole("button", { name: "I'm ready" }).click();
    const waiting = bo.locator(".reveal-go [role=status]");
    await expect.poll(() => waiting.innerText()).toContain("You're ready");
    const animation = () => waiting.evaluate((el) => getComputedStyle(el).animationName);
    expect(await animation()).toBe("pulse");
    // at the dimmest point the text is 60% over the card behind it, and must still stand out
    const contrast = await waiting.evaluate((el) => {
      const parse = (rgb: string) => (rgb.match(/[\d.]+/g) ?? []).map(Number);
      const lum = (c: number[]) => {
        const [r, g, b] = c.map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
      };
      const behind = parse(getComputedStyle(el.closest(".reveal") as Element).backgroundColor);
      const text = parse(getComputedStyle(el).color)
        .slice(0, 3)
        .map((v, i) => v * 0.6 + (behind[i] ?? 0) * 0.4);
      const [hi, lo] = [lum(text), lum(behind)].sort((a, b) => b - a);
      return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    await bo.emulateMedia({ reducedMotion: "reduce" });
    expect(await animation()).toBe("none");
    await closeAll(pages);
  });

  it("shows a person who leaves during the reveal as Left the game", async () => {
    const { pages } = await revealed(["Ana", "Bo", "Cy", "Di", "Ed"]);
    const [host, bo] = pages as [Page, Page];
    await bo.evaluate(() => {
      // the page's own socket says it: pressing Leave in the game is a leave, not a drop
      location.assign("/");
    });
    await expect
      .poll(() => crewRow(host, "Bo").innerText(), { timeout: 8000 })
      .toContain("Left the game");
    await closeAll(pages);
  });
});

describe("host swaps", () => {
  it("swap two people: both cards change role and every Ready resets", async () => {
    const { pages } = await revealed(["Ana", "Bo", "Cy"]);
    const [host, bo, cy] = pages as [Page, Page, Page];
    await cy.getByRole("button", { name: "I'm ready" }).click();
    await expect.poll(() => crewRow(host, "Cy").innerText()).toContain("Ready");
    expect(await title(host)).toBe("You can't see");
    expect(await title(bo)).toBe("You can't hear");

    await crewRow(host, "Ana").getByRole("button", { name: "Select" }).click();
    await crewRow(host, "Bo").getByRole("button", { name: "Select" }).click();
    await host.getByText("Swap Ana and Bo? Swapping resets everyone to not ready.").waitFor();
    await host.getByRole("button", { name: "Swap roles" }).click();

    await expect.poll(() => title(host)).toBe("You can't hear");
    await expect.poll(() => title(bo)).toBe("You can't see");
    expect(await title(cy)).toBe("You can't speak");
    await expect.poll(() => crewRow(host, "Cy").innerText()).not.toContain("Ready");
    expect(await cy.getByRole("button", { name: "I'm ready" }).isEnabled()).toBe(true);
    // only the host is offered a swap
    expect(await bo.getByRole("button", { name: "Select" }).count()).toBe(0);
    await closeAll(pages);
  });
});

describe("host swaps with a bot", () => {
  it("offers Select on a bot's row, and swapping a player with it trades their roles", async () => {
    const { pages } = await revealed(["Ana"]);
    const [host] = pages as [Page];
    // alone with the host: Ana plays Can't see, and bots fill Can't hear and Can't speak
    await host.locator(".reveal-crew li").nth(1).waitFor();
    expect(await title(host)).toBe("You can't see");
    await crewRow(host, "Ana").getByRole("button", { name: "Select" }).click();
    await crewRow(host, "Bot").first().getByRole("button", { name: "Select" }).click();
    await host.getByRole("button", { name: "Swap roles" }).click();
    await expect.poll(() => title(host)).not.toBe("You can't see");
    await closeAll(pages);
  });
});

describe("watchers at the reveal", () => {
  it("a watcher who joins appears in everyone's crew list as watching", async () => {
    const { pages, code } = await revealed(["Ana", "Bo", "Cy"]);
    const host = pages[0] as Page;
    const page = await openPage(browser, baseUrl, DESKTOP);
    await page.getByLabel("Nickname").fill("Wes");
    await page.getByLabel("Lobby code").fill(code);
    await page.getByRole("button", { name: "Join", exact: true }).click();
    // the lobby is full once started: the join page offers to watch instead
    await page.getByRole("button", { name: "Watch" }).click();
    await expect.poll(() => crewRow(host, "Wes").innerText()).toContain("Watching");
    await closeAll([...pages, page]);
  });

  it("when the host leaves, everyone is told who the host is now, and the choice names them", async () => {
    const { pages } = await revealed(["Ana", "Bo", "Cy", "Di"]);
    const [ana, bo, cy, di] = pages as [Page, Page, Page, Page];
    await ana.evaluate(() => {
      location.assign("/");
    });
    // Bo is next in the list, so Bo is the host: the others are told, and the question says who is asked
    await cy.getByText("Waiting for Bo (the host) to choose").waitFor({ timeout: 8000 });
    await cy.locator(".hud-alert", { hasText: "Bo is now the host." }).waitFor({ timeout: 8000 });
    await di.locator(".hud-alert", { hasText: "Bo is now the host." }).waitFor({ timeout: 8000 });
    await bo.getByRole("button", { name: "Let a bot take over" }).waitFor({ timeout: 8000 });
    await bo.locator(".hud-alert", { hasText: "You are now the host." }).waitFor({ timeout: 8000 });
    await closeAll(pages);
  });

  it("when a seat is empty and people are free, the host is asked who takes it, with the bot last", async () => {
    const { pages, code } = await revealed(["Ana", "Bo", "Cy", "Di"]);
    const [ana, bo, , di] = pages as [Page, Page, Page, Page];
    const wes = await openPage(browser, baseUrl, DESKTOP);
    await wes.getByLabel("Nickname").fill("Wes");
    await wes.getByLabel("Lobby code").fill(code);
    await wes.getByRole("button", { name: "Join", exact: true }).click();
    await wes.getByRole("button", { name: "Watch" }).click();
    await wes.locator(".spectator-frame").waitFor();
    await bo.evaluate(() => {
      location.assign("/");
    });
    const box = ana.getByRole("alertdialog");
    await box.getByText("Who takes the seat?").waitFor({ timeout: 8000 });
    const buttons = await box.getByRole("button").allInnerTexts();
    expect(buttons).toEqual(["Pull in Di", "Pull in Wes", "Let a bot take over", "Back to lobby"]);
    // the bot is the quiet choice now
    expect(
      await box.getByRole("button", { name: "Let a bot take over" }).getAttribute("class"),
    ).not.toContain("primary");
    await box.getByRole("button", { name: "Pull in Wes" }).click();
    await wes.getByRole("heading", { level: 1, name: "You can't hear" }).waitFor({ timeout: 8000 });
    void di;
    await closeAll([...pages, wes]);
  });

  it("a watcher who joins late sees the room at once, and the host can swap them in to play", async () => {
    const { pages, code } = await revealed(["Ana", "Bo", "Cy"]);
    const [host, bo] = pages as [Page, Page, Page];
    const page = await openPage(browser, baseUrl, DESKTOP);
    await page.getByLabel("Nickname").fill("Wes");
    await page.getByLabel("Lobby code").fill(code);
    await page.getByRole("button", { name: "Join", exact: true }).click();
    await page.getByRole("button", { name: "Watch" }).click();
    // the whole room, drawn: not black
    await expect
      .poll(() =>
        page.locator(".spectator-frame canvas").evaluate((el) => {
          const c = el as HTMLCanvasElement;
          const ctx = c.getContext("2d");
          if (!ctx) return 0;
          const seen = new Set<string>();
          for (let x = 0; x < c.width; x += 7)
            for (let y = 0; y < c.height; y += 7)
              seen.add(ctx.getImageData(x, y, 1, 1).data.join(","));
          return seen.size;
        }),
      )
      .toBeGreaterThan(2);
    // a friend who came late but wants to play: the host selects them and Bo and swaps
    await crewRow(host, "Wes").getByRole("button", { name: "Select" }).click();
    await crewRow(host, "Bo").getByRole("button", { name: "Select" }).click();
    await host.getByRole("button", { name: "Swap roles" }).click();
    await page
      .getByRole("heading", { level: 1, name: "You can't hear" })
      .waitFor({ timeout: 5000 });
    // Bo, swapped out, is watching this room; Wes, swapped in, is a player
    await expect.poll(() => crewRow(host, "Bo").innerText()).toContain("Watching");
    expect(await crewRow(host, "Wes").innerText()).toContain("Not ready");
    void bo;
    await closeAll([...pages, page]);
  });

  it("follows the seat a watcher clicks, and outlines nobody for the whole room", async () => {
    const { pages } = await revealed(["Ana", "Bo", "Cy", "Di"]);
    const di = pages[3] as Page;
    const canvas = di.locator(".spectator-frame canvas");
    await canvas.waitFor();
    // its own settle (not settledHash), so it takes the sea's drift out itself
    await di.emulateMedia({ reducedMotion: "reduce" });
    const settled = async (): Promise<string> => {
      const a = await canvas.evaluate((c) => (c as HTMLCanvasElement).toDataURL());
      await di.waitForTimeout(150);
      const b = await canvas.evaluate((c) => (c as HTMLCanvasElement).toDataURL());
      return a === b ? a : settled();
    };
    const whole = await settled();
    await di.getByRole("button", { name: "Ana" }).click();
    await expect.poll(async () => (await settled()) !== whole).toBe(true);
    const ana = await settled();
    await di.getByRole("button", { name: "Bo" }).click();
    await expect.poll(async () => (await settled()) !== ana).toBe(true);
    await di.getByRole("button", { name: "Whole room" }).click();
    await expect.poll(async () => (await settled()) === whole).toBe(true);
    await closeAll(pages);
  });

  it("leaves a gap between the chat box and Start a new team", async () => {
    const { pages } = await revealed(["Ana", "Bo", "Cy", "Di"]);
    const di = pages[3] as Page;
    const gap = await di.evaluate(() => {
      const input = document.querySelector(".watch-say")?.getBoundingClientRect();
      const button = [...document.querySelectorAll("button")]
        .find((b) => b.textContent?.includes("Start a new team"))
        ?.getBoundingClientRect();
      return input && button ? button.top - input.bottom : -1;
    });
    expect(gap).toBeGreaterThanOrEqual(12);
    await closeAll(pages);
  });
});

describe("watchers see the room at the reveal", () => {
  it("a spectator's map is drawn behind the reveal, not black, and after the host starts", async () => {
    const { pages, code } = await revealed(["Ana", "Bo", "Cy", "Di"]);
    const di = pages[3] as Page; // sitting out: no card of their own
    await di.locator(".spectator-frame canvas, .reveal-canvas canvas").first().waitFor();
    // sitting out, Di is a watcher: the frame is the room, drawn, from the first moment
    await expect
      .poll(() =>
        di.locator(".spectator-frame canvas").evaluate((el) => {
          const c = el as HTMLCanvasElement;
          const ctx = c.getContext("2d");
          if (!ctx) return 0;
          const seen = new Set<string>();
          for (let x = 0; x < c.width; x += 7)
            for (let y = 0; y < c.height; y += 7)
              seen.add(ctx.getImageData(x, y, 1, 1).data.join(","));
          return seen.size;
        }),
      )
      .toBeGreaterThan(2);
    void code;
    await closeAll(pages);
  });
});

describe("players leave during the reveal", () => {
  it("the person the host pulls in can still press I'm ready: nothing covers the button", async () => {
    const { pages } = await revealed(["Ana", "Bo", "Cy", "Di"]);
    const [ana, bo, , di] = pages as [Page, Page, Page, Page];
    await bo.evaluate(() => {
      location.assign("/");
    });
    await ana.getByRole("button", { name: "Pull in Di" }).click({ timeout: 8000 });
    await di.locator(".reveal").waitFor({ timeout: 8000 });
    // nobody else is interrupted: Ana can still press her own button, and sees Di as not ready
    expect(await ana.getByRole("alertdialog").count()).toBe(0);
    expect(await di.getByRole("alertdialog").count()).toBe(0);
    await expect.poll(() => crewRow(ana, "Di").innerText()).toContain("Not ready");
    await ana.getByRole("button", { name: "I'm ready" }).click({ timeout: 3000 });
    // the role they are about to play is not "played" yet: no pip beside their name
    expect(await crewRow(di, "Di").locator(".pips").count()).toBe(0);
    await di.getByRole("button", { name: "I'm ready" }).click({ timeout: 3000 });
    await di.getByText(/You're ready/).waitFor({ timeout: 3000 });
    await closeAll(pages);
  });

  it("says who left, and a watcher who becomes host is asked what takes the empty seats", async () => {
    const { pages } = await revealed(["Ana", "Bo", "Cy", "Di"]);
    const [ana, bo, cy, di] = pages as [Page, Page, Page, Page];
    for (const leaver of [bo, cy])
      await leaver.evaluate(() => {
        location.assign("/");
      });
    await ana
      .locator(".reveal-gone")
      .getByText(/Bo left\./)
      .waitFor({ timeout: 8000 });
    await di
      .getByText(/left\./)
      .first()
      .waitFor({ timeout: 8000 });
    await ana.evaluate(() => {
      location.assign("/");
    });
    // everyone who played has gone: Di, only watching, is host and is asked
    await di.getByRole("alertdialog").waitFor({ timeout: 8000 });
    await di.getByRole("button", { name: "Back to lobby" }).waitFor();
    await di.getByRole("button", { name: "Let a bot take over" }).waitFor();
    await closeAll(pages);
  });
});

describe.each([
  ["phone", PHONE],
  ["desktop", DESKTOP],
])("the reveal at %s width", (_name, viewport) => {
  it("has no overflow or axe violations with a leaver's notice and the host's choice showing", async () => {
    const { pages } = await revealed(["Ana", "Bo", "Cy", "Di"], viewport);
    const [ana, bo] = pages as [Page, Page];
    await bo.evaluate(() => {
      location.assign("/");
    });
    await ana.locator(".reveal-gone").waitFor({ timeout: 8000 });
    await ana
      .getByRole("alertdialog")
      .getByRole("button", { name: "Let a bot take over" })
      .waitFor();
    expect(await horizontalOverflow(ana)).toBeLessThanOrEqual(0);
    expect(await axeViolations(ana)).toEqual([]);
    await closeAll(pages);
  });

  it("has no overflow and no axe violations for each role, host and guest", async () => {
    const { pages } = await revealed(["Ana", "Bo", "Cy"], viewport);
    for (const page of pages) {
      await page.locator(".reveal-canvas canvas").waitFor({ state: "attached" });
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      expect(await axeViolations(page)).toEqual([]);
    }
    await closeAll(pages);
  });
});

void openPage;

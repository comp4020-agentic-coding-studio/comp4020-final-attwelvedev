import { type Browser, chromium, type Page } from "playwright";

// A real browser for the checks jsdom can't make: anything that depends on
// layout (overflow, widths) only exists once a page has actually rendered.
// It drives the system Chrome, because the course CI has no step that
// installs a Playwright browser.

export interface Viewport {
  width: number;
  height: number;
}

export const PHONE: Viewport = { width: 375, height: 812 };
export const DESKTOP: Viewport = { width: 1280, height: 800 };

// SPEC_CPU_THROTTLE=4 slows every page's CPU four times over (Chrome's own CDP throttle). Off by default.
// It slows what the PAGE does, not the server, the machine or the other browsers, so it is a rough stand-in
// for a starved CI runner and not the same thing: it made one spec (door-pill) fail once at 4, and did not
// reproduce the labels walk or the escape-hud gear failures CI keeps showing at 1, 4, 6 or 8.
const THROTTLE = Number(process.env.SPEC_CPU_THROTTLE ?? 1);

export async function launch(args: string[] = []): Promise<Browser> {
  try {
    const browser = await chromium.launch({ channel: "chrome", args });
    if (THROTTLE > 1) {
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (...options) => {
        const context = await newContext(...options);
        context.on("page", async (page) => {
          const session = await context.newCDPSession(page);
          await session.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
        });
        return context;
      };
    }
    return browser;
  } catch (error) {
    throw new Error("Google Chrome isn't installed or can't be launched", { cause: error });
  }
}

export async function openPage(
  browser: Browser,
  url: string,
  viewport: Viewport,
  options: { colorScheme?: "light" | "dark" } = {},
): Promise<Page> {
  const context = await browser.newContext({ viewport, colorScheme: options.colorScheme });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  return page;
}

export function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

// Colour contrast is checked, so run it in both colour schemes. `within` limits it to one part of
// the page (a selector), for a modal whose promise is its own content, not what it covers.
export async function axeViolations(page: Page, within?: string): Promise<string[]> {
  // axe blends an element's opacity into the colours it checks, so a run that lands mid fade-in
  // (the comms wheel fades in over 100 ms) reads washed-out text as a contrast failure. Wait for
  // every animation that will end; one that never does (a pulse) is not waited for.
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime ?? 0));
    await Promise.race([
      Promise.allSettled(finite.map((a) => a.finished)),
      new Promise((done) => setTimeout(done, 5000)),
    ]);
  });
  await page.addScriptTag({ content: (await import("axe-core")).default.source });
  return page.evaluate(async (within) => {
    const axe = (window as unknown as { axe: typeof import("axe-core") }).axe;
    const results = await axe.run(within ? { include: [within] } : document, {
      rules: {
        "link-in-text-block": { enabled: false },
      },
    });
    return results.violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join("; ")}`,
    );
  }, within);
}

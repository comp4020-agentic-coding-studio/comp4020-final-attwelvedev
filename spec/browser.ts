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

export async function launch(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: "chrome" });
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

// Colour contrast is checked, so run it in both colour schemes.
export async function axeViolations(page: Page): Promise<string[]> {
  await page.addScriptTag({ content: (await import("axe-core")).default.source });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: typeof import("axe-core") }).axe;
    const results = await axe.run(document, {
      rules: {
        "link-in-text-block": { enabled: false },
      },
    });
    return results.violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join("; ")}`,
    );
  });
}

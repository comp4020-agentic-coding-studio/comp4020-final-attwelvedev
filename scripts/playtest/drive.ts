import type { CDPSession, Page } from "playwright";
import type { Page as WheelPage } from "../../src/client/wheel.ts";
import type { Stamp } from "../../src/game/channels.ts";
import type { Seat3 } from "./table.ts";

// The ways a person plays a tab: keys and mouse on 1280, real touches (the DevTools protocol, so
// the page sees real pointer events) on 375. Nothing here reads the game's state.
export type Dir8 =
  | "up"
  | "down"
  | "left"
  | "right"
  | "up-left"
  | "up-right"
  | "down-left"
  | "down-right";
export type MenuAction = "settings" | "restart-room" | "restart-heist" | "vote-yes" | "vote-no";

const VECTOR: Record<Dir8, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  "up-left": { x: -1, y: -1 },
  "up-right": { x: 1, y: -1 },
  "down-left": { x: -1, y: 1 },
  "down-right": { x: 1, y: 1 },
};
const KEYS: Record<Dir8, string[]> = {
  up: ["w"],
  down: ["s"],
  left: ["a"],
  right: ["d"],
  "up-left": ["w", "a"],
  "up-right": ["w", "d"],
  "down-left": ["s", "a"],
  "down-right": ["s", "d"],
};
const WHEEL_KEY: Record<WheelPage, string> = { talk: "1", faces: "2", clips: "3", marks: "4" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const sessions = new WeakMap<Page, CDPSession>();
async function cdp(page: Page): Promise<CDPSession> {
  let s = sessions.get(page);
  if (!s) {
    s = await page.context().newCDPSession(page);
    sessions.set(page, s);
  }
  return s;
}

async function centreOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function touchHold(
  page: Page,
  at: { x: number; y: number },
  ms: number,
): Promise<void> {
  const s = await cdp(page);
  await s.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] });
  await sleep(ms);
  await s.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

export async function move(seat: Seat3, dir: Dir8, ms: number): Promise<void> {
  if (seat.width === 375) {
    const c = await centreOf(seat.page, "[data-joystick]");
    const v = VECTOR[dir];
    const k = 40 / Math.hypot(v.x, v.y); // 40 px from the centre: past the dead zone, inside the stick
    await touchHold(seat.page, { x: c.x + v.x * k, y: c.y + v.y * k }, ms);
    return;
  }
  const keys = KEYS[dir];
  for (const k of keys) await seat.page.keyboard.down(k);
  await sleep(ms);
  for (const k of keys) await seat.page.keyboard.up(k);
}

export async function act(seat: Seat3): Promise<void> {
  if (seat.width === 375) {
    await touchHold(seat.page, await centreOf(seat.page, "[data-act]"), 200);
    return;
  }
  await seat.page.keyboard.down("Space");
  await sleep(200);
  await seat.page.keyboard.up("Space");
}

export async function gear(seat: Seat3): Promise<void> {
  if (seat.width === 375) {
    await touchHold(seat.page, await centreOf(seat.page, "[data-gear]"), 200);
    return;
  }
  await seat.page.keyboard.down("g");
  await sleep(200);
  await seat.page.keyboard.up("g");
}

const slotLocator = (page: Page, name: string) =>
  page
    .locator(".wheel-slot")
    .filter({ has: page.getByText(name, { exact: true }) })
    .or(page.locator(`.wheel-slot:has(img[alt="${name}"])`))
    .first();

// Opens the wheel as a person does (hold Q on 1280; tap the wheel button on 375), picks the slot
// by its drawn name and lets go.
export async function sendByWheel(
  seat: Seat3,
  slot: { page: WheelPage; name: string },
): Promise<void> {
  const page = seat.page;
  if (seat.width === 375) {
    await touchHold(page, await centreOf(page, ".wheel-btn"), 60);
    await page.locator(".wheel").waitFor({ timeout: 2000 });
    await page
      .locator(`.wheel-tab[data-page="${slot.page}"]`)
      .tap()
      .catch(() => {});
    const box = await slotLocator(page, slot.name).boundingBox();
    if (!box) throw new Error(`no wheel slot ${slot.name}`);
    await touchHold(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 60);
    return;
  }
  const frame = await page.locator(".frame").boundingBox();
  if (!frame) throw new Error("no frame");
  await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
  await page.keyboard.down("q");
  try {
    await page.locator(".wheel").waitFor({ timeout: 2000 });
    await page.keyboard.press(WHEEL_KEY[slot.page]);
    const box = await slotLocator(page, slot.name).boundingBox();
    if (!box) throw new Error(`no wheel slot ${slot.name}`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  } finally {
    await page.keyboard.up("q");
  }
}

export async function sendText(seat: Seat3, text: string): Promise<void> {
  const page = seat.page;
  await page.keyboard.press("Enter");
  const field = page.getByLabel("Message");
  await field.waitFor({ timeout: 2000 });
  await field.fill(text);
  await field.press("Enter");
}

// Stamps the floor at `at`, screenshot px: the Marks page's slot by name, then a click on the map.
export async function placeMark(
  seat: Seat3,
  stamp: Stamp,
  at: { x: number; y: number },
): Promise<void> {
  await sendByWheel(seat, { page: "marks", name: stamp });
  if (seat.width === 375) await touchHold(seat.page, at, 60);
  else await seat.page.mouse.click(at.x, at.y);
}

export async function menu(seat: Seat3, action: MenuAction): Promise<void> {
  const page = seat.page;
  const press = async (name: string | RegExp, exact = true) => {
    const button = page.getByRole("button", { name, exact });
    if (seat.width === 375) await button.tap();
    else await button.click();
  };
  const openMenu = async () => {
    if ((await page.getByRole("button", { name: "Menu" }).getAttribute("aria-expanded")) !== "true")
      await press("Menu");
  };
  switch (action) {
    case "settings":
      await openMenu();
      await press("Settings");
      await page.locator("#settings").waitFor({ timeout: 2000 });
      await press("Settings"); // closes it again
      await page.locator("#settings").waitFor({ state: "detached", timeout: 2000 });
      break;
    case "restart-room":
    case "restart-heist": {
      const kind = action === "restart-room" ? "room" : "heist";
      await openMenu();
      await press(`Restart ${kind}`); // arms
      await press(`Sure? Ask to restart ${kind}`); // confirms
      break;
    }
    case "vote-yes": {
      const kind = (await page.getByRole("alertdialog").innerText()).includes("heist")
        ? "Restart heist"
        : "Restart room";
      await press(kind);
      break;
    }
    case "vote-no":
      await press("Keep playing");
      break;
  }
}

// Whether the tab's game sound is on, as its own Settings panel says (a person with no headphones
// has it off and reads captions instead). Opens and closes the menu the way a person does.
export async function soundIsOn(seat: Seat3): Promise<boolean> {
  const page = seat.page;
  const tap = async (name: string) => {
    const button = page.getByRole("button", { name, exact: true });
    if (seat.width === 375) await button.tap();
    else await button.click();
  };
  await tap("Menu");
  await tap("Settings");
  const box = page.getByLabel("Game sound");
  await box.waitFor({ timeout: 2000 });
  const on = (await box.isChecked()) && (await box.isEnabled());
  await tap("Settings");
  await tap("Menu");
  return on;
}

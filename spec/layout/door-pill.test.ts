import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LIVE } from "../../src/client/render/project.ts";
import { WORLD } from "../../src/client/tokens.ts";
import type { Role } from "../../src/game/types.ts";
import { DESKTOP, launch, PHONE } from "../browser.ts";
import { playRoom, type Table } from "../playUi.ts";

// A door opening off screen is a pill at the edge toward it (ADR 0025, plan 2026-11-07-team-wide-doors
// Task 89). spec/fixtures/rooms-door has one door 28 tiles east of the spawns, which opens once all three
// stand on their plates beside the spawns: far past either camera. Its own app, since the rooms come
// from ROOMS_DIR. The pill is measured by its stroke, the door's colour, on the canvas: nothing else
// in this room is that colour while the door is off screen.
const port = 19080 + Math.floor(Math.random() * 1000);
const dir = mkdtempSync(join(tmpdir(), "door-pill-spec-"));
const url = `http://127.0.0.1:${port}`;
let app: ChildProcess;
let browser: Browser;
let desk: Table; // the deaf and mute players read the door at 1280
let phone: Table; // a second table in the same fixture, read at 375
let marked: Table; // a third: a mark stamped toward the door as it opens

beforeAll(async () => {
  if (!existsSync("dist/server/entry.mjs")) execSync("pnpm build", { stdio: "ignore" });
  app = spawn("node", ["server.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: join(dir, "app.db"),
      ROOMS_DIR: "spec/fixtures/rooms-door",
    },
    stdio: "ignore",
  });
  for (let attempt = 0; ; attempt++) {
    try {
      await fetch(url);
      break;
    } catch {
      if (attempt >= 150) throw new Error(`the spec's own app never came up on ${url}`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  browser = await launch();
  // two tables: a door opens once and its pill lasts 4 s, so each screen size gets its own door
  desk = await playRoom(browser, url);
  phone = await playRoom(browser, url);
  marked = await playRoom(browser, url);
  for (const page of [...desk.pages, ...phone.pages, ...marked.pages])
    await page.emulateMedia({ reducedMotion: "reduce" });
}, 90_000);

afterAll(async () => {
  app?.kill();
  rmSync(dir, { recursive: true, force: true });
  await browser?.close();
}, 30_000);

const ROLES = ["blind", "deaf", "mute"] as const;
const door = [0xf6, 0xcf, 0x63];
const DOOR = door;

// the bounding box, in CSS px on the canvas, of every pixel in the door's colour (null if none)
const pillBox = (page: Page) =>
  page.locator(".frame canvas").evaluate((el, want) => {
    const c = el as HTMLCanvasElement;
    const d = c.getContext("2d")?.getImageData(0, 0, c.width, c.height).data;
    const k = c.width / c.clientWidth;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -1;
    let y1 = -1;
    for (let i = 0; d && i < d.length; i += 4) {
      if (d[i] === want[0] && d[i + 1] === want[1] && d[i + 2] === want[2]) {
        const px = (i / 4) % c.width;
        const py = Math.floor(i / 4 / c.width);
        x0 = Math.min(x0, px);
        x1 = Math.max(x1, px);
        y0 = Math.min(y0, py);
        y1 = Math.max(y1, py);
      }
    }
    return x1 < 0 ? null : { x0: x0 / k, y0: y0 / k, x1: x1 / k, y1: y1 / k };
  }, door);

const boxOf = async (page: Page, selector: string) => {
  const loc = page.locator(selector).first();
  return (await loc.count()) ? await loc.boundingBox() : null;
};

// "stand on the plate": the plate is the tile east of the spawn (x 2 to 3; the spawn is at 1.5). A hold
// of 300 ms walked the deaf and mute figures to x of about 2.3 to 2.4 (probed), so a 150 ms tap
// ended near the plate's edge and a slow machine could fall short of it. The two pages that publish
// where their figure is (data-self; the blind page does not) walk until it is mid-plate; the blind
// one holds 320 ms, which is mid-plate by the same probe.
const standOn = async (page: Page, role: Role) => {
  await page.keyboard.down("d");
  try {
    if (role === "blind") await page.waitForTimeout(320);
    else {
      const selfX = async () => {
        const raw = await page.locator("canvas[data-camera]").getAttribute("data-self");
        return Number((raw ?? "").split(",")[0]);
      };
      await expect
        .poll(selfX, { timeout: 10_000, interval: 25, message: "walked onto the plate" })
        .toBeGreaterThan(2.3);
    }
  } finally {
    await page.keyboard.up("d");
  }
};

// Everything the checks need, read in one go while the pill is whole: a pill fading out is drawn at
// partial alpha, so it stops matching the door's colour and would read as a few stray pixels.
const snapshot = async (page: Page) => {
  const box = await pillBox(page);
  if (!box || box.y1 - box.y0 < 24 || box.x1 - box.x0 < 40) return null;
  const canvas = await page.locator(".frame canvas").boundingBox();
  if (!canvas) return null;
  const neighbours = [".captions", ".hud-top"].map(
    async (sel) => [sel, await boxOf(page, sel)] as const,
  );
  return { box, canvas, neighbours: await Promise.all(neighbours) };
};

// A door opening off screen, one table per screen size. The sizes are set before the door opens (a
// resize inside the 4 s costs part of it), and both roles are read at once, each from its own first
// sight of the pill: nothing waits on another check's turn, so a slow machine cannot use the 4 s up.
describe("a door opening off screen, drawn as an edge pill", () => {
  const sizes: [string, () => Table, { width: number; height: number }][] = [
    ["1280", () => desk, DESKTOP],
    ["375", () => phone, PHONE],
  ];
  const roles = [
    ["Can't hear", "deaf"],
    ["Can't speak", "mute"],
  ] as const;

  for (const [width, tableOf, size] of sizes) {
    it(`shows a pill at the edge toward the door at ${width}, clear of the captions and the top bar`, async () => {
      const table = tableOf();
      for (const [, role] of roles) await table.byRole[role].setViewportSize(size);
      // the whole table stands on its plates; the door opens at the far end
      for (const role of ROLES) await standOn(table.byRole[role], role);
      const seen = await Promise.all(
        roles.map(async ([name, role]) => {
          const label = `${name} at ${width}`;
          const page = table.byRole[role];
          let shot = null as Awaited<ReturnType<typeof snapshot>>;
          await expect
            .poll(async () => (shot = await snapshot(page)), {
              timeout: 10_000,
              interval: 50,
              message: `${label}: the door pill is drawn`,
            })
            .not.toBeNull();
          return { label, shot };
        }),
      );
      for (const { label, shot } of seen) {
        if (!shot) throw new Error(`${label}: no snapshot`);
        const { box, canvas, neighbours } = shot;
        const w = canvas.width;
        expect(box.x0, `${label}: on the east side, toward the door`).toBeGreaterThan(w / 2);
        expect(box.x1, `${label}: inside the canvas`).toBeLessThanOrEqual(w);
        expect(box.y1 - box.y0, `${label}: a pill, 24 px or more tall`).toBeGreaterThanOrEqual(24);
        expect(box.x1 - box.x0, `${label}: wide enough to read "Door"`).toBeGreaterThanOrEqual(40);
        // its neighbours: the caption strip and the top bar never touch it. (The face pills for
        // the other seats sit on the west side, toward them, so they are at least half a canvas away.)
        for (const [sel, other] of neighbours) {
          if (!other || other.height === 0) continue;
          const top = canvas.y + box.y0;
          const bottom = canvas.y + box.y1;
          const left = canvas.x + box.x0;
          const right = canvas.x + box.x1;
          const apart =
            bottom <= other.y ||
            top >= other.y + other.height ||
            right <= other.x ||
            left >= other.x + other.width;
          expect(apart, `${label}: the door pill clears ${sel}`).toBe(true);
        }
      }
      expect(WORLD.door.toLowerCase()).toBe("#f6cf63"); // the colour this reads is the token's
    }, 30_000);
  }
});

// The door's pill and a mark's pill toward the same edge (plan 2026-11-07-team-wide-doors, review
// fixes A Task 134): Can't speak stamps a mark ten tiles east, off Can't hear's phone screen, and the
// door opens beyond it within the mark pill's 4 s. On the phone both pills sit on the east edge, at
// nearly one height: they must never touch, 48 px or more between their centres.
const MUTE = [0x9b, 0x7e, 0xe0]; // ROLE_COLOR.mute: a mark's pill is its sender's colour

// the box (CSS px) of every pixel of one colour in the east third of the canvas (figures are central)
const eastBox = (page: Page, want: number[]) =>
  page.locator(".frame canvas").evaluate((el, want) => {
    const c = el as HTMLCanvasElement;
    const d = c.getContext("2d")?.getImageData(0, 0, c.width, c.height).data;
    const k = c.width / c.clientWidth;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -1;
    let y1 = -1;
    for (let i = 0; d && i < d.length; i += 4) {
      const px = (i / 4) % c.width;
      if (px < (c.width * 2) / 3) continue;
      if (d[i] === want[0] && d[i + 1] === want[1] && d[i + 2] === want[2]) {
        const py = Math.floor(i / 4 / c.width);
        x0 = Math.min(x0, px);
        x1 = Math.max(x1, px);
        y0 = Math.min(y0, py);
        y1 = Math.max(y1, py);
      }
    }
    return x1 < 0 ? null : { x0: x0 / k, y0: y0 / k, x1: x1 / k, y1: y1 / k };
  }, want);

async function pointAt(page: Page, name: string): Promise<void> {
  const slot = page
    .locator(".wheel-slot")
    .filter({ has: page.getByText(name, { exact: true }) })
    .first();
  const box = await slot.boundingBox();
  if (!box) throw new Error(`no slot ${name}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
}

describe("a door's pill beside a mark's pill", () => {
  it("at 375 the two pills on the east edge never touch", async () => {
    const { blind, deaf, mute } = marked.byRole;
    await deaf.setViewportSize(PHONE);
    // Can't see and Can't hear on their plates first: the door waits for Can't speak
    await standOn(blind, "blind");
    await standOn(deaf, "deaf");
    // Can't speak picks the Marks page on the wheel and stamps the floor tile (12, 2), well east of
    // Can't hear's phone screen and short of the door at x 30. Where it is drawn: the camera the
    // page publishes (scale, ox, oy) and the projection (render/project.ts: fromScreen)
    const canvas = mute.locator("canvas[data-camera]");
    const [scale, ox, oy] = ((await canvas.getAttribute("data-camera")) ?? "")
      .split(",")
      .map(Number);
    const box = await canvas.boundingBox();
    if (!box || !scale || ox === undefined || oy === undefined) throw new Error("no camera");
    // the camera is in CSS px; a row is scale x depth tall (render/project.ts: toScreen)
    const at = (x: number, y: number) => ({
      x: box.x + ox + x * scale,
      y: box.y + oy + y * scale * LIVE.depth,
    });
    const c = at(3.5, 2.5);
    const target = at(12.5, 2.5);
    await mute.mouse.move(c.x, c.y);
    await mute.keyboard.down("q");
    await mute.locator(".wheel").waitFor({ timeout: 1000 });
    await mute.keyboard.press("4"); // Marks
    await mute.locator(".wheel-tab.is-page", { hasText: "Marks" }).waitFor();
    await pointAt(mute, "→");
    await mute.keyboard.up("q");
    await mute.locator(".comms-place-note").waitFor({ timeout: 1000 });
    await mute.mouse.click(target.x, target.y);
    await mute.locator(".comms-toast", { hasText: "Sent" }).waitFor({ timeout: 1500 });
    await standOn(mute, "mute"); // the door opens
    let both = null as null | { door: Box; mark: Box };
    const pill = (b: Box | null) => b !== null && b.y1 - b.y0 >= 24 && b.x1 - b.x0 >= 30;
    await expect
      .poll(
        async () => {
          const [door, mark] = [await eastBox(deaf, DOOR), await eastBox(deaf, MUTE)];
          both = door && mark && pill(door) && pill(mark) ? { door, mark } : null;
          return both;
        },
        { timeout: 10_000, interval: 50, message: "both pills drawn on the phone" },
      )
      .not.toBeNull();
    if (!both) throw new Error("no pills");
    const { door, mark } = both as { door: Box; mark: Box };
    const mid = (b: Box) => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });
    const apartY = Math.abs(mid(door).y - mid(mark).y);
    const gapX = Math.max(mark.x0 - door.x1, door.x0 - mark.x1);
    const where = JSON.stringify({ door, mark });
    expect(apartY >= 47 || gapX >= 16, `the pills touch: ${where}`).toBe(true);
  }, 30_000);
});

type Box = { x0: number; y0: number; x1: number; y1: number };

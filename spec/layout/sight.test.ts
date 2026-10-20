import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DUSK, MIST, ROLE_COLOR, WORLD } from "../../src/client/tokens.ts";
import { DESKTOP, launch } from "../browser.ts";
import { playRoom, type Table } from "../playUi.ts";

// Line of sight, drawn (FR5, FR8). spec/fixtures/rooms-sight/01-wall.room has a wall across
// the west end between Can't hear's spawn (north of it) and Can't speak's (south of it), so
// each is out of the other's sight. Its own app, since the rooms come from ROOMS_DIR.
const ROOMS = "spec/fixtures/rooms-sight";
const port = 19080 + Math.floor(Math.random() * 1000);
const dir = mkdtempSync(join(tmpdir(), "sight-spec-"));
const url = `http://127.0.0.1:${port}`;
let app: ChildProcess;
let browser: Browser;
let table: Table;
let deaf: Page;
let mute: Page;

beforeAll(async () => {
  if (!existsSync("dist/server/entry.mjs")) execSync("pnpm build", { stdio: "ignore" });
  app = spawn("node", ["server.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: join(dir, "app.db"),
      ROOMS_DIR: ROOMS,
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
  table = await playRoom(browser, url);
  deaf = table.byRole.deaf;
  mute = table.byRole.mute;
  // Can't hear is the phone: give it the desktop's whole-room camera, so a tile has one place
  await deaf.setViewportSize(DESKTOP);
  // the canvas redraws at the new size on the next frame; a pixel read before that is the old picture
  await deaf.waitForFunction(() => {
    const c = document.querySelector<HTMLCanvasElement>(".frame canvas");
    return (
      !!c &&
      c.clientWidth > 1000 &&
      c.width === Math.round(c.clientWidth * (window.devicePixelRatio || 1))
    );
  });
  // the sea drifts and a hop is a motion: nothing here measures them
  for (const page of table.pages) await page.emulateMedia({ reducedMotion: "reduce" });
}, 60_000);

// No leaving the lobby first: that habit stops abandoned lobbies filling a shared server, and this
// app is this file's own and is killed here. Killing it first means a slow browser close can't leak it.
afterAll(async () => {
  app?.kill();
  rmSync(dir, { recursive: true, force: true });
  await browser?.close();
}, 30_000);

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb =>
  [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const near = (a: Rgb, b: Rgb, tol: number) =>
  a.every((v, i) => Math.abs(v - (b[i] as number)) <= tol);

// What the page's canvas shows at a point on the floor of tile (tx, ty), offset within the tile. Where
// the tile is comes from the page's own camera (`data-camera`), which is eased and follows you, so
// it is read, never worked out. The picture is read in the same frame as the camera it was drawn with.
async function pixelAt(page: Page, tx: number, ty: number, ox: number, oy: number): Promise<Rgb> {
  return page.locator(".frame canvas").evaluate(
    (el, p) => {
      const c = el as HTMLCanvasElement;
      const [scale, camX, camY] = (c.dataset.camera ?? "0,0,0").split(",").map(Number) as [
        number,
        number,
        number,
      ];
      const dpr = window.devicePixelRatio || 1;
      // the projection's depth is 0.82 once the world has risen, which it has by the time this is read
      const x = camX + (p.tx + p.ox) * scale;
      const y = camY + (p.ty + p.oy) * scale * 0.82;
      const d = c
        .getContext("2d")
        ?.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data;
      return [d?.[0] ?? 0, d?.[1] ?? 0, d?.[2] ?? 0] as Rgb;
    },
    { tx, ty, ox, oy },
  );
}

// Points on a tile's floor that no wall's top covers: the tilt makes a wall hide the floor up to
// 1.1 / 0.82 tiles behind it on screen, so only the near part of a row is clear of the next
// wall (rows 1 and 4 here sit just north of a wall).
const SPOTS: [number, number][] = [
  [0.3, 0.2],
  [0.7, 0.2],
  [0.3, 0.4],
  [0.7, 0.4],
];
const floorShare = async (page: Page, tx: number, ty: number) => {
  let floor = 0;
  let misty = 0;
  const blend: Rgb = rgb(WORLD.floor).map((f, i) =>
    Math.round(f * (1 - MIST.alpha) + (rgb(WORLD.mist)[i] as number) * MIST.alpha),
  ) as Rgb;
  for (const [ox, oy] of SPOTS) {
    const px = await pixelAt(page, tx, ty, ox, oy);
    if (near(px, rgb(WORLD.floor), 0)) floor++;
    else if (near(px, blend, 14)) misty++;
  }
  return { floor, misty };
};

// A tile is plain floor (all its sampled pixels), or veiled (the floor under the mist), or neither
// yet because the frame has not caught up: so every read is polled, never taken once.
const showsFloor = (page: Page, tx: number, ty: number) => async () =>
  (await floorShare(page, tx, ty)).floor >= 3;
const showsMist = (page: Page, tx: number, ty: number) => async () => {
  const { floor, misty } = await floorShare(page, tx, ty);
  return floor === 0 && misty >= 2;
};

// A canvas reads as the new picture only once a frame has been drawn at the new size, and expect.poll's
// default 1 s is shorter than a frame when the machine is busy: these failed at 1.1 s in full runs and
// passed alone. 5 s is for a frame under load; a picture that is wrong never settles, so it still fails.
const POLL_MS = 5000;

describe("line of sight, drawn", () => {
  it("the area behind the wall is drawn as mist on Can't hear's canvas, not as floor", async () => {
    // (5, 1) is open ground in Can't hear's sight; (5, 4) is the other side of the wall
    await expect.poll(showsFloor(deaf, 5, 1), { timeout: POLL_MS }).toBe(true);
    await expect
      .poll(showsMist(deaf, 5, 4), {
        timeout: POLL_MS,
        message: "veiled, and no pixel plain floor",
      })
      .toBe(true);
  });

  it("and the same for Can't speak, the other way round", async () => {
    await expect.poll(showsFloor(mute, 5, 4), { timeout: POLL_MS }).toBe(true);
    await expect
      .poll(showsMist(mute, 5, 1), {
        timeout: POLL_MS,
        message: "veiled, and no pixel plain floor",
      })
      .toBe(true);
  });

  it("Can't speak's face reaches Can't hear as an edge pill pointing toward them", async () => {
    // Can't speak holds Q, picks the face page's OK, and lets go
    const frame = await mute.locator(".frame").boundingBox();
    if (!frame) throw new Error("no frame");
    await mute.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
    await mute.keyboard.down("q");
    await mute.locator(".wheel").waitFor({ timeout: 1500 });
    await mute.keyboard.press("2");
    const slot = await mute.locator('.wheel-slot:has(img[alt="OK"])').first().boundingBox();
    if (!slot) throw new Error("no OK slot");
    await mute.mouse.move(slot.x + slot.width / 2, slot.y + slot.height / 2, { steps: 4 });
    await mute.keyboard.up("q");
    // Can't speak's triangle is on Can't hear's canvas only as the pill (they are behind the wall)
    const muteHalves = async () =>
      deaf.locator(".frame canvas").evaluate((el, want) => {
        const c = el as HTMLCanvasElement;
        const d = c.getContext("2d")?.getImageData(0, 0, c.width, c.height).data;
        let left = 0;
        let right = 0;
        for (let i = 0; d && i < d.length; i += 4) {
          if (d[i] === want[0] && d[i + 1] === want[1] && d[i + 2] === want[2]) {
            if ((i / 4) % c.width < c.width / 2) left++;
            else right++;
          }
        }
        return { left, right };
      }, rgb(ROLE_COLOR.mute));
    await expect.poll(async () => (await muteHalves()).left, { timeout: 1500 }).toBeGreaterThan(4);
    expect((await muteHalves()).right, "none on the far side from them").toBe(0);
  });

  // Last in the file on purpose: it sets the alarm off and leaves it on, and Can't speak standing on a
  // plate, which would change the world every test after it reads.
  // The veil is one region cut by the light, so along the ray's edge no tile is veiled whole or left
  // clear. Can't hear is at (1.5, 1.5) with a wall across the room whose end is at (10, 3): the edge of
  // the light is the straight line through the two, and it crosses tiles at every fraction, including
  // slivers (5.9% of tile (16, 4)) that a 4x4 sample called dark. It showed at night, where the veil
  // stands out, so the alarm is set off first: Can't speak walks onto plate p3 (9, 4).
  // The edge of the light runs from where Can't hear is drawn (the page says: `data-self`) through the
  // wall's end at the corner (10, 3). Read from the page at the moment it is used, since they may move.
  const readViewer = async () => {
    const at = await deaf.locator(".frame canvas").getAttribute("data-self");
    const [x, y] = (at ?? "0,0").split(",").map(Number) as [number, number];
    return { x, y };
  };
  const edgeOf = (v: { x: number; y: number }) => {
    const slope = (3 - v.y) / (10 - v.x); // rise per tile east, from the viewer through the corner (10, 3)
    return (x: number) => v.y + slope * (x - v.x);
  };

  it("at night, the mist's edge is the ray: every point either side of it is clear or veiled as it should be", async () => {
    // Plates are numbered in reading order, so p3 is the one on row 4 (the third `p` down), which is
    // Can't speak's own row: east eight tiles from their spawn is onto it.
    await mute.keyboard.down("d");
    await expect
      .poll(() => deaf.locator(".frame canvas").getAttribute("data-alarm"), {
        timeout: 15000,
        message: "the alarm starts when Can't speak steps on plate p3",
      })
      .toBe("on");
    await mute.keyboard.up("d");
    // Plain light at night is the dusk floor (red 92); the veil over it is much paler (red 174), with
    // stipple dots on top. So a pixel is judged by how pale it is, against the midpoint of the two, and
    // read as the average of a small patch so one stipple dot cannot decide it.
    const litRed = rgb(DUSK.floor as string)[0] as number;
    const veilRed = Math.round(
      litRed * (1 - MIST.alpha) + (rgb(WORLD.mist)[0] as number) * MIST.alpha,
    );
    const midpoint = (litRed + veilRed) / 2;
    expect(
      veilRed - litRed,
      "light and veil must differ for this test to mean anything",
    ).toBeGreaterThan(40);
    const paleness = async (tx: number, ty: number, ox: number, oy: number) => {
      let sum = 0;
      for (const [dx, dy] of [
        [-0.03, -0.03],
        [0.03, -0.03],
        [-0.03, 0.03],
        [0.03, 0.03],
        [0, 0],
      ] as const)
        sum += (await pixelAt(deaf, tx, ty, ox + dx, oy + dy))[0];
      return sum / 5;
    };
    // Points 0.12 of a tile above and below the edge, in the one row the edge crosses, so only the edge
    // decides. Columns 11 to 13 are in the light's reach; x = 14 is the door, and past it the light stops.
    const viewer = await readViewer();
    const edgeY = edgeOf(viewer);
    const wrong: string[] = [];
    let checked = 0;
    for (const x of [11, 12, 13]) {
      const e = edgeY(x + 0.5);
      const ty = Math.floor(e);
      const frac = e - ty;
      checked++;
      const above = await paleness(x, ty, 0.5, frac - 0.12);
      const below = await paleness(x, ty, 0.5, frac + 0.12);
      if (above > midpoint)
        wrong.push(
          `x=${x}: above the edge is veiled (red ${above.toFixed(0)}, light ${litRed}, veil ${veilRed})`,
        );
      if (below < midpoint)
        wrong.push(
          `x=${x}: below the edge is lit (red ${below.toFixed(0)}, light ${litRed}, veil ${veilRed})`,
        );
    }
    // The door column (x = 14) is closed, so it stops the light: everything east of it is veiled whole,
    // above the edge too. That is the rule (a closed door blocks sight, the server's as well), and it is
    // what stopped this test reading those columns as lit.
    for (const x of [15, 16, 17]) {
      const here = await paleness(x, 1, 0.5, 0.2);
      if (here < midpoint)
        wrong.push(`x=${x}: behind the closed door at x = 14 it is lit (red ${here.toFixed(0)})`);
    }
    expect(checked, "the columns the light reaches past the wall's end").toBe(3);
    expect(wrong, "points either side of the ray's edge").toEqual([]);
  });
});

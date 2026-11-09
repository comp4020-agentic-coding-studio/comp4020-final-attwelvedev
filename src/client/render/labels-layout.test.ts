import { describe, expect, it, vi } from "vitest";
import { viewFor } from "../../game/perception.ts";
import { loadRooms } from "../../game/rooms/load.ts";
import { worldAt } from "../../game/rooms/mockup.ts";
import { LABEL_CAP, labelsFor } from "../labels.ts";
import { draw, type Scene } from "../render.ts";

// Where the label chips fall, over every floor tile a player can stand on, in rooms 3, 5 and 7 (task 34): no chip
// sits on another or on a plaque's plate, and a plaque's plate stays inside the canvas (task 35). This replaces
// spec/layout/labels.test.ts, which walked a real browser through each room for 30 s a leg to read the same boxes
// from `data-label-boxes`; that walk failed in CI in ten different ways (a camera that sends the team back, a late
// key-up, a dropped connection, a stall in a one-tile gap nobody explained) and none of them was the layout.
//
// The page builds each frame's chips with `labelsFor` and draws them with `draw`, which hands back `scene.report`
// (the boxes it drew). This does the same for a viewer on every tile, with the arguments the page passes in room one
// (everything is labelled, no kind met before, a cap of 3 chips at desktop width and 2 on a phone), on a recording
// canvas. What it does not do is measure real text: the page asks the browser for the Archivo font's widths and
// here a width per character stands in. A chip is placed by walking up from its object to the first free place, so
// "no overlap" holds for any width; it is checked at a narrow and a wide one instead of at one number that pretends
// to be the font. The real font measures 5.7 to 6.2 px a character at 600 weight, 13 px (measured in Chrome with
// Archivo loaded, on six of the chip texts), so 5 and 7 bracket it: a line wraps at 230 px, and these keep the
// number of lines a chip has (and so its height) in the range the page produces.

const NARROW = 5;
const WIDE = 7;
const WIDTHS = [
  { name: "narrow", px: NARROW },
  { name: "wide", px: WIDE },
];
const SIZES = [
  { name: "desktop", w: 1280, h: 800, cap: LABEL_CAP.desktop },
  { name: "phone", w: 375, h: 700, cap: LABEL_CAP.phone },
];

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const GAP_PX = 6; // between two chips (labels.ts)
const apart = (a: Box, b: Box, gap = 0) =>
  a.x + a.w + gap <= b.x ||
  b.x + b.w + gap <= a.x ||
  a.y + a.h + gap <= b.y ||
  b.y + b.h + gap <= a.y;

// A recording canvas that draws nothing and measures text by character count.
const canvas = (pxPerChar: number) =>
  new Proxy(
    {},
    {
      get: (_t, name) => {
        if (name === "measureText") return (t: string) => ({ width: t.length * pxPerChar });
        if (name === "createLinearGradient" || name === "createRadialGradient")
          return () => ({ addColorStop() {} });
        return () => {};
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;

const ROOMS = loadRooms().filter((r) => ["03-", "05-", "07-"].some((p) => r.id.startsWith(p)));

// The boxes drawn with the viewer standing on tile (vx, vy), in a canvas `w` by `h`.
function boxesAt(
  room: ReturnType<typeof loadRooms>[0],
  vx: number,
  vy: number,
  size: { w: number; h: number; cap: number },
  px: number,
) {
  const world = worldAt(room, vx, vy);
  const at = { x: vx + 0.5, y: vy + 0.5 };
  world.players[1].pos = at;
  const view = viewFor(world, 1, "deaf", true);
  const labels = labelsFor(
    view.entities,
    view.tiles,
    at,
    true,
    () => true,
    undefined,
    size.cap,
    new Set(),
  );
  const scene = {
    w: size.w,
    h: size.h,
    labels,
    report: { chips: [], plaques: [] },
    role: "deaf",
    seat: 1,
    roles: ["blind", "deaf", "mute"],
    roomId: view.room,
    tiles: view.tiles,
    seen: view.seen,
    entities: view.entities,
    self: at,
    layout: "follow",
  } as unknown as Scene;
  draw(canvas(px), scene);
  return scene.report as { chips: Box[]; plaques: Box[] };
}

const floor = (room: ReturnType<typeof loadRooms>[0]) =>
  room.grid.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === "." ? [{ x, y }] : [])));

describe.each(ROOMS)("label chips in room $id", (room) => {
  vi.stubGlobal("Path2D", class {});
  const tiles = floor(room);

  it.each(SIZES.flatMap((s) => WIDTHS.map((w) => ({ ...s, ...w }))))(
    "stay in the canvas and sit on no plaque and on no other chip, from every floor tile ($name, $w px, $name text)",
    (size) => {
      let chips = 0;
      let plaques = 0;
      const bad: string[] = [];
      for (const t of tiles) {
        const report = boxesAt(room, t.x, t.y, size, size.px);
        chips += report.chips.length;
        plaques += report.plaques.length;
        for (const chip of report.chips) {
          if (chip.x < 0 || chip.y < 0 || chip.x + chip.w > size.w || chip.y + chip.h > size.h)
            bad.push(
              `from ${t.x},${t.y}: chip ${JSON.stringify(chip)} outside the ${size.w}x${size.h} canvas`,
            );
          for (const plate of report.plaques)
            if (!apart(chip, plate))
              bad.push(
                `from ${t.x},${t.y}: chip ${JSON.stringify(chip)} on plaque ${JSON.stringify(plate)}`,
              );
          for (const other of report.chips)
            if (chip !== other && !apart(chip, other, GAP_PX - 1))
              bad.push(
                `from ${t.x},${t.y}: chip ${JSON.stringify(chip)} on chip ${JSON.stringify(other)}`,
              );
        }
      }
      // a layout check that saw no chips proved nothing
      expect(chips, "chips were placed").toBeGreaterThan(100);
      expect(bad.slice(0, 3), `${bad.length} overlaps`).toEqual([]);
      // room 5 is the one with plaques in view: a check over it must have met some
      if (room.id.startsWith("05-")) expect(plaques, "plaques were in view").toBeGreaterThan(20);
    },
  );
});

describe("a plaque's plate stays inside the canvas (task 35)", () => {
  // Room 5's S1 is in the top wall row: its plate floats above row 0, so it only stays in the canvas if it is slid
  // back in. The window is made shorter as the page's was: 800, 420 and 260 px high at 1280 wide.
  const room = ROOMS.find((r) => r.id.startsWith("05-")) as ReturnType<typeof loadRooms>[0];
  it.each([800, 420, 260])("at %i px high, from every tile that shows one", (h) => {
    let seen = 0;
    const outside: string[] = [];
    for (const t of floor(room)) {
      const report = boxesAt(room, t.x, t.y, { w: 1280, h, cap: LABEL_CAP.desktop }, 7);
      for (const plate of report.plaques) {
        seen++;
        if (plate.x < 0 || plate.y < 0 || plate.x + plate.w > 1280 || plate.y + plate.h > h)
          outside.push(`from ${t.x},${t.y}: ${JSON.stringify(plate)}`);
      }
    }
    expect(seen, "plaques were in view").toBeGreaterThan(20);
    expect(outside.slice(0, 3), `${outside.length} plates outside the canvas`).toEqual([]);
  });
});

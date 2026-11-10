import { describe, expect, it } from "vitest";
import {
  boxOf,
  CENTRE_INDEX,
  clearRadius,
  hasCentre,
  insideOutline,
  layoutFor,
  MIN_TARGET_PX,
  modeFor,
  mouseCentre,
  PAGES_ALL,
  placementFor,
  SIDE_GAP,
  SIDE_TAB_H,
  SIDE_TAB_PITCH,
  SIDE_TAB_W,
  slotCount,
  slotIndexAt,
  slotPos,
  slotSize,
  wheelExtent,
  wheelScale,
  widestHalf,
} from "./wheelLayout.ts";

const MODES = ["wide", "narrow"] as const;

describe("layoutFor: which shape a page takes", () => {
  it("makes Talk and Marks a ring of eight round a centre disc, in both modes", () => {
    for (const mode of MODES) {
      expect(layoutFor("talk", mode)).toBe("ring8");
      expect(layoutFor("marks", mode)).toBe("ring8");
    }
  });

  it("makes Faces and Clips a ring of twelve on a wide frame and a 4x3 grid on a narrow one", () => {
    for (const page of ["faces", "clips"] as const) {
      expect(layoutFor(page, "wide")).toBe("ring12");
      expect(layoutFor(page, "narrow")).toBe("grid4");
    }
  });

  it("puts Stop and the cross in a centre disc, and leaves the middle of a ring empty", () => {
    expect(slotPos("talk", "wide", CENTRE_INDEX)).toEqual({ x: 0, y: 0 });
    expect(slotPos("marks", "narrow", CENTRE_INDEX)).toEqual({ x: 0, y: 0 });
    expect(hasCentre("talk")).toBe(true);
    expect(hasCentre("marks")).toBe(true);
    expect(hasCentre("faces")).toBe(false);
  });

  it("leaves most of the middle visible: the disc is small against the clear space inside the ring", () => {
    for (const mode of MODES) {
      for (const page of ["talk", "marks"] as const) {
        expect(slotSize(page, mode).centre / 2, `${page} ${mode}`).toBeLessThan(
          clearRadius(page, mode),
        );
      }
    }
  });
});

describe("every layout is usable", () => {
  for (const mode of MODES) {
    for (const page of PAGES_ALL) {
      const n = slotCount(page);

      it(`${page} (${mode}): slots are at least ${MIN_TARGET_PX} px`, () => {
        for (let i = 0; i < n; i++) {
          const b = boxOf(page, mode, i);
          expect(b.right - b.left, `slot ${i} wide`).toBeGreaterThanOrEqual(MIN_TARGET_PX);
          expect(b.bottom - b.top, `slot ${i} tall`).toBeGreaterThanOrEqual(MIN_TARGET_PX);
        }
      });

      it(`${page} (${mode}): no two slot boxes touch`, () => {
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const a = slotPos(page, mode, i);
            const b = slotPos(page, mode, j);
            const ba = boxOf(page, mode, i);
            const bb = boxOf(page, mode, j);
            const gap = Math.max(
              Math.max(ba.left, bb.left) - Math.min(ba.right, bb.right),
              Math.max(ba.top, bb.top) - Math.min(ba.bottom, bb.bottom),
            );
            expect(gap, `${i} and ${j}`).toBeGreaterThanOrEqual(8);
            void a;
            void b;
          }
        }
      });

      it(`${page} (${mode}): every slot is inside its outline`, () => {
        for (let i = 0; i < n; i++) {
          const b = boxOf(page, mode, i);
          for (const [x, y] of [
            [b.left, b.top],
            [b.right, b.top],
            [b.left, b.bottom],
            [b.right, b.bottom],
          ] as const) {
            expect(insideOutline(page, mode, x, y), `slot ${i} corner ${x},${y}`).toBe(true);
          }
        }
      });

      it(`${page} (${mode}): aiming at a slot's centre picks that slot`, () => {
        for (let i = 0; i < n; i++) {
          const { x, y } = slotPos(page, mode, i);
          expect(slotIndexAt(page, mode, x, y), `slot ${i}`).toBe(i);
        }
      });

      it(`${page} (${mode}): aiming at any corner of a slot's box picks that slot`, () => {
        for (let i = 0; i < n; i++) {
          const b = boxOf(page, mode, i);
          // a hair inside each corner: whatever is drawn is what is selected
          for (const [x, y] of [
            [b.left + 1, b.top + 1],
            [b.right - 1, b.top + 1],
            [b.left + 1, b.bottom - 1],
            [b.right - 1, b.bottom - 1],
          ] as const) {
            expect(slotIndexAt(page, mode, x, y), `slot ${i} at ${x},${y}`).toBe(i);
          }
        }
      });
    }
  }
});

describe("the narrow wheel fits a phone frame", () => {
  it("is no wider than 351 px and no taller than the frame leaves room for", () => {
    for (const page of PAGES_ALL) {
      const e = wheelExtent(page, "narrow");
      expect(e.width, page).toBeLessThanOrEqual(351);
      expect(e.height, page).toBeLessThanOrEqual(469);
    }
  });

  it("needs no scaling in a 351x469 frame, so no target is shrunk", () => {
    for (const page of PAGES_ALL) {
      expect(wheelScale(page, "narrow", 351, 469), page).toBe(1);
    }
  });
});

describe("one scale for the whole wheel, whatever page is showing", () => {
  it("is the same for every page, so the wheel never grows or shrinks when the page changes", () => {
    for (const mode of MODES) {
      for (const [w, h] of [
        [1256, 595],
        [1256, 480],
        [351, 469],
      ] as const) {
        const scales = new Set(PAGES_ALL.map((p) => wheelScale(p, mode, w, h)));
        expect(scales.size, `${mode} ${w}x${h}`).toBe(1);
      }
    }
  });

  it("fits the biggest page, so the plate and labels stay in the frame on every page", () => {
    for (const mode of MODES) {
      const k = wheelScale("talk", mode, 1256, 595);
      for (const page of PAGES_ALL) {
        const e = wheelExtent(page, mode);
        // allow the minimum-target floor to win in a frame too small to fit
        if (
          k >
          0.99 *
            Math.max(
              ...PAGES_ALL.map((p) => 48 / Math.min(slotSize(p, mode).w, slotSize(p, mode).h)),
            )
        ) {
          expect(e.height * k, `${page} ${mode}`).toBeLessThanOrEqual(595);
        }
      }
    }
  });
});

describe("wheelScale on a wide frame", () => {
  it("is full size when there is room and shrinks gently when there is not", () => {
    expect(wheelScale("faces", "wide", 1256, 800)).toBe(1);
    const short = wheelScale("faces", "wide", 1256, 480);
    expect(short).toBeLessThan(1);
    expect(short).toBeGreaterThan(0.6);
  });

  it("never draws a slot under 48 px", () => {
    for (const page of PAGES_ALL) {
      for (const [w, h] of [
        [1256, 595],
        [1256, 480],
        [600, 400],
      ] as const) {
        const k = wheelScale(page, "wide", w, h);
        const s = slotSize(page, "wide");
        expect(s.w * k, `${page} ${w}x${h}`).toBeGreaterThanOrEqual(MIN_TARGET_PX);
        expect(s.h * k, `${page} ${w}x${h}`).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      }
    }
  });
});

// B1 (playtest 3): a 1280×560 window leaves a 1256×337 frame, too short for the wide wheel with
// its labels above and plate below, even at its 48 px floor.
describe("a wide frame too short for the stacked wheel", () => {
  it("puts the labels and plate beside a compact wheel, which then fits the frame unshrunk", () => {
    expect(placementFor(1256, 577)).toBe("stacked");
    expect(placementFor(351, 469)).toBe("stacked");
    expect(placementFor(1256, 337)).toBe("side");
    expect(modeFor(1256, 337)).toBe("narrow");
    const k = wheelScale("talk", "narrow", 1256, 337, "side");
    for (const page of PAGES_ALL) {
      const e = wheelExtent(page, "narrow", "side");
      expect(e.height * k, page).toBeLessThanOrEqual(337);
      expect(e.width * k, page).toBeLessThanOrEqual(1256);
    }
  });
});

// F2 (Task 284): a right-click near the frame's edge opened the side wheel with its label column off the
// frame: the centre was clamped by the outline alone, not the labels to its left and the plate to its right.
describe("a mouse-opened wheel's centre keeps the whole wheel in the frame (F2)", () => {
  const W = 1280;
  const H = 337;
  const placement = placementFor(W, H);
  const mode = modeFor(W, H);
  const k = Math.max(...PAGES_ALL.map((p) => wheelScale(p, mode, W, H, placement)));
  const half = widestHalf(mode);
  const tabsLeft = -(half + SIDE_GAP + SIDE_TAB_W); // the label column's left edge, unscaled
  const plateRight = half + SIDE_GAP + 320; // the plate's right edge at its 20rem max-width
  const tabsHalfH = 1.5 * SIDE_TAB_PITCH + SIDE_TAB_H / 2;

  it("is the side placement on a 1280×337 frame", () => {
    expect(placement).toBe("side");
  });

  for (const [what, origin] of [
    ["near the left edge", { x: 5, y: H / 2 }],
    ["near the right edge", { x: W - 5, y: H / 2 }],
    ["near the top", { x: W / 2, y: 3 }],
    ["near the bottom", { x: W / 2, y: H - 3 }],
  ] as const) {
    it(`opened ${what}: the labels and the plate are inside the frame`, () => {
      const c = mouseCentre(origin, W, H, mode, placement);
      expect(c.x + tabsLeft * k, "labels' left edge").toBeGreaterThanOrEqual(0);
      expect(c.x + plateRight * k, "plate's right edge").toBeLessThanOrEqual(W);
      expect(c.y - tabsHalfH * k, "labels' top").toBeGreaterThanOrEqual(0);
      expect(c.y + tabsHalfH * k, "labels' bottom").toBeLessThanOrEqual(H);
    });
  }

  it("stacked keeps its clamp: a wide tall frame opened near the left edge", () => {
    const m = modeFor(1280, 800);
    expect(placementFor(1280, 800)).toBe("stacked");
    const c = mouseCentre({ x: 5, y: 400 }, 1280, 800, m, "stacked");
    expect(c.x).toBeGreaterThan(5);
    expect(c.y).toBe(400);
  });
});

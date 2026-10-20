import { describe, expect, it } from "vitest";
import {
  boxOf,
  CENTRE_INDEX,
  clearRadius,
  hasCentre,
  insideOutline,
  layoutFor,
  MIN_TARGET_PX,
  PAGES_ALL,
  slotCount,
  slotIndexAt,
  slotPos,
  slotSize,
  wheelExtent,
  wheelScale,
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

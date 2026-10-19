import { describe, expect, it } from "vitest";
import { CALLOUTS, CLIPS, FACES, STAMPS } from "../game/channels.ts";
import type { CrewMember } from "../net/protocol.ts";
import {
  aimFrom,
  DRAW_MS,
  defaultPage,
  FLICK_PX,
  pageSlots,
  quickSlot,
  receiversOf,
  releaseAction,
  sendersOf,
  shouldDraw,
  tabAt,
  tabXY,
  verbFor,
} from "./wheel.ts";
import { outlineOf } from "./wheelLayout.ts";

const crew: CrewMember[] = [
  { seat: 0, nickname: "Ana", role: "blind", bot: false },
  { seat: 1, nickname: "Bo", role: "deaf", bot: false },
  { seat: 2, nickname: "Cy", role: "mute", bot: false },
];

describe("what is on each page", () => {
  it("has the nine callouts in the old grid order, so number keys 1-9 still reach them", () => {
    expect(pageSlots("talk").map((s) => s.id)).toEqual(CALLOUTS.map((c) => `callout:${c}`));
  });

  it("has every face, clip and mark", () => {
    expect(pageSlots("faces").map((s) => s.id)).toEqual(FACES.map((f) => `face:${f.id}`));
    expect(pageSlots("clips").map((s) => s.id)).toEqual(CLIPS.map((c) => `clip:${c.id}`));
    expect(
      pageSlots("marks")
        .map((s) => s.id.slice(5))
        .sort(),
    ).toEqual([...STAMPS].sort());
  });

  it("lays the callouts and marks out like compass points: arrows on the axes, Stop and a cross in the middle", () => {
    const at = (page: "talk" | "marks", col: number, row: number) =>
      pageSlots(page)[row * 3 + col]?.id;
    expect(at("talk", 1, 0)).toBe("callout:up");
    expect(at("talk", 1, 2)).toBe("callout:down");
    expect(at("talk", 0, 1)).toBe("callout:left");
    expect(at("talk", 2, 1)).toBe("callout:right");
    expect(at("talk", 1, 1)).toBe("callout:stop");
    expect(at("talk", 0, 0)).toBe("callout:push");
    expect(at("talk", 2, 0)).toBe("callout:here");
    expect(at("marks", 1, 0)).toBe("mark:up");
    expect(at("marks", 1, 1)).toBe("mark:x");
    expect(at("marks", 0, 0)).toBe("mark:question");
    expect(at("marks", 2, 0)).toBe("mark:bang");
    expect(at("marks", 0, 2)).toBe("mark:door");
    expect(at("marks", 2, 2)).toBe("mark:key");
  });
});

describe("flick or hold", () => {
  const id = (page: "talk" | "faces", i: number) => pageSlots(page)[i]?.id;

  it("draws the wheel only after a 200 ms hold", () => {
    expect(DRAW_MS).toBe(200);
    expect(shouldDraw(120)).toBe(false);
    expect(shouldDraw(250)).toBe(true);
  });

  it("sends the slot a quick flick points at, without drawing, on every layout", () => {
    expect(FLICK_PX).toBe(24);
    for (const mode of ["wide", "narrow"] as const) {
      const flick = (dx: number, dy: number) => {
        const r = releaseAction("talk", mode, { drawn: false, dx, dy });
        return r.kind === "send" ? id("talk", r.index) : null;
      };
      expect(flick(0, -40), mode).toBe("callout:up");
      expect(flick(0, 40), mode).toBe("callout:down");
      expect(flick(-40, 0), mode).toBe("callout:left");
      expect(flick(40, 0), mode).toBe("callout:right");
      expect(flick(40, -40), mode).toBe("callout:here"); // up and right
      expect(flick(-40, -40), mode).toBe("callout:push");
      expect(flick(-40, 40), mode).toBe("callout:wait");
      expect(flick(40, 40), mode).toBe("callout:go");
    }
  });

  it("flicks on a ring page too: up picks the first face", () => {
    const r = releaseAction("faces", "wide", { drawn: false, dx: 0, dy: -40 });
    expect(r).toEqual({ kind: "send", index: 0 });
  });

  it("does nothing for a tap that never moved", () => {
    expect(releaseAction("talk", "wide", { drawn: false, dx: 4, dy: 3 })).toEqual({
      kind: "cancel",
    });
  });

  it("sends what the cursor is over after a still hold, and the middle slot over the middle", () => {
    const r = releaseAction("talk", "wide", { drawn: true, dx: 0, dy: 0 });
    expect(r.kind === "send" && id("talk", r.index)).toBe("callout:stop");
  });

  it("cancels a release outside the wheel's outline, on a ring and on a grid", () => {
    expect(releaseAction("faces", "wide", { drawn: true, dx: 0, dy: -400 })).toEqual({
      kind: "cancel",
    });
    expect(releaseAction("talk", "narrow", { drawn: true, dx: 300, dy: 0 })).toEqual({
      kind: "cancel",
    });
  });

  it("cancels on a ring's dead centre", () => {
    expect(releaseAction("faces", "wide", { drawn: true, dx: 2, dy: 2 })).toEqual({
      kind: "cancel",
    });
  });
});

describe("aiming with the real cursor", () => {
  it("aims by where the cursor is over the drawn wheel, not by how far it has moved", () => {
    const talk = pageSlots("talk");
    // a wheel drawn at (500, 400): a cursor 68 px above its centre is over Up
    const up = aimFrom("talk", "wide", { x: 500, y: 332 }, { x: 500, y: 400 });
    expect(talk[up as number]?.id).toBe("callout:up");
    // a cursor that has not moved from the centre is over Stop
    const mid = aimFrom("talk", "wide", { x: 500, y: 400 }, { x: 500, y: 400 });
    expect(talk[mid as number]?.id).toBe("callout:stop");
    // a cursor left in a far corner aims at nothing
    expect(aimFrom("talk", "wide", { x: 40, y: 40 }, { x: 500, y: 400 })).toBeNull();
  });
});

describe("the page labels sit in one row above every page's outline", () => {
  it("share a single height, so they do not jump when the page changes", () => {
    for (const mode of ["wide", "narrow"] as const) {
      const ys = new Set(
        (["talk", "faces", "clips", "marks"] as const).map((p) => tabXY(p, mode).y),
      );
      expect(ys.size, mode).toBe(1);
    }
  });

  it("sit clear above the outline of every page, never on a slot", () => {
    for (const mode of ["wide", "narrow"] as const) {
      const { y } = tabXY("talk", mode);
      for (const page of ["talk", "faces", "clips", "marks"] as const) {
        const o = outlineOf(page, mode);
        const top = o.kind === "circle" ? o.r : o.halfH;
        // a label is ~34 px tall, centred on y
        expect(y + 17, `${page} ${mode}`).toBeLessThanOrEqual(-top);
      }
    }
  });

  it("fit side by side without leaving the frame, on a phone", () => {
    const xs = (["talk", "faces", "clips", "marks"] as const).map((p) => tabXY(p, "narrow").x);
    expect(Math.max(...xs) - Math.min(...xs) + 82).toBeLessThanOrEqual(351);
  });
});

describe("tabAt", () => {
  it("finds each page label where it is drawn, in both modes", () => {
    for (const mode of ["wide", "narrow"] as const) {
      for (const page of ["talk", "faces", "clips", "marks"] as const) {
        const { x, y } = tabXY(page, mode);
        expect(tabAt(page, mode, x, y), `${page} ${mode}`).toBe(page);
      }
    }
  });

  it("finds nothing in the middle of the wheel", () => {
    expect(tabAt("talk", "wide", 0, 0)).toBeNull();
  });
});

describe("receiversOf", () => {
  it("names who hears a clip and lists the rest under can't", () => {
    const { hear, cant } = receiversOf("clip", crew, 2);
    expect(hear.map((c) => c.nickname)).toEqual(["Ana"]);
    expect(cant.map((c) => c.nickname)).toEqual(["Bo"]);
  });

  it("never lists the sender", () => {
    for (const me of [0, 1, 2] as const) {
      const { hear, cant } = receiversOf("callout", crew, me);
      expect([...hear, ...cant].some((c) => c.seat === me)).toBe(false);
      expect(hear.length + cant.length).toBe(2);
    }
  });

  it("follows the table: Can't see's face reaches Can't hear and Can't speak", () => {
    const { hear, cant } = receiversOf("face", crew, 0);
    expect(hear.map((c) => c.nickname)).toEqual(["Bo", "Cy"]);
    expect(cant).toEqual([]);
  });

  it("names a clip's senders for a role that can't send it", () => {
    expect(sendersOf("clip", crew, 0).map((c) => c.nickname)).toEqual(["Bo", "Cy"]);
  });
});

describe("pages and the quick slot", () => {
  it("opens on Talk for roles that send callouts and on Faces otherwise", () => {
    expect(defaultPage("blind")).toBe("talk");
    expect(defaultPage("deaf")).toBe("talk");
    expect(defaultPage("mute")).toBe("faces");
  });

  it("has a default quick slot per role, and a pinned slot wins", () => {
    expect(quickSlot("blind", null)?.id).toBe("callout:here");
    expect(quickSlot("deaf", null)?.id).toBe("callout:go");
    expect(quickSlot("mute", null)?.id).toBe("face:f01");
    expect(quickSlot("deaf", "clip:airhorn")?.id).toBe("clip:airhorn");
  });

  it("ignores a pin that is not a slot, or that the role can't send", () => {
    expect(quickSlot("blind", "clip:airhorn")?.id).toBe("callout:here");
    expect(quickSlot("blind", "nonsense")?.id).toBe("callout:here");
  });
});

describe("verbs fit what the receiver does", () => {
  it("faces and marks are seen, callouts and clips heard, text read", () => {
    expect(verbFor("face")).toBe("sees this");
    expect(verbFor("face")).toBe("sees this");
    expect(verbFor("mark")).toBe("sees this");
    expect(verbFor("callout")).toBe("hears this");
    expect(verbFor("clip")).toBe("hears this");
    expect(verbFor("text")).toBe("reads this");
  });

  it("Can't speak hears everything that is sound: they can't talk, not hear", () => {
    for (const method of ["callout", "clip", "voice"] as const) {
      expect(verbFor(method), method).toBe("hears this");
    }
  });

  it("only text is read, by whoever receives it", () => {
    expect(verbFor("text")).toBe("reads this");
    expect(verbFor("text")).toBe("reads this");
  });
});

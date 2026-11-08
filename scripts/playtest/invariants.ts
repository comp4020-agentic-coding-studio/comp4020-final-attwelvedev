import type { Page } from "playwright";
import { CUE_HOLD_MS, cueCaptions } from "../../src/client/hud.ts";
import type { PlaytestFrame, PlaytestSample } from "../../src/client/playtest.ts";
import { decodeSeen, inSight } from "../../src/client/render/sight.ts";
import type { RoleView } from "../../src/game/perception.ts";
import type { Vec } from "../../src/game/types.ts";

// Frame invariants (FR4), checked on each tab every 250 ms. The checkers are pure and return
// partial findings; the sampler below feeds them from a live tab.
export interface Found {
  invariant: string;
  detail: string;
}

// a view is parsed, then drawn on the next animation frame: a caption is not due before this
const DRAW_GRACE_MS = 600;
const HALO_TILES = 2;
const TOLERANCE = 2; // per channel: anti-aliasing at a tile's centre is not a drawn thing

// Nothing unsent is drawn: a tile outside the line of sight, with nothing in the view on it, must
// look the same drawn as in a render without entities.
export function unsentDrawn(samples: readonly PlaytestSample[]): Found[] {
  const out: Found[] = [];
  for (const s of samples) {
    const worst = Math.max(...s.drawn.map((c, i) => Math.abs(c - (s.bare[i] ?? 0))));
    if (worst > TOLERANCE) {
      out.push({
        invariant: "frame:unsent-drawn",
        detail: `tile (${s.at.x}, ${s.at.y}) is drawn as [${s.drawn}] but a render of the sent scene gives [${s.bare}]`,
      });
    }
  }
  return out;
}

// Every sound in the views reached the speakers: each kind at least once among what played.
export function soundsPlayed(
  cuesHeard: readonly string[],
  viewsSince: readonly RoleView[],
): Found[] {
  const kinds = new Set(viewsSince.flatMap((v) => v.sounds.map((s) => s.kind)));
  return [...kinds]
    .filter((k) => !cuesHeard.includes(k))
    .map((k) => ({
      invariant: "frame:sound-not-played",
      detail: `the view had a "${k}" sound and none was played`,
    }));
}

// Every captioned cue from a view still within its hold is in the captions region.
export function captionsShown(
  captionTexts: readonly string[],
  viewsSince: readonly { at: number; view: RoleView }[],
  now: number,
  names?: readonly string[],
  capped = false, // the cue list is at its cap (the page keeps the newest few), so an old cue may be gone
): Found[] {
  if (capped) return [];
  const shown = captionTexts.join("\n");
  const out: Found[] = [];
  for (const { at, view } of viewsSince) {
    // too young: the page has not drawn it yet. Too old: its hold is ending on the page's clock
    if (now - at < DRAW_GRACE_MS || now - at >= CUE_HOLD_MS - DRAW_GRACE_MS) continue;
    for (const cue of cueCaptions(view.sounds, names)) {
      if (!shown.includes(cue.text)) {
        out.push({
          invariant: "frame:caption-missing",
          detail: `"${cue.text}" came ${now - at} ms ago and is not in the captions`,
        });
      }
    }
  }
  return out;
}

// What a door's chip must name, from how the door opens (src/client/labels.ts kindOf, three lines
// repeated here rather than exported; this test file pins the mapping).
const DOOR_KIND = (e: { secret?: boolean; opens?: string }): string =>
  e.secret
    ? "secretdoor"
    : e.opens === "stations"
      ? "stationdoor"
      : e.opens === "sequence"
        ? "sequencedoor"
        : "door";

// Every door chip on show points at a door at its tile that opens the way the chip says.
export function doorChips(frame: PlaytestFrame, view: RoleView): Found[] {
  const out: Found[] = [];
  for (const label of frame.labels) {
    if (label.kind !== "door" && label.kind !== "stationdoor" && label.kind !== "sequencedoor")
      continue;
    const near = view.entities.filter(
      (e) =>
        e.kind === "door" &&
        Math.floor(e.pos.x) === Math.floor(label.at.x) &&
        Math.floor(e.pos.y) === Math.floor(label.at.y),
    );
    // a chip points at the middle of a door's tiles, which may be a tile or two off a single one
    const doors = near.length > 0 ? near : view.entities.filter((e) => e.kind === "door");
    const nearest = doors.sort(
      (a, b) =>
        Math.hypot(a.pos.x - label.at.x, a.pos.y - label.at.y) -
        Math.hypot(b.pos.x - label.at.x, b.pos.y - label.at.y),
    )[0];
    if (!nearest || Math.hypot(nearest.pos.x - label.at.x, nearest.pos.y - label.at.y) > 3) {
      out.push({
        invariant: "frame:door-chip",
        detail: `a "${label.kind}" chip at (${label.at.x}, ${label.at.y}) has no door under it`,
      });
    } else if (DOOR_KIND(nearest) !== label.kind) {
      out.push({
        invariant: "frame:door-chip",
        detail: `the chip says ${label.kind} ("${label.text}") but the door opens as ${DOOR_KIND(nearest)}`,
      });
    }
  }
  return out;
}

// Up to `n` tiles that are floor in the view, outside the line of sight, and hold no entity: the
// places where the sent scene shows nothing but floor.
export function unseenFloor(view: RoleView, tiles: readonly string[] | null, n = 12): Vec[] {
  if (!tiles || !view.seen) return [];
  const seen = decodeSeen(view.seen);
  // An entity that was sent may light or tint the floor around it (an exit's glow, a lamp's pool),
  // so a tile within HALO_TILES of one is not a tile where "nothing was sent".
  const near = (x: number, y: number) =>
    view.entities.some(
      (e) =>
        e.kind !== "wire" &&
        Math.abs(Math.floor(e.pos.x) - x) <= HALO_TILES &&
        Math.abs(Math.floor(e.pos.y) - y) <= HALO_TILES,
    );
  const found: Vec[] = [];
  for (const [y, row] of tiles.entries()) {
    for (const [x, ch] of [...row].entries()) {
      if (ch !== "." || inSight(seen, { x, y }) || near(x, y)) continue;
      found.push({ x, y });
    }
  }
  // spread over the room, not the first n in reading order
  const step = Math.max(1, Math.floor(found.length / n));
  return found.filter((_, i) => i % step === 0).slice(0, n);
}

// One look at a tab: what the sampler reads from the page and the wire, then the checks. `sound` is
// false when the tab's sound is off (nothing plays, so `soundsPlayed` is not asked).
export interface TabMemory {
  heard: { kind: string; at: number }[]; // cues read from the page, with when they were read
  judgedUntil: number; // views at or before this time (Date.now()) have been judged for sound
}

export async function sampleTab(
  page: Page,
  memory: TabMemory,
  views: { at: number; view: RoleView }[],
  latest: RoleView | null,
  tiles: readonly string[] | null,
  options: { role: string; sound: boolean },
): Promise<Found[]> {
  if (!latest) return [];
  const out: Found[] = [];
  const read = await page.evaluate(
    async (tiles) => {
      const w = window as unknown as {
        __playtest?: { frame(): unknown; sample(t: unknown[]): Promise<unknown[]> };
        __cuesPlayed?: string[];
      };
      if (!w.__playtest) return null;
      const samples = tiles.length > 0 ? await w.__playtest.sample(tiles) : [];
      const played = (w.__cuesPlayed ?? []).splice(0);
      const capped = document.querySelectorAll('[role="log"] .cue-item').length >= 4;
      const captions = [...document.querySelectorAll('[role="log"][aria-label="Captions"] p')].map(
        (p) => p.textContent ?? "",
      );
      return { frame: w.__playtest.frame(), samples, played, captions, capped };
    },
    options.role === "blind" ? [] : unseenFloor(latest, tiles),
  );
  if (!read) return [{ invariant: "frame:no-hook", detail: "window.__playtest is missing" }];
  if (options.role !== "blind") out.push(...unsentDrawn(read.samples as PlaytestSample[]));
  if (read.frame) out.push(...doorChips(read.frame as PlaytestFrame, latest));
  if (options.role !== "deaf") {
    out.push(...captionsShown(read.captions, views, Date.now(), undefined, read.capped));
    if (options.sound) {
      // the page plays a cue a frame after the view arrives: judge the views old enough to have
      // played, against this sample's cues and the last one's
      const edge = Date.now() - DRAW_GRACE_MS;
      const old = views.filter((v) => v.at <= edge && v.at > memory.judgedUntil).map((v) => v.view);
      memory.judgedUntil = edge;
      const oldest = Math.min(...views.map((v) => v.at));
      for (const kind of read.played) memory.heard.push({ kind, at: Date.now() });
      memory.heard = memory.heard.filter((h) => h.at >= Date.now() - 10_000);
      out.push(
        ...soundsPlayed(
          memory.heard.filter((h) => h.at >= oldest).map((h) => h.kind),
          old,
        ),
      );
    }
  }
  return out;
}

import { useEffect, useRef, useState } from "preact/hooks";
import roomText from "../../rooms/01-loading-dock.room?raw";
import { faceImage } from "../client/faces.ts";
import { detectFx, FX_MAX, FX_MS, type Fx } from "../client/fx.ts";
import { captionFor, cueCaptions, type HeldCues, hearCues, heardCues } from "../client/hud.ts";
import { draw, type FacePop, type Scene } from "../client/render.ts";
import { MAP } from "../client/tokens.ts";
import { type AttractTick, createAttract } from "../game/bots/attract.ts";
import { FACE_POP_MS } from "../game/channels.ts";
import { parseRoom } from "../game/rooms/format.ts";
import { TICK_MS } from "../game/sim/world.ts";
import { ROLE_LABEL, type Role, type Seat, type Vec } from "../game/types.ts";
import { RoleShape } from "./RoleShape.tsx";

// The home page's hero: three bots playing room 1, shown as three feeds of the
// same moment, one per seat, each drawn from exactly what that role is sent.
// Seat order is the headline's order, so each line of it labels its feed.
export const FEED_ROLES: readonly [Role, Role, Role] = ["blind", "deaf", "mute"];
const CLEARED_HOLD_MS = 2500; // the cleared room stays up this long before the run restarts
const STILL_TICK = 280; // with reduced motion, the frame shown: the team at the three plates
const LINE_MS = 2600; // how long a spoken line stays on a feed
const MAX_LINES = 2;

interface Line {
  id: number;
  text: string;
  role?: Role; // a spoken line carries its sender's shape; a room sound has none
  until: number;
}

interface Run {
  attract: ReturnType<typeof createAttract>;
  tiles: string[]; // the map, as the first tick sent it to the sighted
  prev: AttractTick | null;
  last: AttractTick;
  at: number; // the run's clock (ms, stopped while paused) at `last`
  clearedAt: number | null;
  fx: { fx: Fx; at: number }[][]; // per seat
  pops: { seat: Seat; id: string; at: number }[][];
  cues: HeldCues[];
  lines: Line[][];
}

const room = parseRoom(roomText);
let lineId = 0;

let runs = 0; // each loop is a new seed, so no two heists play the same

function fresh(now: number): Run {
  const attract = createAttract(room, FEED_ROLES, ++runs);
  const last = attract.next();
  return {
    attract,
    tiles: last.views[1].tiles ?? room.grid,
    prev: null,
    last,
    at: now,
    clearedAt: null,
    fx: [[], [], []],
    pops: [[], [], []],
    cues: [new Map(), new Map(), new Map()],
    lines: [[], [], []],
  };
}

// One tick of the run: what each seat now sees, hears and is told.
function advance(run: Run, now: number) {
  const tick = run.attract.next();
  for (const seat of [0, 1, 2] as const) {
    const view = tick.views[seat];
    run.fx[seat] = [
      ...run.fx[seat].filter((f) => now - f.at < FX_MS),
      ...detectFx(run.last.views[seat].entities, view.entities).map((fx) => ({ fx, at: now })),
    ].slice(-FX_MAX);
    hearCues(run.cues[seat] as HeldCues, cueCaptions(view.sounds), now);
  }
  for (const { message, receivers } of tick.heard) {
    for (const seat of receivers) {
      if (message.method === "face") {
        run.pops[seat]?.push({ seat: message.from.seat, id: message.id, at: now });
        continue;
      }
      const caption = captionFor(message);
      if (caption)
        run.lines[seat]?.push({
          id: ++lineId,
          text: `${caption.name}: ${caption.text}`,
          role: caption.role,
          until: now + LINE_MS,
        });
    }
  }
  run.prev = run.last;
  run.last = tick;
  run.at = now;
  if (tick.cleared && run.clearedAt === null) run.clearedAt = now;
}

// Where an entity is drawn between the last two views, so 20 Hz moves smoothly.
function between(run: Run, seat: Seat, t: number) {
  const now = run.last.views[seat].entities;
  if (!run.prev || t >= 1) return now;
  const before = new Map(run.prev.views[seat].entities.map((e) => [e.id, e.pos]));
  return now.map((e) => {
    const from = before.get(e.id);
    if (!from || (e.kind !== "player" && e.kind !== "crate" && e.kind !== "guard")) return e;
    const pos: Vec = { x: from.x + (e.pos.x - from.x) * t, y: from.y + (e.pos.y - from.y) * t };
    return { ...e, pos };
  });
}

function paint(canvas: HTMLCanvasElement, run: Run, seat: Seat, now: number, calm: boolean) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const rows = room.height;
  const cols = room.width;
  // the whole room when it fits, else a window that follows the team, zoomed out
  const fits = (w / cols) * rows <= h + 1;
  const zoom = fits ? 1 : h / (rows * MAP.phoneTilePx);
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0);
  // the cleared room holds its last frame: nothing left to move between
  const t = run.clearedAt !== null ? 1 : Math.min(1, (now - run.at) / TICK_MS);
  const entities = between(run, seat, t);
  const self = entities.find((e) => e.kind === "player" && e.seat === seat)?.pos ?? null;
  const scene: Scene = {
    w: w / zoom,
    h: h / zoom,
    role: FEED_ROLES[seat],
    seat,
    roles: [...FEED_ROLES] as [Role, Role, Role],
    tiles: FEED_ROLES[seat] === "blind" ? null : run.tiles,
    entities,
    self: FEED_ROLES[seat] === "blind" ? null : self,
    layout: fits ? "fit" : "follow",
    fx: run.fx[seat]
      ?.filter((f) => now - f.at < FX_MS)
      .map((f) => ({ ...f.fx, age: (now - f.at) / FX_MS })),
    pops: run.pops[seat]?.flatMap((p): FacePop[] => {
      const img = faceImage(p.id);
      const age = now - p.at;
      return img && age < FACE_POP_MS ? [{ seat: p.seat, img, fade: 1 - age / FACE_POP_MS }] : [];
    }),
    reducedMotion: calm,
  };
  draw(ctx, scene);
}

// What a feed's caption strip shows now: the room's sounds and the newest lines said.
function captionsOf(run: Run, seat: Seat, now: number): Line[] {
  const lines = (run.lines[seat] ?? []).filter((l) => l.until > now).slice(-MAX_LINES);
  run.lines[seat] = lines;
  const cues = heardCues(run.cues[seat] as HeldCues, now)
    .slice(-1)
    .map((c, i) => ({ id: -1 - i, text: c.text, until: now }));
  return [...cues, ...lines];
}

export function Feeds() {
  const canvases = useRef<(HTMLCanvasElement | null)[]>([null, null, null]);
  const box = useRef<HTMLDivElement>(null);
  // with reduced motion the feeds open on one still frame, and play only when asked
  // (null until the browser has said: the server renders the feeds playing)
  const [calm, setCalm] = useState<boolean | null>(null);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setCalm(reduce);
    if (reduce) setPlaying(false);
  }, []);
  const [captions, setCaptions] = useState<Line[][]>([[], [], []]);
  const shown = useRef("");

  // One run for the life of the page, on its own clock: pausing stops the clock,
  // so the frame, its captions and its effects all hold exactly where they were.
  const clock = useRef({ ms: 0, wall: 0 });
  const run = useRef<Run | null>(null);

  useEffect(() => {
    if (calm === null) return;
    if (!run.current) {
      run.current = fresh(0);
      if (calm) while (run.current.attract.world.tick < STILL_TICK) advance(run.current, 0);
    }
    const r = run.current;
    let frame = 0;
    let onScreen = true;
    clock.current.wall = performance.now();
    const render = (wall: number) => {
      // the clock only runs while the feeds play and can be seen; a long stall (a
      // background tab) is not replayed
      const dt = Math.min(wall - clock.current.wall, TICK_MS * 4);
      clock.current.wall = wall;
      if (playing && onScreen && !document.hidden) clock.current.ms += dt;
      const now = clock.current.ms;
      if (r.clearedAt !== null && now - r.clearedAt > CLEARED_HOLD_MS) Object.assign(r, fresh(now));
      while (r.clearedAt === null && now - r.at >= TICK_MS) advance(r, r.at + TICK_MS);
      for (const seat of [0, 1, 2] as const) {
        const canvas = canvases.current[seat];
        if (canvas) paint(canvas, r, seat, now, calm === true);
      }
      const next = [0, 1, 2].map((s) => captionsOf(r, s as Seat, now));
      const key = next.map((ls) => ls.map((l) => l.id).join(",")).join("|");
      if (key !== shown.current) {
        shown.current = key;
        setCaptions(next);
      }
      if (playing) frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    const seen = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
    });
    if (box.current) seen.observe(box.current);
    const resized = new ResizeObserver(() => {
      if (!playing) requestAnimationFrame(render);
    });
    if (box.current) resized.observe(box.current);
    return () => {
      cancelAnimationFrame(frame);
      seen.disconnect();
      resized.disconnect();
    };
  }, [playing, calm]);

  return (
    <div class="feeds" ref={box}>
      {FEED_ROLES.map((role, seat) => (
        <figure class={`feed feed-${role}`} key={role}>
          <div class="feed-screen">
            <canvas
              ref={(el) => {
                canvases.current[seat] = el;
              }}
              role="img"
              aria-label={FEED_LABEL[role]}
            />
            {role === "deaf" ? (
              <p class="feed-tag" aria-hidden="true">
                Silent
              </p>
            ) : (
              <div class="feed-captions" aria-hidden="true">
                {captions[seat]?.map((l) => (
                  <p key={l.id} class={l.role ? "said" : "cue"}>
                    {l.role && <RoleShape role={l.role} size={12} />}
                    {l.text}
                  </p>
                ))}
              </div>
            )}
          </div>
          <figcaption>
            <RoleShape role={role} size={14} />
            <b>{ROLE_LABEL[role]}</b> {SEES[role]}
          </figcaption>
        </figure>
      ))}
      <div class="feeds-foot">
        <p>
          Three bots playing room 1 right now. Each feed is what one seat is sent, at the same
          moment.
        </p>
        <button type="button" class="btn feeds-toggle" onClick={() => setPlaying((p) => !p)}>
          {playing ? "Pause feeds" : "Play feeds"}
        </button>
      </div>
    </div>
  );
}

// What a screen reader hears for each feed's picture.
const FEED_LABEL: Record<Role, string> = {
  blind: "Can't see's screen: black, with a faint ring.",
  deaf: "Can't hear's screen: the map of room 1, the team moving through it.",
  mute: "Can't speak's screen: the same map of room 1.",
};

// What reaches each seat, in the words of the channel rules (src/game/types.ts).
const SEES: Record<Role, string> = {
  blind: "hears the room and the voices",
  deaf: "sees the map, hears nothing",
  mute: "sees and hears, sends sounds and stamps",
};

// The playtest page hook (ADR 0027): installed only when the server's welcome says it runs with
// PLAYTEST_AUTOPILOT=1, so the deployed app never has it. The regression run (`pnpm playtest`)
// reads what each frame drew through `window.__playtest`, and which cues really played through
// `window.__cuesPlayed` (pushed by audio.ts).
import type { Role, Seat, Vec } from "../game/types.ts";
import type { Label } from "./labels.ts";
import { type Box, type Camera, draw, type Scene, toScreen } from "./render/index.ts";
import type { GameSocket } from "./socket.ts";

export type Rgba = [number, number, number, number];
export interface PlaytestFrame {
  seat: Seat;
  role: Role;
  cam: Camera; // the eased camera of the last frame drawn
  labels: Label[]; // the label chips on show, with the tile each points at
  boxes: Box[]; // chips, plaques and avoid boxes as drawn (canvas CSS px)
}
export interface PlaytestSample {
  at: Vec; // the tile asked about
  drawn: Rgba; // the canvas pixel at the tile's projected centre
  bare: Rgba; // the same pixel in the same scene drawn with entities and floorEntities removed
}
export interface PlaytestHook {
  frame(): PlaytestFrame | null;
  sample(tiles: Vec[]): Promise<PlaytestSample[]>; // fulfilled after the next draw, from that frame
  autopilot(on: boolean): void; // sends { t: "autopilot", on } on the page's own socket
}

interface Pending {
  tiles: Vec[];
  resolve: (samples: PlaytestSample[]) => void;
}
interface State {
  last: PlaytestFrame | null;
  pending: Pending[];
}
type PlaytestWindow = { __playtest?: PlaytestHook; __cuesPlayed?: string[] };

let state: State | null = null;

export function installPlaytest(socket: GameSocket): void {
  const s: State = { last: null, pending: [] };
  state = s;
  const w = window as PlaytestWindow;
  w.__cuesPlayed = [];
  w.__playtest = {
    frame: () => s.last,
    sample: (tiles) => new Promise((resolve) => s.pending.push({ tiles, resolve })),
    autopilot: (on) => socket.send({ t: "autopilot", on }),
  };
}

const pixel = (ctx: CanvasRenderingContext2D, x: number, y: number): Rgba => {
  const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
  return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, d[3] ?? 0];
};

// The scene as sent, less what stands on it: no entities, effects, pops or chip report. A closed door
// stays: the light the renderer cuts the mist by is stopped by closed doors, so without it the bare
// scene would be lit through a door the real one is not (a door's own tile is never sampled).
export function bareScene(scene: Scene): Scene {
  return {
    ...scene,
    entities: scene.entities.filter((e) => e.kind === "door" && e.state === "closed"),
    floorEntities: [],
    fx: [],
    pops: [],
    report: undefined,
  };
}

// Called by the game right after each draw: a no-op unless the hook is installed. Answers any
// pending samples from this very frame, so the drawn and bare pixels are of one animation frame.
export function playtestFrame(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  labels: readonly Label[] = [],
): void {
  if (!state || !scene.cam) return;
  const cam = scene.cam;
  state.last = {
    seat: scene.seat,
    role: scene.role,
    cam,
    labels: [...labels],
    boxes: [
      ...(scene.report?.chips ?? []),
      ...(scene.report?.plaques ?? []),
      ...(scene.avoid ?? []),
    ],
  };
  if (state.pending.length === 0) return;
  const asked = state.pending.splice(0);
  const dpr = ctx.canvas.width / Math.max(1, scene.w);
  const bare = document.createElement("canvas");
  bare.width = ctx.canvas.width;
  bare.height = ctx.canvas.height;
  const bctx = bare.getContext("2d");
  if (bctx) {
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(bctx, bareScene(scene));
  }
  for (const { tiles, resolve } of asked) {
    resolve(
      tiles.map((at) => {
        const p = toScreen(cam, at.x + 0.5, at.y + 0.5);
        return {
          at,
          drawn: pixel(ctx, p.x * dpr, p.y * dpr),
          bare: bctx ? pixel(bctx, p.x * dpr, p.y * dpr) : [0, 0, 0, 0],
        };
      }),
    );
  }
}

// For tests: forget the hook.
export function uninstallPlaytest(): void {
  state = null;
  const w = window as PlaytestWindow;
  delete w.__playtest;
  delete w.__cuesPlayed;
}

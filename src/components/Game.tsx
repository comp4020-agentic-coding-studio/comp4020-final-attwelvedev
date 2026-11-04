import { useEffect, useRef, useState } from "preact/hooks";
import { createAudio, type GameAudio } from "../client/audio.ts";
import { creditRows } from "../client/credits.ts";
import { faceImage, preloadFaces } from "../client/faces.ts";
import { detectFx, FX_MAX, type Fx, fxMs, fxOfCacheEvent } from "../client/fx.ts";
import {
  CALLOUT_WORD,
  type CueCaption,
  cacheMoment,
  captionFor,
  caughtText,
  crewChangeText,
  cueCaptions,
  cueKey,
  formatTime,
  type HeldCues,
  hearCues,
  heardCues,
  lerpEntities,
} from "../client/hud.ts";
import { createInput, inputKey } from "../client/input.ts";
import { ESCAPE_KINDS, LABEL_CAP, type Label, labelsFor } from "../client/labels.ts";
import { createPredictor, type Predictor } from "../client/predict.ts";
import { inSight, seenOf } from "../client/render/sight.ts";
import {
  type Camera,
  camera,
  draw,
  easeCamera,
  type FacePop,
  fromScreen,
  type Motion,
  type Scene,
} from "../client/render.ts";
import { afterRestart } from "../client/restart.ts";
import { loadSettings, type Settings as SettingsState, saveSettings } from "../client/settings.ts";
import type { ConnectionState, GameSocket } from "../client/socket.ts";
import { browserSpeech } from "../client/speech.ts";
import { NET, setContrast } from "../client/tokens.ts";
import { quickSlot } from "../client/wheel.ts";
import { FACE_POP_MS, type Stamp } from "../game/channels.ts";
import { botRef } from "../game/crew.ts";
import type { BriefingCue } from "../game/cues.ts";
import type { ItemId } from "../game/rooms/format.ts";
import type { GearItem } from "../game/sim/world.ts";
import { ROLE_LABEL, type Role, type Seat, type Vec } from "../game/types.ts";
import type {
  CrewMember,
  LobbyState,
  RealLife,
  RoleView,
  RoomBoard as RoomBoardData,
} from "../net/protocol.ts";
import { ActHint } from "./ActHint.tsx";
import { type CaptionLine, Captions } from "./Captions.tsx";
import { type CommsApi, CommsWheel } from "./CommsWheel.tsx";
import { Connection } from "./Connection.tsx";
import { Disconnect } from "./Disconnect.tsx";
import { GEAR_NAME, GearGlyph } from "./GearGlyph.tsx";
import { GearSlot } from "./GearSlot.tsx";
import { HeistComplete } from "./HeistComplete.tsx";
import { HudMenu } from "./HudMenu.tsx";
import { LampLight } from "./LampLight.tsx";
import { LeaderboardPanel } from "./LeaderboardPanel.tsx";
import { RoleReveal } from "./RoleReveal.tsx";
import { RoleShape } from "./RoleShape.tsx";
import { RoomCleared } from "./RoomCleared.tsx";
import { Settings } from "./Settings.tsx";
import { SideJob } from "./SideJob.tsx";
import type { TileCache } from "./SideJobTile.tsx";
import { TalkBar } from "./TalkBar.tsx";
import { TouchControls } from "./TouchControls.tsx";
import { useGone } from "./useGone.ts";
import { useHostNote } from "./useHostNote.ts";
import { usePause } from "./usePause.ts";
import { useVoice } from "./useVoice.ts";
import { type OpenVote, outcomeText, VotePrompt } from "./VotePrompt.tsx";

// What the reveal tells the owner of a cache: the riddle and what it hides, never its state.
export type RevealCache = Pick<NonNullable<RoleView["cache"]>, "motif" | "riddle" | "item">;

export interface Reveal {
  room: string;
  name: string; // the room's title, from its file
  index: number;
  role: Role;
  crew: CrewMember[];
  rooms: number; // how many rooms the heist has
  sittingOut: string[]; // nicknames of the people not playing this room
  played: Record<string, Role[]>; // by nickname: roles played so far
  real: RealLife; // what your setup means for you in this room
  cues: BriefingCue[]; // Can't see only: the sounds to learn
  cache?: RevealCache; // your own seat's cache, if the room has one for you
  from?: Role; // your role in the room before, so the shape can morph into the new one
}

// What the frame loop and the input loop share. Plain mutable state in a ref:
// it changes 20 times a second and must not re-render the page each time.
interface Runtime {
  view: RoleView | null;
  prevEntities: RoleView["entities"];
  prevSeen: { has(x: number, y: number): boolean } | null; // the tiles in sight the view before
  at: number; // when `view` arrived
  tiles: string[] | null;
  predictor: Predictor | null;
  self: Vec | null; // where we think we are
  shown: Vec | null; // where we draw ourselves (self, eased)
  facing: Vec; // the way we last pushed: our own figure turns the moment the key goes down
  walking: { moving: boolean; blocked: boolean }; // what the last input did to the predicted position
  // faces and marks on show, by when they landed; `from` and `name` are what an edge pill needs
  // when the sender is out of sight and so not among the entities
  pops: { seat: number; id: string; at: number; from?: Vec; name?: string; mark?: Stamp }[];
  cueHold: HeldCues; // cue captions and when to let each go
  moment: { text: string; until: number } | null; // a cache opening or its stash found, on a chip for CACHE_MOMENT_MS
  fx: { fx: Fx; at: number }[]; // small effects for what just changed, by when they started
  soundOn: boolean;
  // The world rising out of the reveal (FR25): when it began, and whether it is the 300 ms
  // cross-fade of reduced motion. Null until the game starts; a page that loads mid-game never rises.
  rise: { at: number; reduced: boolean } | null;
  cam: { scale: number; ox: number; oy: number } | null; // the last frame's map camera, to turn a tap into a tile
  lampTick: number; // the tick of the last lamp flash shown, and until when it shows, from whom
  lampUntil: number;
  lampFrom: Role | null;
  labelsOn: boolean; // the Labels setting
  labelsAll: boolean; // room one labels everything; later rooms only the escape-room objects
  labels: Label[]; // the chips on show this frame: one per kind in sight
  metKinds: Set<string>; // kinds whose chip was shown in an EARLIER room: a kind not here is new, and leads
  roomKinds: Set<string>; // kinds shown in this room; they join metKinds when the next room starts
  labelRoom: number; // the room index metKinds is current for
}

const RISE_MS = 900; // the world rises out of the reveal
const FADE_MS = 300; // reduced motion: a cross-fade instead
const CAPTION_MS = 5000;
const seatNames = (crew: readonly { seat: number; nickname: string }[]): string[] =>
  [0, 1, 2].map((i) => crew.find((c) => c.seat === i)?.nickname ?? "");
const CACHE_MOMENT_MS = 4000; // the top-centre chip for a cache opening or its stash
const PILL_MS = 4000; // an edge pill outlasts the face on it (FACE_POP_MS) by a few seconds
const LAMP_MS = 1000; // the lamp's light shows this long in a sighted HUD (spec §4.1)
const fadeOut = (leftMs: number) => Math.min(1, leftMs / 300);
const SPAWN_FACING: Vec = { x: 1, y: 0 }; // everyone starts a room facing east (src/game/sim/world.ts)
// How long the drawn position takes to close most of a gap to the predicted one (an exponential
// ease, so it is the same at 60 and 144 Hz). Over a jittery link the server and the client
// disagree by a step or so now and then; this spreads that correction over a few frames instead
// of a visible snap, at the cost of the figure trailing its prediction by a fraction of a tile.
const EASE_TAU_MS = 60;
const SNAP_TILES = 1.5;

// Draw every frame; the canvas is sized to its frame in device pixels. Shared by the reveal (the
// room behind the card) and the game, so both read the same runtime.
function useDraw(
  rt: Runtime,
  canvas: { current: HTMLCanvasElement | null },
  frame: { current: HTMLDivElement | null },
  role: Role,
  crew: CrewMember[],
  flat = false, // the reveal's backdrop: the whole room, flat, under the card
) {
  useEffect(() => {
    const el = canvas.current;
    const box = frame.current;
    const ctx = el?.getContext("2d");
    if (!el || !box || !ctx) return;
    let size = { w: 0, h: 0 };
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      size = { w: box.clientWidth, h: box.clientHeight };
      el.width = Math.round(size.w * dpr);
      el.height = Math.round(size.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(box);
    let raf = 0;
    let eased: Camera | null = null;
    let lastFrame = performance.now();
    const frameLoop = () => {
      raf = requestAnimationFrame(frameLoop);
      const view = rt.view;
      if (!view || !el.isConnected) return; // the reveal's backdrop goes when the game starts
      const now = performance.now();
      if (rt.self && rt.shown) {
        const gap = Math.hypot(rt.self.x - rt.shown.x, rt.self.y - rt.shown.y);
        const ease = 1 - Math.exp(-Math.min(now - lastFrame, 100) / EASE_TAU_MS);
        rt.shown =
          gap > SNAP_TILES
            ? rt.self
            : {
                x: rt.shown.x + (rt.self.x - rt.shown.x) * ease,
                y: rt.shown.y + (rt.self.y - rt.shown.y) * ease,
              };
      }
      const t = (now - rt.at) / NET.interpolateMs;
      const pops: FacePop[] = [];
      for (const p of rt.pops) {
        const seat = p.seat as 0 | 1 | 2;
        const age = now - p.at;
        const pill = { from: p.from, name: p.name };
        if (p.mark) {
          // a mark has no face: its pill (if the mark is off screen) lasts the pill's time
          if (age < PILL_MS)
            pops.push({ seat, ...pill, mark: p.mark, fade: fadeOut(PILL_MS - age) });
          continue;
        }
        const img = faceImage(p.id);
        if (img && age < FACE_POP_MS) {
          pops.push({ seat, img, ...pill, fade: fadeOut(FACE_POP_MS - age) });
        } else if (p.from && age < PILL_MS) {
          pops.push({ seat, ...pill, alone: true, fade: fadeOut(PILL_MS - age) }); // the pill outlasts the face
        }
      }
      let labels: Scene["labels"];
      if (!flat && rt.labelsOn && role !== "blind" && rt.tiles && rt.self) {
        const seenNow = view.seen ? seenOf(view.seen) : null;
        rt.labels = labelsFor(
          view.entities,
          rt.tiles,
          rt.self,
          true,
          (at) => inSight(seenNow, at),
          rt.labelsAll ? undefined : ESCAPE_KINDS,
          size.w >= 720 ? LABEL_CAP.desktop : LABEL_CAP.phone,
          rt.metKinds,
        );
        for (const l of rt.labels) rt.roomKinds.add(l.kind);
        labels = rt.labels;
      }
      // the side-job chip is DOM over the canvas: a label chip must not sit half under it, so its box
      // (relative to the frame, in canvas px) is handed to the draw. Read only when there are labels.
      let avoid: Scene["avoid"];
      const chip = labels && labels.length > 0 ? box.querySelector(".side-job") : null;
      if (chip) {
        const c = chip.getBoundingClientRect();
        const f = box.getBoundingClientRect();
        avoid = [{ x: c.left - f.left, y: c.top - f.top, w: c.width, h: c.height }];
      }
      const scene: Scene = {
        ...size,
        labels,
        ...(avoid ? { avoid } : {}),
        report: { chips: [], plaques: [] },
        role,
        seat: view.you.seat,
        roles: crew.map((c) => c.role) as Scene["roles"],
        tiles: role === "blind" ? null : rt.tiles,
        seen: role === "blind" ? undefined : view.seen, // the tiles in line of sight: the rest is mist
        entities: lerpEntities(rt.prevEntities, view.entities, t),
        self: rt.shown,
        // Can't see is told whether they are walking or pushing (they hear it already); a sighted
        // role reads it off its own predicted position, which is ahead of the server
        own: ownMotion(rt, role),
        bots: crew.map((c) => !!c.bot) as Scene["bots"],
        layout: "follow", // the game camera on every screen; the rise eases it in from the whole room
        rise: flat ? 0 : riseNow(rt, now),
        pops,
        fx: rt.fx
          .filter((f) => now - f.at < fxMs(f.fx))
          .map((f) => ({ ...f.fx, age: (now - f.at) / fxMs(f.fx) })),
        alarm: view.alarm,
        nowMs: now,
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      };
      // the camera is eased frame to frame so it never snaps; the home feeds and the reveal's flat
      // backdrop ask for the whole room, which does not move, so easing leaves them alone
      const target = camera(scene);
      const cam = easeCamera(eased, target, now - lastFrame, scene);
      eased = cam;
      lastFrame = now;
      scene.cam = cam;
      if (!flat) {
        rt.cam = cam; // the reveal's backdrop is not what a tap is turned into a tile by
        // Where tile (0, 0) is, for the specs that read a pixel of a tile: the picture alone does not
        // say where a tile is, and the camera is eased, so it is not worked out from the room.
        const at = `${cam.scale.toFixed(3)},${cam.ox.toFixed(3)},${cam.oy.toFixed(3)}`;
        if (el.dataset.camera !== at) el.dataset.camera = at;
        // and whether the alarm is on: it is only ever drawn, so the picture cannot be asked
        const alarm = view.alarm ? "on" : "off";
        if (el.dataset.alarm !== alarm) el.dataset.alarm = alarm;
        // and which first-room labels are on show, which are only ever drawn
        const shownLabels = rt.labelsOn ? rt.labels.map((l) => l.kind).join(" ") : "";
        if ((el.dataset.labels ?? "") !== shownLabels) el.dataset.labels = shownLabels;
        // and where you are drawn, which is the point the light is cast from
        if (scene.self) {
          const me = `${scene.self.x.toFixed(3)},${scene.self.y.toFixed(3)}`;
          if (el.dataset.self !== me) el.dataset.self = me;
        }
      }
      draw(ctx, scene);
      if (!flat && scene.report) {
        // the chips and plaques as drawn, for the layout specs (a chip must never sit on a plaque)
        const boxes = JSON.stringify(scene.report, (_k, v) =>
          typeof v === "number" ? Math.round(v) : v,
        );
        if (el.dataset.labelBoxes !== boxes) el.dataset.labelBoxes = boxes;
      }
    };
    raf = requestAnimationFrame(frameLoop);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [rt, role, crew, canvas, frame, flat]);
}

// How hard a held direction has to push to count as moving: under this share of the step, it is
// blocked (the server's rule is the same shape: "almost nowhere").
const BLOCKED_SHARE = 0.2;
const STEP_TILES = 4 / NET.inputHz; // SPEED_TPS in predict.ts, per input

// How far the world has risen, 0 to 1, eased out. Reduced motion has no rise frames: the world is
// whole at once and the reveal over it cross-fades. Absent (a page loaded mid-game) is whole.
function riseNow(rt: Runtime, now: number): number {
  const r = rt.rise;
  if (!r || r.reduced) return 1;
  const t = Math.max(0, Math.min(1, (now - r.at) / RISE_MS));
  return 1 - (1 - t) ** 3;
}

function ownMotion(rt: Runtime, role: Role): Motion {
  const motion = role === "blind" ? rt.view?.you.motion : rt.walking;
  return { facing: rt.facing, moving: motion?.moving ?? false, blocked: motion?.blocked ?? false };
}

function onView(rt: Runtime, view: RoleView, audio: GameAudio, names: readonly string[]): void {
  // the tick going backwards means the room was restarted: forget what we predicted
  if (rt.view && view.tick < rt.view.tick) {
    rt.predictor = null;
    rt.self = null;
    rt.shown = null;
    rt.facing = SPAWN_FACING;
    rt.walking = { moving: false, blocked: false };
  }
  rt.prevEntities = rt.view?.entities ?? [];
  rt.prevSeen = rt.view?.seen ? seenOf(rt.view.seen) : null;
  rt.view = view;
  const started = performance.now();
  hearCues(rt.cueHold, cueCaptions(view.sounds, names), started); // every view, so a one-tick sound is not missed
  // the tiles in sight the view before: a door out of sight reads closed, so one that opens into view
  // is told from one that opened in view by whether its tile was seen then
  const fresh = detectFx(rt.prevEntities, view.entities, rt.prevSeen);
  // a secret door opening or the keepsake taken: the one team-wide signal (see fxOfCacheEvent)
  const moment = cacheMoment(view.cacheEvent, names);
  if (view.cacheEvent) fresh.push(...fxOfCacheEvent(view.cacheEvent));
  if (moment) rt.moment = { text: moment, until: started + CACHE_MOMENT_MS };
  rt.fx = [
    ...rt.fx.filter((f) => started - f.at < fxMs(f.fx)),
    ...fresh.map((fx) => ({ fx, at: started })),
  ].slice(-FX_MAX);
  rt.at = performance.now();
  if (view.tiles) {
    rt.tiles = view.tiles;
    rt.predictor?.setTiles(view.tiles); // the map is re-sent when a secret door opens: walk the new one
  }
  const pos = view.you.pos;
  if (pos && rt.tiles) {
    rt.predictor ??= createPredictor(pos, rt.tiles);
    rt.predictor.observe(view.entities);
    rt.self = rt.predictor.reconcile(pos, view.ack);
    rt.shown ??= rt.self;
  }
  if (rt.soundOn) audio.play(view.sounds);
}

export function Game({
  socket,
  state,
  rttMs,
  online,
  reveal,
  host,
  hostName,
  seats,
  sitting,
  people,
  watching,
  early,
  onLeave,
}: {
  socket: GameSocket;
  state: ConnectionState;
  rttMs: number | null;
  online: boolean;
  early: { view: RoleView | null; ready: Seat[] }; // what the server sent between the reveal and this page drawing
  reveal: Reveal;
  host: boolean;
  hostName: string | null;
  seats: LobbyState["seats"] | null;
  sitting: { index: number; nickname: string }[]; // people sitting out, whom the host may pull in
  people: string[]; // nicknames by person index, so a swap named in the reveal is sent by index
  watching: string[]; // spectators' nicknames, listed in the crew column
  onLeave: () => void; // the menu's Leave: the lobby asks first, then leaves
}) {
  const rt = useRef<Runtime>({
    view: null,
    prevEntities: [],
    prevSeen: null,
    at: 0,
    tiles: null,
    predictor: null,
    self: null,
    shown: null,
    facing: SPAWN_FACING,
    walking: { moving: false, blocked: false },
    pops: [],
    fx: [],
    cueHold: new Map(),
    moment: null,
    soundOn: true,
    rise: null,
    cam: null,
    labelsOn: false,
    labelsAll: false,
    lampTick: -1,
    lampUntil: 0,
    lampFrom: null,
    labels: [],
    metKinds: new Set(),
    roomKinds: new Set(),
    labelRoom: -1,
  });
  const audio = useRef<GameAudio | null>(null);
  const [playing, setPlaying] = useState(false);
  // While the game rises under the reveal the reveal stays up, covering it and fading out: "rise",
  // or "fade" for reduced motion. Null when nothing covers the game.
  const [covering, setCovering] = useState<"rise" | "fade" | null>(null);
  const [ready, setReady] = useState(false);
  const [readySeats, setReadySeats] = useState<Seat[]>(early.ready); // who the server says is ready, bots included
  const stage = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLCanvasElement>(null);

  // Registered as soon as the reveal shows, so the first (full) view is never missed. The reveal
  // is sent a view of the room at tick 0 to draw behind its card; the game has started once a view
  // from a later tick arrives.
  const crewRef = useRef(reveal.crew); // the latest crew, for the view listener below (it subscribes once)
  crewRef.current = reveal.crew;
  // A view belongs to a room: one from the room before (the cleared room's last view, held over in
  // `early`, or a late one) must never start this room, which waits at its reveal until all are ready.
  const roomRef = useRef(reveal.room);
  roomRef.current = reveal.room;
  useEffect(() => {
    audio.current = createAudio();
    // The game has started: the first view from a later tick. If this page watched the reveal it
    // rises out of it; one that loads mid-game (a reload) is simply there.
    const start = (sawReveal: boolean) => {
      const r = rt.current;
      if (r.rise === null) {
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        r.rise = { at: sawReveal ? performance.now() : Number.NEGATIVE_INFINITY, reduced };
        if (sawReveal) setCovering(reduced ? "fade" : "rise");
      }
      setPlaying(true);
    };
    // the view that came with the reveal, before this listener existed
    if (early.view && early.view.room === roomRef.current && rt.current.view === null) {
      onView(rt.current, early.view, audio.current, seatNames(crewRef.current));
      if (early.view.tick > 0) start(false);
    }
    const off = socket.on("view", (m) => {
      if (m.view.room !== roomRef.current) return;
      const sawReveal = rt.current.view?.tick === 0;
      if (audio.current) onView(rt.current, m.view, audio.current, seatNames(crewRef.current));
      if (m.view.tick > 0) start(sawReveal);
    });
    return () => {
      off();
      audio.current?.dispose();
      audio.current = null;
    };
  }, [socket, early]);

  // the cover goes when its fade is over
  useEffect(() => {
    if (!covering) return;
    const id = setTimeout(() => setCovering(null), covering === "fade" ? FADE_MS : RISE_MS);
    return () => clearTimeout(id);
  }, [covering]);

  // The server says who is ready, on every change. A swap clears everyone, so this page's own button
  // follows the server rather than its own memory.
  useEffect(
    () =>
      socket.on("ready", (m) => {
        setReadySeats(m.seats);
        setReady(m.seats.includes(reveal.crew.findIndex((c) => c.role === reveal.role) as Seat));
      }),
    [socket, reveal.crew, reveal.role],
  );

  // The reveal is full-bleed like the game: no site header or footer around the room behind it.
  useEffect(() => {
    document.body.classList.add("playing");
    return () => document.body.classList.remove("playing");
  }, []);

  // The room behind the card: the view sent with the reveal, drawn flat, until the first tick.
  useDraw(rt.current, backdrop, stage, reveal.role, reveal.crew, true);
  const watchers = watching.map((nickname, n) => ({ ref: -4 - n, nickname }));
  const gone = useGone(socket);
  const hostNote = useHostNote(hostName, host);
  const held = usePause(socket);
  const myName = reveal.crew.find((c) => c.role === reveal.role)?.nickname;

  // Before the game starts the reveal is the page. When it starts the game rises underneath and
  // the reveal stays over it, fading, so it is the same element throughout: its backdrop canvas
  // keeps drawing and nothing remounts.
  const cover = !playing || covering !== null;
  const me = (rt.current.view?.you.seat ??
    reveal.crew.findIndex((c) => c.role === reveal.role)) as Seat;
  return (
    <>
      {playing && (
        <Hud
          rt={rt.current}
          socket={socket}
          state={state}
          rttMs={rttMs}
          online={online}
          reveal={reveal}
          host={host}
          hostName={hostName}
          seats={seats}
          sitting={sitting}
          watchers={watchers}
          audio={audio}
          onLeave={onLeave}
        />
      )}
      {cover && (
        <div
          class={covering ? "reveal-frame covering" : "reveal-frame"}
          data-rise={covering ?? undefined}
          inert={covering !== null}
          aria-hidden={covering !== null ? "true" : undefined} // decoration while it fades: the HUD speaks
          ref={stage}
        >
          <div class="reveal-canvas" aria-hidden="true">
            <canvas ref={backdrop} />
          </div>
          <div class="reveal-scrim" />
          {!covering && (gone || hostNote) && (
            <p class="hud-alert reveal-gone" role="status">
              {[gone, hostNote].filter(Boolean).join(" ")}
            </p>
          )}
          <RoleReveal
            {...reveal}
            me={me}
            ready={ready}
            readySeats={readySeats}
            host={host}
            watching={watching}
            audio={audio}
            onSwap={(a, b) => {
              // a person is their index in the lobby; a bot, who has no index, is named by its seat
              const ref = (name: string): number | null => {
                const at = people.indexOf(name);
                if (at >= 0) return at;
                const bot = reveal.crew.find((c) => c.bot && c.nickname === name);
                if (bot) return botRef(bot.seat);
                const watcher = watching.indexOf(name); // -4 - n: the nth spectator
                return watcher >= 0 ? -4 - watcher : null;
              };
              const first = ref(a);
              const second = ref(b);
              if (first !== null && second !== null) {
                socket.send({ t: "crew.swap", a: first, b: second });
              }
            }}
            onReady={(on) => {
              void audio.current?.resume(); // a tap is the browser's cue to let sound play
              setReady(on);
              socket.send(on ? { t: "ready" } : { t: "ready", on: false });
            }}
          />
          {!covering && held.pause?.forReady && held.pause.waitingFor === myName && (
            <p class="hud-alert reveal-gone" role="status">
              The game is waiting for you. Press I'm ready.
            </p>
          )}
          {!covering && held.pause && !held.pause.forReady && (
            <Disconnect
              waitingFor={held.pause.waitingFor}
              secondsLeft={held.secondsLeft}
              choosing={held.pause.choosing}
              host={host}
              sitting={sitting}
              watching={watchers}
              gone={held.pause.gone}
              forReady={held.pause.forReady}
              hostName={hostName}
              onChoice={(choice, person) =>
                socket.send({
                  t: "host.choice",
                  choice,
                  ...(person === undefined ? {} : { person }),
                })
              }
            />
          )}
        </div>
      )}
    </>
  );
}

function Hud({
  rt,
  socket,
  state,
  rttMs,
  online,
  reveal,
  host,
  hostName,
  seats,
  sitting,
  watchers,
  audio,
  onLeave,
}: {
  rt: Runtime;
  socket: GameSocket;
  state: ConnectionState;
  rttMs: number | null;
  online: boolean;
  reveal: Reveal;
  host: boolean;
  hostName: string | null;
  seats: LobbyState["seats"] | null;
  sitting: { index: number; nickname: string }[];
  watchers: { ref: number; nickname: string }[]; // spectators the host may pull into an empty seat
  audio: { current: GameAudio | null };
  onLeave: () => void;
}) {
  const { role, real } = reveal;
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [clock, setClock] = useState("0:00");
  const [loot, setLoot] = useState(0);
  // from the view, polled with the clock: what Act would do, your own gear, the lamp, your side job,
  // and what each teammate in sight carries (the crew row's glyphs)
  const [act, setAct] = useState<string | undefined>(undefined);
  const [gear, setGear] = useState<GearItem | null>(null);
  const [lamp, setLamp] = useState<Role | null>(null);
  const [cache, setCache] = useState<RoleView["cache"]>(undefined);
  const [keepsake, setKeepsake] = useState<RoleView["keepsake"]>(undefined);
  const [carried, setCarried] = useState<Partial<Record<Seat, GearItem>>>({});
  const [watchOpen, setWatchOpen] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [summary, setSummary] = useState<{
    ms: number;
    loot: number;
    lootTotal: number;
    board: RoomBoardData;
    credits: { seat: number; lines: string[] }[];
    cache?: TileCache;
  } | null>(null);
  const [boardOpen, setBoardOpen] = useState<string | null>(null); // the leaderboard panel's first tab
  const [heist, setHeist] = useState<{
    ms: number;
    loot: number;
    lootTotal: number;
    rank: number;
    caches: { room: string; name: string; found: boolean; item: ItemId }[];
  } | null>(null);
  const { pause, secondsLeft, back } = usePause(socket);
  const [vote, setVote] = useState<OpenVote | null>(null); // a restart is being voted on
  const [voteLeft, setVoteLeft] = useState(0);
  const [voteNote, setVoteNote] = useState<string | null>(null); // how the last vote ended
  const [replaced, setReplaced] = useState<string | null>(null); // someone left and a bot took their seat
  const crewSeen = useRef(reveal.crew);
  const [caught, setCaught] = useState<string | null>(null); // why the team was just sent back
  const [touch, setTouch] = useState(false);
  const lastSent = useRef<string | null>(null);
  const [settings, setSettings] = useState<SettingsState>(() => loadSettings(role));
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [cues, setCues] = useState<CueCaption[]>([]);
  const [moment, setMoment] = useState<string | null>(null); // the cache chip's words, while on show
  const [typing, setTyping] = useState(false);
  const [writing, setWriting] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const comms = useRef<CommsApi | null>(null);
  const voice = useVoice(socket, role, real.voice, root, settings.voiceMode);
  const goneNote = useGone(socket);
  // A hearing role without headphones gets captions instead of game sound, so the game's own
  // audio never leaks out to everyone sitting around them.
  const forceCaptions = real.soundOff;
  const live = useRef({ settings, lineId: 0, forceCaptions });
  live.current.settings = settings;
  live.current.forceCaptions = forceCaptions;
  rt.labelsOn = settings.labels;
  rt.labelsAll = reveal.index === 0;
  if (rt.labelRoom !== reveal.index) {
    for (const k of rt.roomKinds) rt.metKinds.add(k); // what the last room showed is no longer new
    rt.roomKinds.clear();
    rt.labelRoom = reveal.index;
  }
  rt.soundOn = settings.sound && !forceCaptions;

  // The tile centre under a client point, for placing a mark; `open` is false
  // for a wall (the server decides what is in sight). None once the room is cleared: its panel
  // covers the map, so there is no tile to point at.
  function toTile(clientX: number, clientY: number): { at: Vec; open: boolean } | null {
    if (rt.view?.status === "cleared") return null;
    const box = canvas.current?.getBoundingClientRect();
    const cam = rt.cam;
    const tiles = rt.tiles;
    if (!box || !cam || !tiles) return null;
    const floor = fromScreen(cam, clientX - box.left, clientY - box.top);
    const tx = Math.floor(floor.x);
    const ty = Math.floor(floor.y);
    const row = tiles[ty];
    if (row === undefined || tx < 0 || tx >= row.length) return null;
    return { at: { x: tx + 0.5, y: ty + 0.5 }, open: row[tx] !== "#" && row[tx] !== "%" };
  }

  function change(next: SettingsState) {
    setSettings(next);
    saveSettings(next);
  }

  useEffect(() => {
    setContrast(settings.highContrast);
    document.documentElement.dataset.contrast = settings.highContrast ? "high" : "";
    return () => {
      document.documentElement.removeAttribute("data-contrast");
      setContrast(false);
    };
  }, [settings.highContrast]);

  // The deaf seat's own masking noise: on when their setup says they have headphones, unless they
  // turned it off, at the volume they chose.
  const maskNoiseOn = real.maskNoise && (settings.maskNoiseOn ?? real.maskDefault);
  useEffect(() => {
    audio.current?.setMaskNoise(maskNoiseOn, settings.volume);
  }, [audio, maskNoiseOn, settings.volume]);

  // Everything a channel message does on arrival: speak it, play it, show it.
  useEffect(() => {
    const speech = browserSpeech(role, () => live.current.settings.speech);
    if (role !== "blind") preloadFaces();
    return socket.on("msg", (m) => {
      const now = performance.now();
      const { settings: s, forceCaptions } = live.current;
      if (m.method === "callout" || m.method === "text") {
        speech.say(m.method === "callout" ? CALLOUT_WORD[m.callout] : m.text);
      } else if (m.method === "clip" && s.sound && !forceCaptions) {
        audio.current?.playClip(m.clip);
      } else if (m.method === "face") {
        rt.pops.push({
          seat: m.from.seat,
          id: m.id,
          at: now,
          from: m.from.pos,
          name: m.from.nickname,
        });
      } else if (m.method === "mark") {
        rt.pops.push({
          seat: m.from.seat,
          id: m.id,
          at: now,
          from: m.at,
          name: m.from.nickname,
          mark: m.id,
        });
      }
      // text to Can't speak is always shown, since reading it is their only way
      const caption = captionFor(m);
      const wanted = s.captions || forceCaptions || (m.method === "text" && role !== "blind");
      if (caption && wanted) {
        const line = { id: ++live.current.lineId, ...caption, until: now + CAPTION_MS };
        setLines((old) => [...old.filter((l) => l.until > now), line].slice(-3));
      }
    });
  }, [socket, role, rt, audio]);

  useEffect(
    () =>
      socket.on("cleared", (m) =>
        setSummary({
          ms: m.ms,
          loot: m.loot,
          lootTotal: m.lootTotal,
          board: m.board,
          credits: m.credits,
          cache: m.cache,
        }),
      ),
    [socket],
  );

  useEffect(
    () =>
      socket.on("heist", (m) =>
        setHeist({
          ms: m.ms,
          loot: m.loot,
          lootTotal: m.lootTotal,
          rank: m.rank,
          caches: m.caches,
        }),
      ),
    [socket],
  );

  // A restart vote: opened and updated by the server, ended with one line saying how. A passed one
  // has put everyone back at spawn, so what this page remembered of the room goes.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const offs = [
      socket.on("vote", (m) =>
        setVote((old) => ({
          kind: m.kind,
          by: m.by,
          until: performance.now() + m.left,
          // the first message of a vote carries all its time: later ones only what is left
          total: old && old.kind === m.kind && old.by === m.by ? old.total : m.left,
          yes: m.yes,
          no: m.no,
          voters: m.voters,
        })),
      ),
      socket.on("vote.end", (m) => {
        setVote(null);
        if (m.result === "passed") restarted();
        setVoteNote(outcomeText(m.kind, m.result, m.by));
        clearTimeout(timer);
        timer = setTimeout(() => setVoteNote(null), 3000);
      }),
    ];
    return () => {
      for (const off of offs) off();
      clearTimeout(timer);
    };
  }, [socket]);

  useEffect(() => {
    if (!vote) return;
    const tick = () => setVoteLeft((vote.until - performance.now()) / 1000);
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [vote]);

  const hostNote = useHostNote(hostName, host);
  const watching = [...sitting.map((p) => p.nickname), ...watchers.map((w) => w.nickname)];

  useEffect(() => {
    if (!watchOpen) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setWatchOpen(false);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [watchOpen]);

  // A seat changed hands: a person left and a bot took it, or they came back. The crew changes
  // under us, so say so.
  useEffect(() => {
    const before = crewSeen.current;
    crewSeen.current = reveal.crew;
    const text = crewChangeText(before, reveal.crew);
    if (!text) return;
    setReplaced(text);
    const timer = setTimeout(() => setReplaced(null), 6000);
    return () => clearTimeout(timer);
  }, [reveal.crew]);

  // The team was caught: say what got whom, in words on the screen for everyone and
  // spoken to Can't see, who has nothing else to go on (and in the dark, nor do the others).
  useEffect(() => {
    const speech = browserSpeech(role, () => live.current.settings.speech);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = socket.on("caught", (m) => {
      const text = caughtText(
        m,
        reveal.crew,
        reveal.crew.findIndex((c) => c.seat === rt.view?.you.seat),
      );
      setCaught(text);
      speech.say(text);
      clearTimeout(timer);
      timer = setTimeout(() => setCaught(null), 7000);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [socket, role, reveal.crew, rt]);

  // Asks for a restart: the others vote, and if everyone says yes the room (or the heist) starts
  // again. The buttons that call it (ConfirmButton) have already asked twice.
  function ask(kind: "room" | "heist") {
    socket.send({ t: "vote.propose", kind });
  }

  // A restart that passed puts everyone back at spawn: drop what this page remembered of the room.
  function restarted() {
    lastSent.current = null;
    // the room's summary and, after the last room, the heist's result: either left behind would sit
    // over the restarted room (the page shows the heist-complete screen in place of it)
    const left = afterRestart({ summary, heist });
    setSummary(left.summary);
    setHeist(left.heist);
  }

  useEffect(() => {
    document.body.classList.add("playing");
    setTouch(matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0);
    const tick = setInterval(() => {
      const view = rt.view;
      if (!view) return;
      setClock(formatTime(view.elapsedMs));
      setLoot(view.loot);
      setAct(view.act);
      setGear(view.gear ?? null);
      setKeepsake(view.keepsake);
      setCache((old) =>
        old?.id === view.cache?.id && old?.state === view.cache?.state && old?.by === view.cache?.by
          ? old
          : view.cache,
      );
      // the lamp shows for a second after its flash, from the puller's role (at most 2 a second:
      // the server rate-limits the switch)
      if (view.lamp && view.lamp.tick !== rt.lampTick) {
        rt.lampTick = view.lamp.tick;
        rt.lampUntil = performance.now() + LAMP_MS;
        rt.lampFrom = reveal.crew.find((c) => c.seat === view.lamp?.seat)?.role ?? null;
      }
      setLamp(performance.now() < rt.lampUntil ? rt.lampFrom : null);
      const held: Partial<Record<Seat, GearItem>> = {};
      for (const e of view.entities)
        if (e.kind === "player" && e.seat !== undefined && e.item) held[e.seat] = e.item;
      if (view.gear) held[view.you.seat] = view.gear;
      setCarried((old) => (JSON.stringify(old) === JSON.stringify(held) ? old : held));
      setCleared(view.status === "cleared");
      const now = performance.now();
      rt.pops = rt.pops.filter((p) => now - p.at < PILL_MS);
      setLines((old) => (old.some((l) => l.until <= now) ? old.filter((l) => l.until > now) : old));
      // Can't hear is never given a sound caption: nothing is played to them to caption
      const heard =
        role !== "deaf" && (live.current.settings.captions || live.current.forceCaptions)
          ? heardCues(rt.cueHold, now)
          : [];
      setCues((old) => (cueKey(old) === cueKey(heard) ? old : heard));
      const shown = rt.moment && rt.moment.until > now ? rt.moment.text : null;
      setMoment((old) => (old === shown ? old : shown));
    }, 100);
    return () => {
      document.body.classList.remove("playing");
      clearInterval(tick);
    };
  }, [rt]);

  useDraw(rt, canvas, frame, role, reveal.crew);

  // Keyboard and touch, sent at 20 Hz while moving or changing; nothing goes
  // out while offline, and coming back online sends the current input afresh.
  useEffect(() => {
    if (!root.current) return;
    const source = createInput(root.current);
    lastSent.current = null;
    const timer = setInterval(() => {
      if (!online || rt.view?.status === "cleared") return;
      const input = source.read();
      const moving = input.move.x !== 0 || input.move.y !== 0;
      if (moving) rt.facing = input.move;
      else rt.walking = { moving: false, blocked: false };
      const sig = inputKey(input);
      if (!moving && sig === lastSent.current) return;
      lastSent.current = sig;
      socket.send({ t: "input", ...input });
      if (moving && rt.predictor) {
        const from = rt.self;
        rt.self = rt.predictor.apply(input, 1000 / NET.inputHz);
        const moved = from ? Math.hypot(rt.self.x - from.x, rt.self.y - from.y) : STEP_TILES;
        rt.walking = { moving: true, blocked: moved < STEP_TILES * BLOCKED_SHARE };
      } else if (moving) rt.walking = { moving: true, blocked: false };
    }, 1000 / NET.inputHz);
    return () => {
      clearInterval(timer);
      source.dispose();
    };
  }, [rt, socket, online, touch]);

  // Who is gone: "left" frees the seat, "away" is a dropped connection (seat held).
  const presence = reveal.crew.map((c) => {
    const seat = seats?.[c.seat];
    if (!seat || c.bot) return null;
    if (!seat.who) return "left" as const;
    return seat.connected ? null : ("away" as const);
  });
  const gone = reveal.crew.flatMap((c, i) =>
    presence[i] ? [{ name: c.nickname, how: presence[i] }] : [],
  );
  // each role appears once in a crew, so the seat that has this page's role is this page's seat
  const me = reveal.crew.find((c) => c.role === role)?.seat ?? 0;
  const label = ROLE_LABEL[role];
  return (
    <div class="game" ref={root} style={{ "--frame": `var(--role-${role})` }}>
      <h1 class="sr-only">
        {reveal.name}: {label}
      </h1>
      <header class="hud-top">
        <ul class="hud-crew" aria-label="Your team">
          {reveal.crew.map((c) => (
            <li key={c.seat} class={c.seat === rt.view?.you.seat ? "you" : undefined}>
              <RoleShape role={c.role} size={16} />
              <span class="hud-who">
                {c.nickname}
                {presence[c.seat] ? ` (${presence[c.seat]})` : ""}
              </span>
              {carried[c.seat] && (
                <span class="hud-gear" title={GEAR_NAME[carried[c.seat] as GearItem]}>
                  <GearGlyph item={carried[c.seat] as GearItem} size={16} />
                  <span class="sr-only">
                    , carries the {GEAR_NAME[carried[c.seat] as GearItem]}
                  </span>
                </span>
              )}
              {c.seat === rt.view?.you.seat && <span class="hud-tag">you</span>}
              {c.bot && <span class="hud-tag">bot</span>}
              {voice.speaking.has(c.seat) && <span class="talking hud-tag">talking</span>}
              <span class="sr-only">, {ROLE_LABEL[c.role]}</span>
            </li>
          ))}
        </ul>
        {role !== "blind" && <LampLight from={lamp} />}
        <span class="hud-clock" role="timer" aria-label="Time">
          {clock}
        </span>
        <span class="hud-loot" role="img" aria-label={`Loot ${loot}`}>
          <span aria-hidden="true">◆ {loot}</span>
        </span>
        <Connection state={state} rttMs={rttMs} />
        <span class="hud-watching">
          <button
            type="button"
            class="hud-btn"
            aria-expanded={watchOpen}
            aria-controls="hud-watching"
            disabled={watching.length === 0}
            hidden={watching.length === 0}
            onClick={() => setWatchOpen(!watchOpen)}
          >
            {watching.length} watching
          </button>
          {watchOpen && watching.length > 0 && (
            <ul class="hud-watching-list" id="hud-watching" aria-label="Watching">
              {watching.map((name, n) => (
                <li key={`${n}:${name}`}>{name}</li>
              ))}
            </ul>
          )}
        </span>
        <HudMenu
          onAsk={ask}
          onLeave={onLeave}
          settings={
            <Settings
              role={role}
              settings={settings}
              onChange={change}
              maskNoiseAvailable={real.maskNoise}
              maskNoiseDefault={real.maskDefault}
              othersSoundOff={real.soundOff}
              voiceOn={real.voice}
            />
          }
        />
      </header>

      {role === "blind" && <p class="hud-hint">No map. Listen.</p>}

      {voice.lagging && (
        <p class="hud-alert" role="status">
          Voice lagging
        </p>
      )}

      {hostNote && (
        <p class="hud-alert" role="status">
          {hostNote}
        </p>
      )}

      {replaced && (
        <p class="hud-alert" role="status">
          {replaced}
        </p>
      )}

      {goneNote && (
        <p class="hud-alert" role="status">
          {goneNote}
        </p>
      )}

      {back && (
        <p class="hud-alert" role="status">
          {back} is back.
        </p>
      )}

      {voteNote && (
        <p class="hud-alert" role="status">
          {voteNote}
        </p>
      )}

      {gone.length > 0 && (
        <p class="hud-alert" role="status">
          {gone
            .map((g) =>
              g.how === "left" ? `${g.name} left the game.` : `${g.name} lost connection.`,
            )
            .join(" ")}
        </p>
      )}

      <div class="frame" ref={frame}>
        <span class="notch" aria-hidden="true">
          <RoleShape role={role} size={20} mono />
        </span>
        <canvas
          ref={canvas}
          role="img"
          aria-label={role === "blind" ? "No map. Listen to the room." : "Map of the room"}
        />
        <SideJob cache={cache} keepsake={keepsake} />
        {moment && (
          <div class="cache-moment" role="status">
            <p>{moment}</p>
          </div>
        )}
        <Captions lines={lines} cues={cues} />
        {!cleared && (
          <div class="hud-dock">
            <GearSlot gear={gear} touch={touch} />
            {!touch && <ActHint act={act} />}
          </div>
        )}
        <CommsWheel
          role={role}
          me={me}
          crew={reveal.crew}
          socket={socket}
          quick={settings.quick}
          voice={voice}
          api={comms}
          typing={typing}
          toTile={toTile}
          onPin={(id) => change({ ...settings, quick: id })}
          onText={() => {
            if (role === "mute") return;
            setWriting(true);
            setTimeout(() => field.current?.focus(), 0);
          }}
          onClose={() => setWriting(false)}
          onOwnFace={(id) => {
            // Can't see has no map, so there is no character to put it over
            if (role !== "blind") rt.pops.push({ seat: me, id, at: performance.now() });
          }}
        />
        {typing && (
          <span class="typing-badge" role="status">
            Typing
          </span>
        )}
        {heist ? (
          <HeistComplete
            ms={heist.ms}
            loot={heist.loot}
            lootTotal={heist.lootTotal}
            rank={heist.rank}
            caches={heist.caches}
            onBoard={() => setBoardOpen("heist")}
          />
        ) : (
          cleared && (
            <RoomCleared
              ms={summary?.ms ?? rt.view?.elapsedMs ?? 0}
              loot={summary?.loot ?? 0}
              lootTotal={summary?.lootTotal ?? 0}
              last={reveal.index >= reveal.rooms - 1}
              host={host}
              onNext={() => socket.send({ t: "next" })}
              onRestart={() => ask("room")}
              onRestartHeist={() => ask("heist")}
              board={summary?.board}
              credits={summary ? creditRows(summary.credits, reveal.crew) : undefined}
              cache={summary?.cache}
              names={seatNames(reveal.crew)}
              onBoard={() => setBoardOpen(`room-${reveal.index + 1}`)}
            />
          )
        )}
        {caught && (
          <p class="caught-banner" role="alert">
            {caught}
          </p>
        )}
        {vote && (
          <VotePrompt
            vote={vote}
            seat={me as Seat}
            crew={reveal.crew}
            secondsLeft={voteLeft}
            onCast={(yes) => socket.send({ t: "vote.cast", yes })}
          />
        )}
        {pause && (
          <Disconnect
            waitingFor={pause.waitingFor}
            secondsLeft={secondsLeft}
            choosing={pause.choosing}
            host={host}
            sitting={sitting}
            watching={watchers}
            gone={pause.gone}
            forReady={pause.forReady}
            hostName={hostName}
            onChoice={(choice, person) =>
              socket.send({ t: "host.choice", choice, ...(person === undefined ? {} : { person }) })
            }
          />
        )}
        {boardOpen && <LeaderboardPanel initial={boardOpen} onClose={() => setBoardOpen(null)} />}
        {!online && (
          <div class="overlay" role="alert">
            <h2>Lost connection</h2>
            <p>Retrying…</p>
          </div>
        )}
      </div>

      <TalkBar
        role={role}
        voice={voice}
        writing={writing}
        field={field}
        onWrite={() => {
          setWriting(true);
          setTimeout(() => field.current?.focus(), 0);
        }}
        onText={(text) => {
          if (text.trim() === "") return;
          socket.send({ t: "send", msg: { method: "text", text } });
          setWriting(false);
        }}
        onFocus={setTyping}
        onComms={touch ? undefined : () => comms.current?.toggle()}
      />

      {touch ? (
        <TouchControls
          moveDisabled={cleared}
          comms={comms}
          quickLabel={quickSlot(role, settings.quick).name}
          act={act}
        />
      ) : (
        <p class={cleared ? "keys is-off" : "keys"}>WASD or arrows move · Space acts</p>
      )}
    </div>
  );
}

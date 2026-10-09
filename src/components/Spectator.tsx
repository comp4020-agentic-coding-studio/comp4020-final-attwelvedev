import { useEffect, useRef, useState } from "preact/hooks";
import { captionFor } from "../client/hud.ts";
import { draw, type Scene } from "../client/render.ts";
import type { ConnectionState, GameSocket } from "../client/socket.ts";
import { ROLE_LABEL, type Role, type Seat } from "../game/types.ts";
import type { LobbyState, RoleView } from "../net/protocol.ts";
import { type CaptionLine, Captions } from "./Captions.tsx";
import { Connection } from "./Connection.tsx";

const SEATS = [0, 1, 2] as const;
const CAPTION_MS = 4000;

// A grey dashed frame, no role shape and no tray (spec §4.1): a spectator
// plays nothing, so the chrome that belongs to a seat is left off. The view
// itself (src/game/perception.ts: spectatorView) is always the full room,
// whichever seat is followed.
export function Spectator({
  socket,
  state,
  rttMs,
  seats,
  onStartNewTeam,
}: {
  socket: GameSocket;
  state: ConnectionState;
  rttMs: number | null;
  seats: LobbyState["seats"];
  onStartNewTeam: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<RoleView | null>(null);
  const roles = useRef<[Role, Role, Role]>(["blind", "deaf", "mute"]);
  const [follow, setFollow] = useState<Seat>(0);
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const lineId = useRef(0);

  useEffect(
    () =>
      socket.on("reveal", (m) => {
        roles.current = m.crew.reduce(
          (acc, c) => {
            acc[c.seat] = c.role;
            return acc;
          },
          ["blind", "deaf", "mute"] as [Role, Role, Role],
        );
      }),
    [socket],
  );

  useEffect(
    () =>
      socket.on("view", (m) => {
        view.current = m.view;
      }),
    [socket],
  );

  useEffect(
    () =>
      socket.on("msg", (m) => {
        const caption = captionFor(m);
        if (!caption) return;
        const now = performance.now();
        const line = { id: ++lineId.current, ...caption, until: now + CAPTION_MS };
        setLines((old) => [...old.filter((l) => l.until > now), line].slice(-3));
      }),
    [socket],
  );

  function followSeat(seat: Seat) {
    setFollow(seat);
    socket.send({ t: "spectate", seat });
  }

  // Same full-bleed layout as a game: the site header and footer step aside.
  useEffect(() => {
    document.body.classList.add("playing");
    return () => document.body.classList.remove("playing");
  }, []);

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
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const v = view.current;
      if (!v) return;
      const scene: Scene = {
        ...size,
        role: v.role,
        seat: v.you.seat,
        roles: roles.current,
        tiles: v.tiles ?? null,
        entities: v.entities,
        self: v.you.pos ?? null,
        layout: size.w >= 720 ? "fit" : "follow",
        alarm: v.alarm,
        nowMs: performance.now(),
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        spectator: true,
      };
      draw(ctx, scene);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <div class="spectator">
      <header class="hud-bar">
        <span class="hud-room">Spectating</span>
        <Connection state={state} rttMs={rttMs} />
      </header>
      <div class="frame spectator-frame" ref={frame}>
        <canvas
          ref={canvas}
          role="img"
          aria-label={`Spectator view, following ${ROLE_LABEL[roles.current[follow]]}`}
        />
        <Captions lines={lines} cues={[]} />
      </div>
      <fieldset class="spectator-follow">
        <legend>Follow</legend>
        {SEATS.map((seat) => (
          <button
            key={seat}
            type="button"
            class="btn"
            aria-pressed={follow === seat}
            disabled={!seats[seat]?.who && !seats[seat]?.bot}
            onClick={() => followSeat(seat)}
          >
            {seats[seat]?.nickname ?? `Seat ${seat + 1}`}
          </button>
        ))}
      </fieldset>
      <button type="button" class="btn primary" onClick={onStartNewTeam}>
        Start a new team
      </button>
    </div>
  );
}

import { useState } from "preact/hooks";
import type { Method, Role, Seat } from "../game/types.ts";
import type { CommsEdge } from "../net/protocol.ts";

interface Member {
  seat: Seat;
  nickname: string;
  role: Role;
}

// Where each seat sits on the triangle, in the SVG's own units: seat 0 at the top.
const CORNER: Record<Seat, { x: number; y: number }> = {
  0: { x: 160, y: 46 },
  1: { x: 62, y: 196 },
  2: { x: 258, y: 196 },
};
const NODE = 24; // how far an arrow stops short of a corner's centre
const APART = 7; // how far each direction's arrow sits off the line between two corners
const NAME_MAX = 112; // a long nickname is squeezed to this width rather than run off the map

const key = (from: Seat, to: Seat) => `${from}>${to}`;
const name = (crew: readonly Member[], seat: Seat) =>
  crew.find((c) => c.seat === seat)?.nickname ?? `Seat ${seat + 1}`;

// What went along one arrow, by method, in the wheel's words: "callout 10 · voice 4".
export function breakdown(by: CommsEdge["by"]): string {
  return (Object.entries(by) as [Method, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([method, n]) => `${method} ${n}`)
    .join(" · ");
}

// The one-line summary: the busiest direction, then the quietest sender's total. Names come from
// the crew here in the browser; the server only ever sends seats.
export function commsSummary(edges: readonly CommsEdge[], crew: readonly Member[]): string {
  const busiest = edges.reduce<CommsEdge | null>(
    (best, e) => (best === null || e.count > best.count ? e : best),
    null,
  );
  if (!busiest) return "No messages this room.";
  const sent = ([0, 1, 2] as const).map((seat) => ({
    seat,
    total: edges.filter((e) => e.from === seat).reduce((n, e) => n + e.count, 0),
  }));
  const quietest = sent.reduce((low, s) => (s.total < low.total ? s : low));
  const most = `Most messages went ${name(crew, busiest.from)} → ${name(crew, busiest.to)}.`;
  const total =
    quietest.total === 0
      ? "nothing"
      : quietest.total === 1
        ? "1 message"
        : `${quietest.total} in total`;
  return `${most} ${name(crew, quietest.seat)} sent ${total}.`;
}

function Shape({ role, x, y }: { role: Role; x: number; y: number }) {
  const fill = `var(--role-${role})`;
  if (role === "blind") return <circle cx={x} cy={y} r={14} fill={fill} />;
  if (role === "deaf") return <rect x={x - 13} y={y - 13} width={26} height={26} fill={fill} />;
  return <polygon points={`${x},${y - 15} ${x + 15},${y + 13} ${x - 15},${y + 13}`} fill={fill} />;
}

// The comms map on the cleared card (overhaul FR35): the three players as a triangle, an arrow
// each way between every two of them, thicker the more went that way, with its count. Hover or
// focus an arrow for what it carried, by method. Counts and methods only: never what was said.
export function CommsMap({
  edges,
  crew,
  title = "Comms this room",
}: {
  edges: readonly CommsEdge[];
  crew: readonly Member[];
  title?: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const most = Math.max(1, ...edges.map((e) => e.count));
  const pairs: [Seat, Seat][] = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];
  const arrows = pairs.flatMap(([a, b]) => [
    [a, b],
    [b, a],
  ]) as [Seat, Seat][];
  const shown = active ? edges.find((e) => key(e.from, e.to) === active) : undefined;
  return (
    <section class="comms-map" aria-labelledby="comms-map-title">
      <h3 id="comms-map-title">{title}</h3>
      {/* the picture, for the eye and the pointer; the buttons under it say the same for a keyboard
          and a screen reader */}
      <svg viewBox="0 0 320 250" aria-hidden="true">
        {arrows.map(([from, to]) => {
          const edge = edges.find((e) => e.from === from && e.to === to);
          const count = edge?.count ?? 0;
          const a = CORNER[from];
          const b = CORNER[to];
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          const ux = (b.x - a.x) / len;
          const uy = (b.y - a.y) / len;
          // to the right of the direction of travel, so the two directions never share a line
          const ox = -uy * APART;
          const oy = ux * APART;
          const k = key(from, to);
          const mid = { x: (a.x + b.x) / 2 + ox * 2.6, y: (a.y + b.y) / 2 + oy * 2.6 };
          const width = count === 0 ? 1 : 2 + (6 * count) / most;
          // the head, drawn rather than a marker so it takes the arrow's colour and grows with it
          const tip = { x: b.x - ux * NODE + ox, y: b.y - uy * NODE + oy };
          const head = 5 + width;
          const base = { x: tip.x - ux * head * 1.4, y: tip.y - uy * head * 1.4 };
          const headPoints = [
            tip,
            { x: base.x - uy * head, y: base.y + ux * head },
            { x: base.x + uy * head, y: base.y - ux * head },
          ]
            .map((p) => `${p.x},${p.y}`)
            .join(" ");
          return (
            <g key={k} data-edge={k} class={active === k ? "comms-edge active" : "comms-edge"}>
              {/* the browser's own tooltip: an arrow's breakdown on hover */}
              <title>
                {`${name(crew, from)} → ${name(crew, to)}: ${edge ? breakdown(edge.by) : "nothing"}`}
              </title>
              {/* a wide clear stroke under the arrow, so a thin one is still easy to point at */}
              <line
                class="comms-hit"
                x1={a.x + ux * NODE + ox}
                y1={a.y + uy * NODE + oy}
                x2={b.x - ux * NODE + ox}
                y2={b.y - uy * NODE + oy}
              />
              <line
                class={count === 0 ? "comms-arrow none" : "comms-arrow"}
                x1={a.x + ux * NODE + ox}
                y1={a.y + uy * NODE + oy}
                x2={count === 0 ? tip.x : base.x}
                y2={count === 0 ? tip.y : base.y}
                stroke-width={width}
              />
              {count > 0 && <polygon class="comms-head" points={headPoints} />}
              {count > 0 && (
                <text class="comms-count" x={mid.x} y={mid.y} dy="0.35em">
                  {count}
                </text>
              )}
            </g>
          );
        })}
        {([0, 1, 2] as const).map((seat) => {
          const member = crew.find((c) => c.seat === seat);
          const at = CORNER[seat];
          const nick = name(crew, seat);
          const below = seat !== 0;
          return (
            <g key={seat}>
              {member && <Shape role={member.role} x={at.x} y={at.y} />}
              <text
                class="comms-name"
                x={at.x}
                y={below ? at.y + 36 : at.y - 26}
                {...(nick.length * 8.5 > NAME_MAX
                  ? { textLength: NAME_MAX, lengthAdjust: "spacingAndGlyphs" }
                  : {})}
              >
                {nick}
              </text>
            </g>
          );
        })}
      </svg>
      {edges.length > 0 && (
        <ul class="comms-edges" aria-label="Messages each way">
          {edges.map((e) => {
            const k = key(e.from, e.to);
            return (
              <li key={k}>
                <button
                  type="button"
                  class="comms-chip"
                  aria-pressed={active === k}
                  aria-label={`${name(crew, e.from)} to ${name(crew, e.to)}: ${e.count} (${breakdown(e.by)})`}
                  onFocus={() => setActive(k)}
                  onBlur={() => setActive((s) => (s === k ? null : s))}
                  onMouseEnter={() => setActive(k)}
                  onMouseLeave={() => setActive((s) => (s === k ? null : s))}
                  onClick={() => setActive(k)}
                >
                  {name(crew, e.from)} → {name(crew, e.to)} {e.count}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p class="comms-detail" aria-live="polite">
        {shown
          ? `${name(crew, shown.from)} → ${name(crew, shown.to)}: ${breakdown(shown.by)}`
          : "Point at an arrow to see how it was sent."}
      </p>
      <p class="comms-summary">{commsSummary(edges, crew)}</p>
    </section>
  );
}

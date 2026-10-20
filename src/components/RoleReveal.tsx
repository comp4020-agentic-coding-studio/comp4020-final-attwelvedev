import { useState } from "preact/hooks";
import type { GameAudio } from "../client/audio.ts";
import {
  crewRows,
  getsOf,
  readyStatus,
  receiverNames,
  sendsOf,
  swapPrompt,
} from "../client/reveal.ts";
import { PAGE_LABEL, PAGE_METHOD, type Page } from "../client/wheel.ts";
import type { BriefingCue } from "../game/cues.ts";
import { ROLE_LABEL, type Role, type Seat } from "../game/types.ts";
import type { CrewMember, RealLife } from "../net/protocol.ts";
import { ReceiverLine } from "./ReceiverLine.tsx";
import { RoleShape } from "./RoleShape.tsx";
import { SoundBriefing } from "./SoundBriefing.tsx";

const YOU: Record<Role, string> = {
  blind: "You can't see",
  deaf: "You can't hear",
  mute: "You can't speak",
};

// The pages as the reveal says them: what you send, and what you get, in the wheel's words.
const pagesText = (pages: Page[]): string =>
  pages.length > 0 ? pages.map((p) => PAGE_LABEL[p].toLowerCase()).join(", ") : "nothing";

export function RoleReveal({
  name,
  index,
  rooms,
  role,
  crew,
  from,
  ready,
  readySeats,
  onReady,
  real,
  cues,
  played,
  sittingOut,
  watching,
  me,
  host,
  onSwap,
  audio,
}: {
  name: string;
  index: number;
  rooms: number;
  role: Role;
  crew: (CrewMember & { left?: true })[];
  from?: Role;
  ready: boolean; // this page pressed I'm ready
  readySeats: Seat[];
  onReady: (on: boolean) => void; // I'm ready, or taking it back
  real: RealLife;
  cues: BriefingCue[];
  played: Record<string, Role[]>;
  sittingOut: string[];
  watching: string[]; // spectators, who see the reveal but never play it
  me: Seat;
  host: boolean;
  onSwap: (a: string, b: string) => void; // by nickname: the page maps to person indexes
  audio: { current: GameAudio | null };
}) {
  const sends = sendsOf(role);
  const gets = getsOf(role);
  // a new room hands you a new role: the old shape turns into the new one
  const morphing = from !== undefined && from !== role;
  const rows = crewRows({ crew, ready: readySeats, sittingOut, played, me, watching });
  const notReady = rows.filter((r) => r.role !== null && !r.ready && !r.left).length;
  const total = crew.filter((c) => !c.left).length;
  const status = readyStatus({ you: ready, ready: total - notReady, total });
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (who: string) =>
    setPicked((old) =>
      old.includes(who) ? old.filter((n) => n !== who) : [...old, who].slice(-2),
    );
  const [a, b] = picked;

  return (
    <div class="reveal-stage">
      <section class="reveal" aria-labelledby="reveal-title">
        <p class="muted">
          Room {index + 1} of {rooms}: {name}
        </p>
        <div class="reveal-head">
          <div
            class={morphing ? "reveal-shape morphing" : "reveal-shape"}
            style={{ "--role-colour": `var(--role-${role})` }}
          >
            {morphing && (
              <span class="reveal-from">
                <RoleShape role={from} size={72} />
              </span>
            )}
            <span class="reveal-to">
              <RoleShape role={role} size={72} />
            </span>
          </div>
          <h1 id="reveal-title" class="reveal-title">
            {YOU[role]}
          </h1>
        </div>

        <dl class="reveal-facts">
          <div>
            <dt>You can send</dt>
            <dd>{pagesText(sends)}</dd>
          </div>
          <div>
            <dt>You get</dt>
            <dd>{pagesText(gets)}</dd>
          </div>
        </dl>

        <ul class="reveal-lines" aria-label="Who gets what you send">
          {sends.map((page) => (
            <li key={page}>
              <span class="page">{PAGE_LABEL[page]}</span>
              <ReceiverLine method={PAGE_METHOD[page]} crew={crew} me={me} />
              <span class="sr-only">{receiverNames(page, crew, me).hear.join(", ")}</span>
            </li>
          ))}
        </ul>

        {role === "blind" && <p class="reveal-dark">Your screen goes dark. That's on purpose.</p>}
        {real.lines.length > 0 && (
          <ul class="reveal-honour" aria-label="Real-life rules for you">
            {real.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {role === "blind" && <SoundBriefing cues={cues} audio={audio} />}

        <div class="reveal-go">
          {!ready && (
            <button type="button" class="btn primary" onClick={() => onReady(true)}>
              I'm ready
            </button>
          )}
          {ready && (
            <button type="button" class="btn" onClick={() => onReady(false)}>
              Not ready yet
            </button>
          )}
          <span class={status.waiting ? "ready-status waiting" : "ready-status"} role="status">
            {status.text}
          </span>
        </div>
      </section>

      <aside class="reveal-crew-panel" aria-labelledby="crew-title">
        <h2 id="crew-title">Crew</h2>
        <ul class="reveal-crew" aria-label="Your team">
          {rows.map((r) => {
            const swappable = host && !r.left; // anyone, a watcher or a bot too, may be swapped in // a bot may be swapped like anyone
            return (
              <li
                key={r.key}
                class={r.left ? "crew-row left" : "crew-row"}
                aria-current={r.you ? "true" : undefined}
              >
                {r.role ? (
                  <RoleShape role={r.role} size={20} />
                ) : (
                  <span class="no-shape" aria-hidden="true" />
                )}
                <span class="crew-who">
                  <span class="crew-name">
                    {r.name}
                    {r.you ? " (you)" : ""}
                    {r.bot ? " (bot)" : ""}
                  </span>
                  {r.role && <span class="crew-role">{ROLE_LABEL[r.role]}</span>}
                </span>
                <span class="crew-state">
                  {r.left
                    ? "Left the game"
                    : r.role === null
                      ? "Watching" // sitting out or a spectator: either way, not in this room
                      : r.ready
                        ? "Ready"
                        : "Not ready"}
                </span>
                {r.played.length > 0 && (
                  <span
                    class="pips"
                    role="img"
                    aria-label={`Played ${r.played.map((p) => ROLE_LABEL[p]).join(", ")}`}
                  >
                    {r.played.map((p, i) => (
                      <RoleShape key={`${p}${i}`} role={p} size={12} />
                    ))}
                  </span>
                )}
                {swappable && (
                  <button
                    type="button"
                    class={picked.includes(r.name) ? "btn selected" : "btn"}
                    aria-pressed={picked.includes(r.name)}
                    onClick={() => toggle(r.name)}
                  >
                    {picked.includes(r.name) ? "Selected" : "Select"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {host && (
          <div class="swap">
            {a && b ? (
              <>
                <p>{swapPrompt(a, b)}</p>
                <div class="actions">
                  <button
                    type="button"
                    class="btn primary"
                    onClick={() => {
                      onSwap(a, b);
                      setPicked([]);
                    }}
                  >
                    Swap roles
                  </button>
                  <button type="button" class="btn" onClick={() => setPicked([])}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <p class="muted">Swap roles: select two people.</p>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

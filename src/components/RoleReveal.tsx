import { honourLines } from "../client/honourLines.ts";
import { CHANNEL_RULES, type Family, ROLE_LABEL, type Role } from "../game/types.ts";
import type { CrewMember, LobbySettings } from "../net/protocol.ts";
import { RoleShape } from "./RoleShape.tsx";

const YOU: Record<Role, string> = {
  blind: "You can't see",
  deaf: "You can't hear",
  mute: "You can't speak",
};
const FAMILY_NAME: Record<Family, string> = { say: "Say", sound: "Sound", show: "Show" };
const FAMILIES: Family[] = ["say", "sound", "show"];

const list = (names: string[]): string => (names.length > 0 ? names.join(", ") : "nothing");

export function RoleReveal({
  name,
  index,
  role,
  crew,
  from,
  ready,
  onReady,
  lobbySettings,
}: {
  name: string;
  index: number;
  role: Role;
  crew: CrewMember[];
  from?: Role;
  ready: boolean;
  onReady: () => void;
  lobbySettings: LobbySettings;
}) {
  const send = FAMILIES.filter((f) => CHANNEL_RULES[f].send.includes(role)).map(
    (f) => FAMILY_NAME[f],
  );
  const receive = FAMILIES.filter((f) => CHANNEL_RULES[f].receive.includes(role)).map(
    (f) => FAMILY_NAME[f],
  );
  // a new room hands you a new role: the old shape turns into the new one
  const morphing = from !== undefined && from !== role;
  const others = crew.filter((c) => c.role !== role);
  return (
    <section class="reveal" aria-labelledby="reveal-title">
      <p class="muted">
        Room {index + 1}: {name}
      </p>
      <h1 id="reveal-title" class="reveal-title">
        {YOU[role]}
      </h1>
      <div
        class={morphing ? "reveal-shape morphing" : "reveal-shape"}
        style={{ "--role-colour": `var(--role-${role})` }}
      >
        {morphing && (
          <span class="reveal-from">
            <RoleShape role={from} size={96} />
          </span>
        )}
        <span class="reveal-to">
          <RoleShape role={role} size={96} />
        </span>
      </div>
      <dl class="reveal-facts">
        <div>
          <dt>You can send</dt>
          <dd>{list(send)}</dd>
        </div>
        <div>
          <dt>You receive</dt>
          <dd>{list(receive)}</dd>
        </div>
      </dl>
      <ul class="reveal-crew" aria-label="Your team">
        {others.map((c) => (
          <li key={c.seat}>
            <RoleShape role={c.role} size={20} />
            <span>
              {c.nickname}: {ROLE_LABEL[c.role].toLowerCase()}
            </span>
          </li>
        ))}
      </ul>
      {honourLines(lobbySettings).length > 0 && (
        <ul class="reveal-honour" aria-label="Real-life rules for this table">
          {honourLines(lobbySettings).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <button type="button" class="btn primary" onClick={onReady} disabled={ready}>
        {ready ? "Waiting for the others…" : "Ready"}
      </button>
    </section>
  );
}

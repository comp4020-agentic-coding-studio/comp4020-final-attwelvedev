import { roomTitle } from "../client/hud.ts";
import { CHANNEL_RULES, type Family, ROLE_LABEL, type Role } from "../game/types.ts";
import type { CrewMember } from "../net/protocol.ts";
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
  room,
  index,
  role,
  crew,
  ready,
  onReady,
}: {
  room: string;
  index: number;
  role: Role;
  crew: CrewMember[];
  ready: boolean;
  onReady: () => void;
}) {
  const send = FAMILIES.filter((f) => CHANNEL_RULES[f].send.includes(role)).map(
    (f) => FAMILY_NAME[f],
  );
  const receive = FAMILIES.filter((f) => CHANNEL_RULES[f].receive.includes(role)).map(
    (f) => FAMILY_NAME[f],
  );
  const others = crew.filter((c) => c.role !== role);
  return (
    <section class="reveal" aria-labelledby="reveal-title">
      <p class="muted">
        Room {index + 1}: {roomTitle(room)}
      </p>
      <h1 id="reveal-title" class="reveal-title">
        {YOU[role]}
      </h1>
      <div class="reveal-shape" style={{ "--role-colour": `var(--role-${role})` }}>
        <RoleShape role={role} size={96} />
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
      <button type="button" class="btn primary" onClick={onReady} disabled={ready}>
        {ready ? "Waiting for the others…" : "Ready"}
      </button>
    </section>
  );
}

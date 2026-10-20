import type { Seat } from "../game/types.ts";
import type { CrewMember, VoteKind } from "../net/protocol.ts";
import { countdown } from "./Disconnect.tsx";
import { RoleShape } from "./RoleShape.tsx";

export interface OpenVote {
  kind: VoteKind;
  by: string;
  until: number; // performance.now() at which it times out
  total: number; // how long it was given, for the bar
  yes: Seat[];
  no: Seat[];
  voters: Seat[];
}

export const WHAT: Record<VoteKind, string> = {
  room: "restart the room",
  heist: "restart the heist from room 1",
};

const YES: Record<VoteKind, string> = { room: "Restart room", heist: "Restart heist" };

// A card at the top centre of the map, not an overlay: people keep moving during a vote. It names
// each voter and what they have said (shape and words), counts the time down as a bar and a
// number, and asks only someone who may vote and has not. The proposer's yes is already counted.
export function VotePrompt({
  vote,
  seat,
  crew,
  secondsLeft,
  onCast,
}: {
  vote: OpenVote;
  seat: Seat | null;
  crew: CrewMember[];
  secondsLeft: number;
  onCast: (yes: boolean) => void;
}) {
  const answered = seat !== null && (vote.yes.includes(seat) || vote.no.includes(seat));
  const mayVote = seat !== null && vote.voters.includes(seat);
  const share = Math.max(0, Math.min(1, (secondsLeft * 1000) / vote.total));
  const said = (s: Seat) => (vote.yes.includes(s) ? "yes" : vote.no.includes(s) ? "no" : "waiting");
  return (
    <div class="vote-prompt" role="alertdialog" aria-labelledby="vote-title">
      <p id="vote-title" class="vote-title">
        <span>
          {vote.by} wants to {WHAT[vote.kind]}.
        </span>{" "}
        <span class="countdown" role="timer">
          {countdown(secondsLeft)}
        </span>
      </p>
      <ul class="vote-voters" aria-label="Votes">
        {crew
          .filter((c) => vote.voters.includes(c.seat))
          .map((c) => (
            <li key={c.seat} class={`said-${said(c.seat)}`}>
              <RoleShape role={c.role} size={14} />
              <span>{c.nickname}</span> <span class="vote-said">{said(c.seat)}</span>
            </li>
          ))}
      </ul>
      {mayVote && !answered && (
        <div class="vote-actions">
          <button type="button" class="btn primary" onClick={() => onCast(true)}>
            {YES[vote.kind]}
          </button>
          <button type="button" class="btn" onClick={() => onCast(false)}>
            Keep playing
          </button>
        </div>
      )}
      <div class="vote-bar" aria-hidden="true">
        <span style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
    </div>
  );
}

// The one line that says how a vote ended.
export function outcomeText(
  kind: VoteKind,
  result: "passed" | "declined" | "timeout",
  by?: string,
): string {
  if (result === "passed") return kind === "room" ? "Restarting the room." : "Back to room 1.";
  if (result === "declined") return `Not restarted: ${by ?? "someone"} kept playing.`;
  return "Not restarted: time ran out.";
}

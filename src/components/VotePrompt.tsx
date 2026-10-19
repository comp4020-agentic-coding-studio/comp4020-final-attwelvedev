import type { Seat } from "../game/types.ts";
import type { VoteKind } from "../net/protocol.ts";
import { countdown } from "./Disconnect.tsx";

export interface OpenVote {
  kind: VoteKind;
  by: string;
  until: number; // performance.now() at which it times out
  yes: Seat[];
  no: Seat[];
  voters: Seat[];
}

export const WHAT: Record<VoteKind, string> = {
  room: "restart the room",
  heist: "restart the heist from room 1",
};

// A small bar over the map, not an overlay: people keep moving during a vote. Temporary markup until
// Task 12 restyles it. The proposer's yes is already counted, so they only wait.
export function VotePrompt({
  vote,
  seat,
  secondsLeft,
  onCast,
}: {
  vote: OpenVote;
  seat: Seat | null;
  secondsLeft: number;
  onCast: (yes: boolean) => void;
}) {
  const answered = seat !== null && (vote.yes.includes(seat) || vote.no.includes(seat));
  const mayVote = seat !== null && vote.voters.includes(seat);
  return (
    <div class="vote-prompt" role="alertdialog" aria-labelledby="vote-title">
      <p id="vote-title">
        {vote.by} wants to {WHAT[vote.kind]}.{" "}
        <span class="countdown" role="timer">
          {countdown(secondsLeft)}
        </span>
      </p>
      {mayVote && !answered ? (
        <div class="vote-actions">
          <button type="button" class="btn primary" onClick={() => onCast(true)}>
            Yes
          </button>
          <button type="button" class="btn" onClick={() => onCast(false)}>
            No
          </button>
        </div>
      ) : (
        <p class="muted" role="status">
          {vote.yes.length} of {vote.voters.length} said yes
        </p>
      )}
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
  if (result === "declined") return by ? `${by} said no. Nothing restarts.` : "Someone said no.";
  return "No answer in time. Nothing restarts.";
}

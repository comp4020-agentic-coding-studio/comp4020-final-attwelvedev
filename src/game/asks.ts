import type { Seat } from "./types.ts";

// A bot's ask of a person (ADR 0031): what it needs, and how to send it. An ask is a private,
// per-seat view field (`you.asks`), never a channel message, so it reaches the asked seat only.
// Its copy is fixed and carries no game information: no digit, no value (BT2).
export type AskKind =
  | "stop-on-click"
  | "read-plate"
  | "plate-first"
  | "steer-me"
  | "press-marked"
  | "strike-marked"
  | "count-turn"
  | "taking-over";

export interface Ask {
  kind: AskKind;
  from: Seat;
  to: Seat;
  station?: string; // the bot's own bookkeeping: never sent to a client
  saidAt?: number; // game ms it was last said: the clock moves it, a view shows it as a tick
}

// `say` is what Can't see or Can't speak hears or reads, and always names the route; `chip` is the
// short sighted form.
export const ASK_COPY: Record<AskKind, { say: string; chip: string }> = {
  "stop-on-click": {
    say: "Listen for the click. Say Stop: wheel, Talk, Stop.",
    chip: "Needs: Stop on the click",
  },
  "read-plate": {
    say: "Read the plate and text me its number: open Text, type it, send.",
    chip: "Needs: the plate's number",
  },
  "plate-first": {
    say: "Read the braille plate first, then tell me what it says by text.",
    chip: "Needs: the plate read first",
  },
  "steer-me": {
    say: "Steer me: wheel, Talk, then Left, Right, Up or Down.",
    chip: "Needs: steering",
  },
  "press-marked": {
    say: "Press the marked button.",
    chip: "Needs: the marked button pressed",
  },
  "strike-marked": {
    say: "Strike the marked bell.",
    chip: "Needs: the marked bell struck",
  },
  "count-turn": {
    say: "Text me the count: type each number, one at a time.",
    chip: "Needs: the count, by text",
  },
  "taking-over": { say: "I'll do this one.", chip: "I'll do this one" },
};

export const REASK_MS = [8000, 16000, 30000] as const; // gaps after the 1st, 2nd and every later ask
export const ASK_QUIET_MS = 2000; // never within this of a message the bot has seen

export interface AskClock {
  firstAt: number;
  lastAt: number; // when it was last said
  count: number; // times said
  progressAt: number; // when the station last moved
}

// Is it time to say this ask again? The gap counts from the later of the last saying and the last
// progress; it holds while the person stands at the spot, and never lands in the quiet window.
export function reaskDue(c: AskClock, now: number, lastHeardAt: number, atSpot: boolean): boolean {
  if (atSpot) return false;
  if (now - lastHeardAt < ASK_QUIET_MS) return false;
  const gap = REASK_MS[Math.min(Math.max(c.count - 1, 0), REASK_MS.length - 1)];
  return now - Math.max(c.lastAt, c.progressAt) >= gap;
}

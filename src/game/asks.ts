import type { Seat } from "./types.ts";

// A bot's ask of a person (ADR 0031): what it needs, and how to send it. An ask is a private,
// per-seat view field (`you.asks`), never a channel message, so it reaches the asked seat only (Can't
// hear is asked by a Desperate face from the bot instead: Task 312).
// Its copy is fixed and carries no game information: no digit, no value (BT2).
export type AskKind =
  | "stop-on-click"
  | "read-plate"
  | "plate-first"
  | "steer-me"
  | "press-marked"
  | "strike-marked"
  | "count-turn"
  | "taking-over"
  | "hand-over-gear";

export interface Ask {
  kind: AskKind;
  from: Seat;
  to: Seat;
  station?: string; // the bot's own bookkeeping: never sent to a client
  saidAt?: number; // game ms it was last said: the clock moves it, a view shows it as a tick
}

// `say` is what Can't see hears or Can't speak reads, in the words a teammate would use; it names
// the route and carries no digit or value. `steer-me` and `count-turn` go to Can't hear only, who is
// asked by a Desperate face and gets no words: their `say` is a test fixture, never shown.
export const ASK_COPY: Record<AskKind, { say: string }> = {
  "stop-on-click": { say: "Listen for the click, then say Stop: wheel, Talk, Stop." },
  "read-plate": { say: "Read the plate and text me its number: Text, type it, send." },
  "plate-first": { say: "Read the braille plate first, then text me what it says." },
  "steer-me": { say: "Steer me: wheel, Talk, then Left, Right, Up or Down." },
  "press-marked": { say: "Press the marked button for me." },
  "strike-marked": { say: "Strike the marked bell for me." },
  "count-turn": { say: "Text me the count: type each number, one at a time." },
  "taking-over": { say: "I'll do this one." },
  "hand-over-gear": { say: "Pass me the gear: stand beside me and press G." },
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

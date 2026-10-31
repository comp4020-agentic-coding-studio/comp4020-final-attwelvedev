import type { WorldEvent } from "../game/sim/world.ts";
import { type Detail, redact, stdoutSink } from "./log.ts";
import { anon } from "./requestLog.ts";
import { sharedStats } from "./stats.ts";

// Later tasks widen this: "voice.latency" (21).
export type GameEvent =
  | "socket.open"
  | "socket.close"
  | "lobby.create"
  | "lobby.join"
  | "lobby.leave"
  | "lobby.nickname" // a person changed their name (the name is never logged)
  | "lobby.private" // the host made the lobby private or public (detail kind: on/off)
  | "lobby.order" // the host reordered the people
  | "lobby.setup" // a person answered their real-life setup (the answers are never logged)
  | "crew.swap" // the host swapped two people at a reveal
  | "spec.say" // a watcher said something to the other watchers (never what)
  | "host.pull" // the host pulled a sitting-out person in to take a seat
  | "vote.propose" // someone proposed restarting (detail kind: room or heist)
  | "vote.end" // the vote closed (detail kind and result)
  | "lobby.error"
  | "game.start"
  | "room.start"
  | "room.clear"
  | "channel.send"
  | "channel.refused"
  | "caught"
  | "pause" // a person's connection dropped mid-room and the game paused for them
  | "bot.takeover" // the host let a bot take a dropped seat
  | "run.saved" // a room or heist run was written to the leaderboard
  | "voice.latency" // a receiver's voice latency over the last few seconds (numbers only)
  | "station" // a station solved or answered wrong (detail kind only: never the answer)
  | "gear" // gear taken, given, dropped or put on a sill (detail kind)
  | "hold" // two players took or let go of hands (detail kind: on/off)
  | "signal" // the bell rung or the lamp flashed (detail kind: bell/lamp)
  | "practice" // a practice lever flipped (detail kind: on/off; never which lever)
  | "pull"; // a tug of war began between two hand-holders (no detail: who is never logged)

// One line per discrete thing a player did: never per tick. `who` is a device
// hash and `lobby` a hash of the lobby's code and age, so neither leads back to
// a person or to a code someone could type.
export interface GameLine {
  ts: string;
  kind: "game";
  event: GameEvent;
  who: string | null;
  lobby: string | null;
  detail?: Detail;
}

export const lobbyKey = (code: string, createdAt: number): string =>
  anon(`lobby:${code}:${createdAt}`);

export function describeGame(input: {
  event: GameEvent;
  who?: string | null;
  lobbyKey?: string | null;
  detail?: Record<string, unknown>;
  now?: number;
}): GameLine {
  const detail = redact(input.detail ?? {});
  const line: GameLine = {
    ts: new Date(input.now ?? Date.now()).toISOString(),
    kind: "game",
    event: input.event,
    who: input.who ?? null,
    lobby: input.lobbyKey ?? null,
  };
  if (Object.keys(detail).length) line.detail = detail;
  return line;
}

// Counts the event for /stats, then writes it to stdout.
export function logGame(input: Parameters<typeof describeGame>[0]): void {
  const line = describeGame(input);
  sharedStats().recordGame(line);
  stdoutSink(line);
}

// The game lines a tick's world events make: one per discrete thing done, with the kind of
// thing only. A station's turns and presses are not logged (one line per press would be a
// line per tick when someone mashes Act); its result is.
export interface EventLine {
  event: GameEvent;
  detail: { kind: string };
}

export function gameLinesFor(events: readonly WorldEvent[]): EventLine[] {
  return events.flatMap((e): EventLine[] => {
    if (e.kind === "station" && (e.result === "solved" || e.result === "wrong")) {
      return [{ event: "station", detail: { kind: e.result } }];
    }
    if (e.kind === "gear") return [{ event: "gear", detail: { kind: e.action } }];
    if (e.kind === "hold")
      return [{ event: "hold", detail: { kind: e.leader === null ? "off" : "on" } }];
    if (e.kind === "bell" || e.kind === "lamp")
      return [{ event: "signal", detail: { kind: e.kind } }];
    if (e.kind === "pull") return [{ event: "pull", detail: { kind: "tug" } }];
    if (e.kind === "lever") return [{ event: "practice", detail: { kind: e.on ? "on" : "off" } }];
    return [];
  });
}

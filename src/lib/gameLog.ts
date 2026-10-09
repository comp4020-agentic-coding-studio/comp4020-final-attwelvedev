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
  | "voice.latency"; // a receiver's voice latency over the last few seconds (numbers only)

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

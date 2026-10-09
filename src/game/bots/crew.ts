import { type ChannelMessage, type CooldownState, route } from "../channels.ts";
import { viewFor } from "../perception.ts";
import type { Room } from "../rooms/format.ts";
import type { World } from "../sim/world.ts";
import type { PlayerInput, Role, Seat } from "../types.ts";
import { type BotMemory, think } from "./brain.ts";

// The bots of one game: a memory and an inbox each. The inbox holds what the seat's
// role was sent since it last thought.
export interface BotSeat {
  memory: BotMemory;
  inbox: ChannelMessage[];
}

export interface BotSent {
  from: Seat;
  message: ChannelMessage;
  receivers: Seat[];
  cooldown: { family: "say" | "sound" | "show"; until: number } | null;
}

// One tick of every bot: each thinks from its own role's view, and what it says
// goes through `route`, the same rules and cooldowns a person is held to. The
// seat that cannot see goes last, so a callout sent this tick is heard this tick.
// Messages for bot seats are put in their inboxes; the caller forwards the rest.
export function botsAct(
  room: Room,
  world: World,
  roles: readonly [Role, Role, Role],
  bots: Partial<Record<Seat, BotSeat>>,
  cooldowns: CooldownState,
  now: number,
  nickname: (seat: Seat) => string,
  full: ReadonlySet<Seat> = new Set(),
): { inputs: Partial<Record<Seat, PlayerInput>>; sent: BotSent[]; refused: number } {
  const inputs: Partial<Record<Seat, PlayerInput>> = {};
  const sent: BotSent[] = [];
  let refused = 0;
  const order = ([0, 1, 2] as const)
    .filter((s) => bots[s])
    .sort((a, b) => Number(roles[a] === "blind") - Number(roles[b] === "blind") || a - b);
  for (const seat of order) {
    const bot = bots[seat] as BotSeat;
    const view = viewFor(world, seat, roles[seat], full.has(seat));
    const turn = think(room, view, bot.inbox.splice(0), bot.memory, now);
    inputs[seat] = turn.input;
    if (!turn.send) continue;
    const result = route(roles as [Role, Role, Role], seat, turn.send, cooldowns, now);
    if (!result.ok) {
      refused++;
      continue;
    }
    if (result.cooldownKey) cooldowns.until[result.cooldownKey] = result.until;
    const message = {
      ...turn.send,
      from: { seat, role: roles[seat], nickname: nickname(seat) },
      sentAt: now,
    } as ChannelMessage;
    for (const receiver of result.receivers) bots[receiver]?.inbox.push(message);
    sent.push({
      from: seat,
      message,
      receivers: result.receivers,
      cooldown: result.cooldownKey ? { family: turn.send.family, until: result.until } : null,
    });
  }
  return { inputs, sent, refused };
}

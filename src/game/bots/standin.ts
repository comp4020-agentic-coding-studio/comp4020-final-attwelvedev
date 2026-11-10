import type { ChannelMessage, Outgoing } from "../channels.ts";
import { TICK_MS } from "../sim/world.ts";
import type { Role, Seat } from "../types.ts";
import { createBotMemory } from "./brain.ts";
import type { BotSeat } from "./crew.ts";

// The stand-in person (BG1): the bot brain with a person's limits, so the rooms spec can ask
// "does this room clear with a person in one seat?" without a browser (ADR 0031).
export const STANDIN_DELAY_TICKS = 20; // about 1 s: how late a person reacts to what they are sent

// Signals a bot convention expects and a person has never been told to send. Until a bot asks
// for one (`you.asks`, phase 02), the stand-in never sends them.
export const SUPPRESSED_SIGNALS: { name: string; why: string; is: (o: Outgoing) => boolean }[] = [
  {
    name: "stop callout",
    why: "a person at a safe's dial is not told to call stop when the tumbler sounds",
    is: (o) => o.method === "callout" && o.callout === "stop",
  },
  {
    name: "digit text",
    why: "a plate, a keypad's code, the earpiece and the sync count are texted a digit only when asked",
    is: (o) => o.method === "text" && /^\d$/.test(o.text.trim()),
  },
  {
    name: "x mark",
    why: "a person is not told to mark the button a switches or bells watcher means",
    is: (o) => o.method === "mark" && o.id === "x",
  },
];

export function createStandIn(
  seat: Seat,
  humans: ReadonlySet<Seat>,
  roles: readonly [Role, Role, Role],
): BotSeat {
  const late: { due: number; msg: ChannelMessage }[] = [];
  return {
    memory: createBotMemory(seat, humans, roles),
    inbox: [],
    person: {
      hear(inbox, now) {
        for (const msg of inbox) late.push({ due: now + STANDIN_DELAY_TICKS * TICK_MS, msg });
        const ready: ChannelMessage[] = [];
        for (let i = 0; i < late.length; ) {
          if (late[i].due <= now) ready.push(...late.splice(i, 1).map((l) => l.msg));
          else i++;
        }
        return ready;
      },
      speak(send) {
        return send && SUPPRESSED_SIGNALS.some((s) => s.is(send)) ? null : send;
      },
    },
  };
}

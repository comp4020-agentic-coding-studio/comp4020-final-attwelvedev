import type { Ask, AskKind } from "../asks.ts";
import type { ChannelMessage, Outgoing } from "../channels.ts";
import { TICK_MS } from "../sim/world.ts";
import type { Role, Seat, Vec } from "../types.ts";
import { createBotMemory } from "./brain.ts";
import type { BotSeat } from "./crew.ts";

// The stand-in person (BG1): the bot brain with a person's limits, so the rooms spec can ask
// "does this room clear with a person in one seat?" without a browser (ADR 0031).
export const STANDIN_DELAY_TICKS = 20; // about 1 s: how late a person reacts to what they are sent

// Signals a bot convention expects and a person has never been told to send. The stand-in sends
// one only after a bot has asked for it (`you.asks`) and the ask has been live for the delay.
// A suppressed signal is sent only while one of the person's live asks has its `kind`.
export const SUPPRESSED_SIGNALS: {
  name: string;
  why: string;
  is: (o: Outgoing) => boolean;
  askedBy: AskKind[];
}[] = [
  {
    name: "stop callout",
    why: "a person at a safe's dial is not told to call stop when the tumbler sounds",
    is: (o) => o.method === "callout" && o.callout === "stop",
    askedBy: ["stop-on-click"],
  },
  {
    name: "digit text",
    why: "a plate, a keypad's code, the earpiece and the sync count are texted a digit only when asked",
    is: (o) => o.method === "text" && /^\d$/.test(o.text.trim()),
    askedBy: ["read-plate", "plate-first", "count-turn"], // (room 8's keypad has an earpiece clue: plate-first)
  },
  {
    name: "x mark",
    why: "a person is not told to mark the button a switches or bells watcher means",
    is: (o) => o.method === "mark" && o.id === "x",
    askedBy: ["press-marked", "strike-marked"],
  },
];

// A Can't hear stand-in is told no ask kind (Task 314, owner 2026-11-11): a Can't hear person is asked
// by a Desperate face popping over a bot, and has only that and their own view. The stand-in draws
// exactly two conclusions, both from what it sees:
//   - a Desperate face (f06) arrived from a bot, and the person has a number read and waiting to be
//     sent (a sync count, kept because nobody asked) or a mark they were about to make: it sends it;
//   - steering needs no conclusion: a person who sees a Can't see bot stand still steers it, which is
//     what the guide the brain runs already does for the Can't hear seat.
// With no face, or a face and nothing waiting, it does nothing. It cannot tell what the bot wants
// beyond that: a room that stalls for want of that knowledge is the finding (rooms-people NOT_YET).
export const FACE_LIVE_MS = 10_000; // a face stays a reason to send for about this long

const DIRS: Record<string, Vec> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

export function createStandIn(
  seat: Seat,
  humans: ReadonlySet<Seat>,
  roles: readonly [Role, Role, Role],
): BotSeat {
  const late: { due: number; msg: ChannelMessage }[] = [];
  // an ask is heard late like a message: it counts once it has been live for the delay
  const liveSince = new Map<AskKind, number>();
  const taps: { due: number; dir: Vec }[] = [];
  const deaf = roles[seat] === "deaf";
  let faceAt: number | null = null; // when a bot's Desperate face last reached this person
  // a Stop is a reaction to a sound (the tumbler): a person says it about a second after hearing it,
  // which is what the bot's late credit (BP2) is for. One is held at a time.
  let stopDue: number | null = null;
  // what a person has read and not yet been asked to send (a plate's digits): remembered, sent when asked
  const kept: Outgoing[] = [];
  return {
    memory: createBotMemory(seat, humans, roles),
    inbox: [],
    person: {
      hear(inbox, now) {
        const delay = STANDIN_DELAY_TICKS * TICK_MS;
        for (const msg of inbox) {
          if (msg.method === "face" && msg.id === "f06" && msg.from.seat !== seat) faceAt = now;
          // "Tap left." is words a person obeys with one short step that way (the guide's lining-up
          // taps). The blind brain reads callouts only, so the stand-in takes the step itself.
          const tap =
            msg.method === "text" ? /^tap (left|right|up|down)\.?$/i.exec(msg.text.trim()) : null;
          if (tap)
            taps.push({ due: now + delay, dir: DIRS[(tap[1] as string).toLowerCase()] as Vec });
          else late.push({ due: now + delay, msg });
        }
        const ready: ChannelMessage[] = [];
        for (let i = 0; i < late.length; ) {
          if (late[i].due <= now) ready.push(...late.splice(i, 1).map((l) => l.msg));
          else i++;
        }
        return ready;
      },
      move(input, now) {
        const i = taps.findIndex((t) => t.due <= now);
        if (i < 0) return input;
        const [tap] = taps.splice(i, 1);
        return { ...input, move: (tap as { dir: Vec }).dir };
      },
      speak(send, now, asks) {
        const unlocked = (askedBy: AskKind[]) =>
          deaf
            ? faceAt !== null && now - faceAt < FACE_LIVE_MS
            : askedBy.some(
                (k) =>
                  now - (liveSince.get(k) ?? Number.POSITIVE_INFINITY) >=
                  STANDIN_DELAY_TICKS * TICK_MS,
              );
        for (const kind of [...liveSince.keys()])
          if (!asks.some((a) => a.kind === kind)) liveSince.delete(kind);
        for (const a of asks) if (!liveSince.has(a.kind)) liveSince.set(a.kind, now);
        if (stopDue !== null && now >= stopDue) {
          stopDue = null;
          return { method: "callout", callout: "stop" };
        }
        const first = kept[0];
        const keptHeld = first ? SUPPRESSED_SIGNALS.find((s) => s.is(first)) : undefined;
        if (first && keptHeld && unlocked(keptHeld.askedBy)) {
          // (the kept signal waits a turn if the bot has something else to send)
          if (!send) return kept.shift() as Outgoing;
        }
        if (!send) return send;
        const held = SUPPRESSED_SIGNALS.find((s) => s.is(send));
        if (!held) return send;
        if (held.name === "stop callout") {
          if (!unlocked(held.askedBy)) return null;
          stopDue ??= now + STANDIN_DELAY_TICKS * TICK_MS;
          return null;
        }
        kept.push(send);
        return null;
      },
    },
  };
}

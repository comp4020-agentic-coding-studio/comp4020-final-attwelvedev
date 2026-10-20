import { canReceive, canSend, type Role } from "../game/types.ts";
import { PAGE_METHOD, PAGES, type Page } from "./wheel.ts";

// What a role sends and gets, by the wheel's pages, in the wheel's order: "talk, faces, clips,
// marks". The reveal names these and the wheel draws them, so the two can't disagree.
export const sendsOf = (role: Role): Page[] => PAGES.filter((p) => canSend(role, PAGE_METHOD[p]));

// Talk is the callout, text and voice together: a role gets the page if it receives any of them.
export const getsOf = (role: Role): Page[] => PAGES.filter((p) => canReceive(role, PAGE_METHOD[p]));

import type { CrewMember } from "../net/protocol.ts";
import { receiversOf } from "./wheel.ts";

// Who hears a wheel page, by name: the page's method decides (talk is the callout).
export function receiverNames(
  page: Page,
  crew: CrewMember[],
  me: number,
): { hear: string[]; cant: string[] } {
  const { hear, cant } = receiversOf(PAGE_METHOD[page], crew, me as 0 | 1 | 2);
  return { hear: hear.map((c) => c.nickname), cant: cant.map((c) => c.nickname) };
}

export interface CrewRow {
  key: string;
  name: string;
  role: Role | null; // null: sitting out
  ready: boolean;
  bot: boolean;
  left: boolean;
  you: boolean;
  played: Role[];
  watching?: true; // a spectator: in the lobby, but never in the room
}

// The reveal's crew column: this room's three seats, then the people sitting it out. A bot is
// always ready; a person who left shows as such until the host fills the seat.
export function crewRows(input: {
  crew: (CrewMember & { left?: true })[];
  ready: readonly number[];
  sittingOut: readonly string[];
  played: Record<string, Role[]>;
  me: number;
  watching?: readonly string[];
}): CrewRow[] {
  const seats = input.crew.map((c) => ({
    key: `seat${c.seat}`,
    name: c.nickname,
    role: c.role as Role | null,
    ready: input.ready.includes(c.seat),
    bot: c.bot,
    left: c.left === true,
    you: c.seat === input.me,
    played: input.played[c.nickname] ?? [],
  }));
  const out = input.sittingOut.map((name) => ({
    key: `out:${name}`,
    name,
    role: null,
    ready: false,
    bot: false,
    left: false,
    you: false,
    played: input.played[name] ?? [],
  }));
  const watching = (input.watching ?? []).map((name) => ({
    key: `watch:${name}`,
    name,
    role: null,
    ready: false,
    bot: false,
    left: false,
    you: false,
    played: [] as Role[],
    watching: true as const,
  }));
  return [...seats, ...out, ...watching];
}

export const swapPrompt = (a: string, b: string): string =>
  `Swap ${a} and ${b}? Swapping resets everyone to not ready.`;

// The one line under the reveal's button: the count while you have not pressed, and once you have,
// that you are ready and who you are waiting for. `waiting` is what makes it breathe.
export function readyStatus(input: { you: boolean; ready: number; total: number }): {
  text: string;
  waiting: boolean;
} {
  const { you, ready, total } = input;
  if (!you) return { text: `${ready} of ${total} ready`, waiting: false };
  if (ready >= total) return { text: "Everyone is ready", waiting: false };
  return { text: `You're ready. Waiting for the others · ${ready} of ${total}`, waiting: true };
}

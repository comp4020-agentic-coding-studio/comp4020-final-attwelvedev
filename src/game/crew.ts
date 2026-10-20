import { ROLES, type Role } from "./types.ts";

export const MAX_PEOPLE = 6; // people in a lobby; a room seats three of them

// Who plays a room, and as what. Pure, and importing only types.ts, so the lobby screen can show
// "plays N" from the same rule the server uses (ADR 0013).
export interface CrewPick {
  people: (number | null)[]; // people[seat]: the person's index in the lobby, or null for a bot
  roles: [Role, Role, Role];
}

// Seat i gets ROLES[(i + roomIndex) % 3], so three people play every role across three rooms.
export function rolesFor(roomIndex: number): [Role, Role, Role] {
  const role = (seat: number): Role => ROLES[(seat + roomIndex) % 3] as Role;
  return [role(0), role(1), role(2)];
}

const PERMUTATIONS: [number, number, number][] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

// Up to three people: seat i is person i and bots fill the rest, roles as `rolesFor` (so a
// three-person heist is unchanged). With more, the three who have played the fewest rooms play;
// a tie goes to whoever comes first in the starting order after the last room's crew (a room
// seats three, so room r's crew starts at 3r, wrapping), so play rotates through the list.
// Then the roles go where they repeat the fewest roles someone has already played, ties to
// `rolesFor` so a first room is the usual rotation.
export function pickCrew(
  people: readonly { played: readonly Role[] }[],
  roomIndex: number,
): CrewPick {
  const n = people.length;
  const base = rolesFor(roomIndex);
  if (n <= 3) {
    return { people: [0, 1, 2].map((i) => (i < n ? i : null)), roles: base };
  }
  const start = (3 * roomIndex) % n;
  const distance = (i: number) => (i - start + n) % n;
  const chosen = people
    .map((p, i) => ({ i, played: p.played.length }))
    .sort((a, b) => a.played - b.played || distance(a.i) - distance(b.i))
    .slice(0, 3)
    .map((c) => c.i)
    .sort((a, b) => distance(a) - distance(b));

  const repeats = (roles: readonly Role[]) =>
    chosen.reduce((sum, person, seat) => {
      return sum + (people[person]?.played.includes(roles[seat] as Role) ? 1 : 0);
    }, 0);
  let best = base;
  let bestCost = repeats(base);
  for (const order of PERMUTATIONS) {
    const roles = order.map((k) => ROLES[k] as Role) as [Role, Role, Role];
    const cost = repeats(roles);
    if (cost < bestCost) {
      best = roles;
      bestCost = cost;
    }
  }
  return { people: chosen, roles: best };
}

// A bot in the swap, named by its seat: a person is their index in the lobby (0 or more), a bot is
// -1 - seat, so the two can't be mixed up and the host may swap a bot like anyone else.
export const botRef = (seat: number): number => -1 - seat;

// The host's swap at a reveal. Two seated players or bots trade roles and keep their seats;
// someone sitting out takes a player's or a bot's seat and role (the displaced player sits out,
// a displaced bot is gone); two who are both out, or a bot ref that is not a bot, change nothing.
export function swapCrew(pick: CrewPick, a: number, b: number): CrewPick {
  const seatOf = (ref: number): number => {
    if (ref >= 0) return pick.people.indexOf(ref);
    const seat = -1 - ref;
    return pick.people[seat] === null ? seat : -1;
  };
  const seatA = seatOf(a);
  const seatB = seatOf(b);
  const people = [...pick.people];
  const roles = [...pick.roles] as [Role, Role, Role];
  const unseatedBot = (ref: number, seat: number) => ref < 0 && seat < 0;
  if (a === b || (seatA < 0 && seatB < 0) || unseatedBot(a, seatA) || unseatedBot(b, seatB)) {
    return { people, roles };
  }
  if (seatA >= 0 && seatB >= 0) {
    [roles[seatA], roles[seatB]] = [roles[seatB] as Role, roles[seatA] as Role];
  } else if (seatA >= 0) people[seatA] = b;
  else people[seatB] = a;
  return { people, roles };
}

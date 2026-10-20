import { pickCrew } from "../game/crew.ts";
import type { Role } from "../game/types.ts";

export interface Forecast {
  rooms: { playing: (number | null)[]; out: number[] }[]; // by room: person indexes (null: a bot) and who sits out
  plays: number[]; // by person: how many rooms they are in
}

// What the lobby's rotation table shows: each room's crew if nobody had played yet. A forecast
// only, since the reveal seats the real crew from who has actually played (ADR 0013).
export function forecast(peopleCount: number, roomCount: number): Forecast {
  const people = Array.from({ length: peopleCount }, () => ({ played: [] }));
  const plays = people.map(() => 0);
  const rooms = Array.from({ length: roomCount }, (_, index) => {
    const pick = pickCrew(people, index);
    for (const person of pick.people) {
      if (person !== null && plays[person] !== undefined) plays[person] += 1;
    }
    return {
      playing: pick.people,
      out: people.flatMap((_, i) => (pick.people.includes(i) ? [] : [i])),
    };
  });
  return { rooms, plays };
}

// The next room after `roomIndex` in which this person plays, counting rooms from 1, or null if the
// rotation does not reach them again. `people[i].played` is what each had played before the room in
// play now; the rooms are seated one by one, as the server does, so the answer follows who has played.
export function nextRoomFor(
  person: number,
  people: readonly { played: readonly Role[] }[],
  roomIndex: number,
  roomCount: number,
): number | null {
  const played = people.map((p) => [...p.played]);
  for (let room = roomIndex; room < roomCount; room++) {
    const pick = pickCrew(
      played.map((p) => ({ played: p })),
      room,
    );
    if (room > roomIndex && pick.people.includes(person)) return room + 1;
    pick.people.forEach((who, seat) => {
      if (who !== null) played[who]?.push(pick.roles[seat] as Role);
    });
  }
  return null;
}

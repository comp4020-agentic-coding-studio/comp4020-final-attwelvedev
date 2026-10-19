import { pickCrew } from "../game/crew.ts";

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

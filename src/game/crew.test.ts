import { describe, expect, it } from "vitest";
import { botRef, type CrewPick, pickCrew, rolesFor, swapCrew } from "./crew.ts";
import { ROLES, type Role } from "./types.ts";

const people = (n: number): { played: Role[] }[] =>
  Array.from({ length: n }, () => ({ played: [] }));

// Plays a heist of `rooms` rooms the way the server does: pick, then record who played what.
function playHeist(n: number, rooms: number): { picks: CrewPick[]; ppl: { played: Role[] }[] } {
  const ppl = people(n);
  const picks: CrewPick[] = [];
  for (let room = 0; room < rooms; room++) {
    const pick = pickCrew(ppl, room);
    picks.push(pick);
    for (const [seat, person] of pick.people.entries()) {
      if (person !== null) ppl[person]?.played.push(pick.roles[seat] as Role);
    }
  }
  return { picks, ppl };
}

describe("rolesFor", () => {
  it("gives seat i ROLES[(i + roomIndex) % 3], rotating each room", () => {
    expect(rolesFor(0)).toEqual(["blind", "deaf", "mute"]);
    expect(rolesFor(1)).toEqual(["deaf", "mute", "blind"]);
    expect(rolesFor(2)).toEqual(["mute", "blind", "deaf"]);
    expect(rolesFor(3)).toEqual(["blind", "deaf", "mute"]);
  });
});

describe("pickCrew with three people or fewer", () => {
  it("is today's rotation: seat i is person i, bots fill the rest", () => {
    for (let room = 0; room < 3; room++) {
      expect(pickCrew(people(3), room)).toEqual({ people: [0, 1, 2], roles: rolesFor(room) });
    }
    expect(pickCrew(people(1), 0)).toEqual({ people: [0, null, null], roles: rolesFor(0) });
    expect(pickCrew(people(2), 1)).toEqual({ people: [0, 1, null], roles: rolesFor(1) });
  });

  it("gives every one of three people every role over three rooms", () => {
    const { ppl } = playHeist(3, 3);
    for (const p of ppl) expect(new Set(p.played)).toEqual(new Set(ROLES));
  });
});

describe("pickCrew with four to six people", () => {
  it("seats the first three in the host's order in room 1", () => {
    for (const n of [4, 5, 6]) {
      expect(pickCrew(people(n), 0).people).toEqual([0, 1, 2]);
    }
  });

  it("with five people over four rooms, nobody plays more than one room more than anyone else", () => {
    const { ppl } = playHeist(5, 4);
    const plays = ppl.map((p) => p.played.length);
    expect(Math.max(...plays) - Math.min(...plays)).toBeLessThanOrEqual(1);
    expect(plays.reduce((a, b) => a + b, 0)).toBe(12);
  });

  it("with six people, the second room is the other three", () => {
    expect(pickCrew(playHeist(6, 1).ppl, 1).people.slice().sort()).toEqual([3, 4, 5]);
  });

  it("never repeats a role for someone while a role they haven't played is free to give them", () => {
    for (const n of [4, 5, 6]) {
      const ppl = people(n);
      for (let room = 0; room < 6; room++) {
        const pick = pickCrew(ppl, room);
        const repeats = pick.people.flatMap((person, seat) => {
          if (person === null) return [];
          const role = pick.roles[seat] as Role;
          return ppl[person]?.played.includes(role) ? [person] : [];
        });
        // a repeat is only allowed when it cannot be avoided: nobody else would do better
        const best = Math.min(
          ...permutations([...ROLES]).map((roles) =>
            pick.people.reduce<number>(
              (cost, person, seat) =>
                cost +
                (person !== null && ppl[person]?.played.includes(roles[seat] as Role) ? 1 : 0),
              0,
            ),
          ),
        );
        expect(repeats.length).toBe(best);
        for (const [seat, person] of pick.people.entries()) {
          if (person !== null) ppl[person]?.played.push(pick.roles[seat] as Role);
        }
      }
    }
  });

  it("has each of the three roles exactly once in a crew", () => {
    for (const pick of playHeist(5, 4).picks) {
      expect(new Set(pick.roles)).toEqual(new Set(ROLES));
    }
  });
});

describe("swapCrew", () => {
  const pick: CrewPick = { people: [0, 1, 2], roles: ["blind", "deaf", "mute"] };

  it("swaps the roles of two players, who keep their seats", () => {
    expect(swapCrew(pick, 0, 2)).toEqual({ people: [0, 1, 2], roles: ["mute", "deaf", "blind"] });
  });

  it("puts a sitting-out person in a player's seat, with that seat's role", () => {
    expect(swapCrew(pick, 1, 4)).toEqual({ people: [0, 4, 2], roles: ["blind", "deaf", "mute"] });
    expect(swapCrew(pick, 4, 1)).toEqual({ people: [0, 4, 2], roles: ["blind", "deaf", "mute"] });
  });

  it("changes nothing for two people sitting out, or the same person twice", () => {
    expect(swapCrew(pick, 3, 4)).toEqual(pick);
    expect(swapCrew(pick, 1, 1)).toEqual(pick);
  });

  it("swaps a player's role with a bot's, each keeping their seat", () => {
    const withBot: CrewPick = { people: [0, 1, null], roles: ["blind", "deaf", "mute"] };
    expect(swapCrew(withBot, 0, botRef(2))).toEqual({
      people: [0, 1, null],
      roles: ["mute", "deaf", "blind"],
    });
    expect(swapCrew(withBot, botRef(2), 1)).toEqual({
      people: [0, 1, null],
      roles: ["blind", "mute", "deaf"],
    });
  });

  it("puts a sitting-out person in a bot's seat, and the bot is gone", () => {
    const withBot: CrewPick = { people: [0, 1, null], roles: ["blind", "deaf", "mute"] };
    expect(swapCrew(withBot, 4, botRef(2))).toEqual({
      people: [0, 1, 4],
      roles: ["blind", "deaf", "mute"],
    });
  });

  it("swaps two bots' roles, and ignores a bot ref that is not a bot", () => {
    const two: CrewPick = { people: [0, null, null], roles: ["blind", "deaf", "mute"] };
    expect(swapCrew(two, botRef(1), botRef(2)).roles).toEqual(["blind", "mute", "deaf"]);
    expect(swapCrew(two, botRef(0), 1)).toEqual(two);
  });

  it("does not change the pick it was given", () => {
    swapCrew(pick, 0, 2);
    expect(pick).toEqual({ people: [0, 1, 2], roles: ["blind", "deaf", "mute"] });
  });
});

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

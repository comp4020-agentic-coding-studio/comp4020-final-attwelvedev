import { describe, expect, it } from "vitest";
import { parseRoom } from "./format.ts";
import { lintRoom } from "./lint.ts";

const header = (opensWhen = `["p1","p2","p3"]`, beatX = "[8,19]") =>
  `{"id":"t-room","name":"Test room","version":1,"beats":[{"name":"Three hands","x":${beatX},"intent":{"blind":"b","deaf":"d","mute":"m"}}],"objects":{"D1":{"opensWhen":${opensWhen}}}}`;

const GOOD = [
  "####################",
  "#1.#.........D...E.#",
  "#2.#....p....D.....#",
  "#3.B....p....D.....#",
  "#..#....p..........#",
  "####################",
];

const room = (grid = GOOD, head = header()) => parseRoom(`${head}\n---\n${grid.join("\n")}\n`);
const messages = (r = room()) => lintRoom(r).map((i) => i.message);

describe("lintRoom", () => {
  it("passes a good room", () => {
    expect(lintRoom(room())).toEqual([]);
  });

  it("names the room in every issue", () => {
    const bad = room(GOOD.map((r) => r.replace("E", ".")));
    expect(lintRoom(bad).every((i) => i.room === "t-room")).toBe(true);
  });

  it("flags a missing spawn", () => {
    expect(messages(room(GOOD.map((r) => r.replace("3", "."))))).toContainEqual(
      expect.stringMatching(/spawn 3/i),
    );
  });

  it("flags a duplicate spawn", () => {
    expect(messages(room(GOOD.map((r) => r.replace("#..#", "#1.#"))))).toContainEqual(
      expect.stringMatching(/spawn 1.*(more than once|duplicate)/i),
    );
  });

  it("flags a room with no exit", () => {
    expect(messages(room(GOOD.map((r) => r.replace("E", "."))))).toContainEqual(
      expect.stringMatching(/no exit/i),
    );
  });

  it("flags a door opensWhen that names an unknown id", () => {
    expect(messages(room(GOOD, header(`["p1","p2","p9"]`)))).toContainEqual(
      expect.stringMatching(/p9/),
    );
  });

  it("flags a door with no opensWhen", () => {
    const noOpens = `{"id":"t-room","name":"T","version":1,"beats":[{"name":"b","x":[8,19],"intent":{"blind":"b","deaf":"d","mute":"m"}}]}`;
    expect(messages(room(GOOD, noOpens))).toContainEqual(expect.stringMatching(/D1.*opensWhen/i));
  });

  it("flags a room with no beat whose door needs three plates (FR10)", () => {
    expect(messages(room(GOOD, header(`["p1","p2"]`)))).toContainEqual(
      expect.stringMatching(/three-plate|three plates|3 plates/i),
    );
    expect(messages(room(GOOD, header(`["p1","p2","p3"]`, "[0,5]")))).toContainEqual(
      expect.stringMatching(/three-plate|three plates|3 plates/i),
    );
  });

  it("flags a non-rectangular grid", () => {
    const ragged = [...GOOD];
    ragged[4] = "#..#....p.........#";
    expect(messages(room(ragged))).toContainEqual(expect.stringMatching(/rectang/i));
  });

  it("flags an exit unreachable from the spawns, assuming doors are open", () => {
    const walled = [...GOOD];
    walled[1] = "#1.#.........D#..E.#";
    walled[2] = "#2.#....p....D#....#";
    walled[3] = "#3.B....p....D#....#";
    walled[4] = "#..#....p.....#....#";
    expect(messages(room(walled))).toContainEqual(expect.stringMatching(/exit.*reach/i));
    // the same room with the wall opened is clean, so reachability goes through doors
    expect(messages(room())).toEqual([]);
  });
});

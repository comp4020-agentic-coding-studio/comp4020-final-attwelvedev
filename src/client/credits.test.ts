import { describe, expect, it } from "vitest";
import { creditRows } from "./credits.ts";

describe("creditRows", () => {
  const crew = [
    { nickname: "Ana", role: "blind" as const },
    { nickname: "Bo", role: "deaf" as const },
    { nickname: "Cy", role: "mute" as const },
  ];

  it("names each seat with its role and fills a {seat} token with that teammate's nickname", () => {
    expect(
      creditRows(
        [
          { seat: 0, lines: ["fetched {1}'s side job: the old key"] },
          { seat: 1, lines: ["side job: the old key (with {0})", "cracked the safe"] },
          { seat: 2, lines: ["kept the crew moving"] },
        ],
        crew,
      ),
    ).toEqual([
      { name: "Ana", role: "blind", lines: ["fetched Bo's side job: the old key"] },
      {
        name: "Bo",
        role: "deaf",
        lines: ["side job: the old key (with Ana)", "cracked the safe"],
      },
      { name: "Cy", role: "mute", lines: ["kept the crew moving"] },
    ]);
  });

  it("calls a token for a seat that is not in the crew 'a teammate'", () => {
    expect(
      creditRows([{ seat: 0, lines: ["with {2}"] }], [{ nickname: "Ana", role: "blind" }]),
    ).toEqual([{ name: "Ana", role: "blind", lines: ["with a teammate"] }]);
  });
});

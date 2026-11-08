import { describe, expect, it } from "vitest";
import { collect } from "./collect.ts";

const roles = ["blind", "deaf", "mute"];
const listing = ["run.json", "prior/0-home.txt", "prior/1-home.txt", "prior/2-home.txt"];
const files: Record<string, string> = {
  "run.json": JSON.stringify({ rooms: ["01-first-steps", "02-three-hands"] }),
  "prior/0-home.txt": "HOME0",
  "prior/1-home.txt": "HOME1",
  "prior/2-home.txt": "HOME2",
};
for (const room of ["01-first-steps", "02-three-hands"]) {
  for (const [i, role] of roles.entries()) {
    const width = role === "deaf" ? 375 : 1280;
    files[`${room}/prior/${role}-reveal.txt`] = `REVEAL ${role} ${room}`;
    listing.push(`${room}/prior/${role}-reveal.txt`);
    for (const beat of ["start", "1", "2", "end"]) {
      files[`${room}/${role}-${width}-${beat}.txt`] = `SEEN ${role} ${beat}`;
      listing.push(`${room}/${role}-${width}-${beat}.txt`, `${room}/${role}-${width}-${beat}.png`);
    }
    void i;
  }
}
const read = (p: string) => files[p] ?? "";

describe("collect", () => {
  const items = collect(listing, read, "01");
  it("gives 9 items for room 01: 3 roles x start, 1, 2, and no end", () => {
    expect(items).toHaveLength(9);
    expect(items.some((i) => i.beat === "end")).toBe(false);
  });
  it("makes a beat-1 file an item (the run shoots beat 1)", () => {
    expect(items.find((i) => i.role === "blind" && i.beat === "1")?.perceived).toBe("SEEN blind 1");
  });
  it("gives blind no screenshot, the sighted theirs, at the seat's width", () => {
    for (const i of items) {
      if (i.role === "blind") expect(i.screenshot).toBeUndefined();
      else expect(i.screenshot).toBe(`01-first-steps/${i.role}-${i.width}-${i.beat}.png`);
    }
    expect(items.find((i) => i.role === "deaf")?.width).toBe(375);
  });
  it("puts the seat's home and the room's reveal in prior", () => {
    const blind = items.find((i) => i.role === "blind");
    expect(blind?.prior).toContain("HOME0");
    expect(blind?.prior).toContain("REVEAL blind 01-first-steps");
    // room 01 is index 0: seat 1 is deaf
    expect(items.find((i) => i.role === "deaf")?.prior).toContain("HOME1");
  });
  it("rotates the seats' roles by room index", () => {
    const second = collect(listing, read, "02").find((i) => i.role === "blind");
    expect(second?.prior).toContain("HOME2");
  });
  it("collects every room when not filtered", () => {
    expect(collect(listing, read)).toHaveLength(18);
  });
});

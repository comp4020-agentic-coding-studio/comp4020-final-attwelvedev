import { describe, expect, it } from "vitest";
import { homePath, revealPath, shotStem } from "../evidence.ts";
import { collect } from "./collect.ts";

const roles = ["blind", "deaf", "mute"];
const listing = ["run.json"];
const files: Record<string, string> = {
  "run.json": JSON.stringify({ rooms: ["01-first-steps", "02-three-hands"] }),
};
// one rotation's evidence, as `pnpm playtest` writes it
function addRotation(rotation: number, phoneSeat: number) {
  for (const seat of [0, 1, 2]) {
    files[homePath(seat, rotation)] = `HOME${seat} r${rotation}`;
    listing.push(homePath(seat, rotation));
  }
  for (const room of ["01-first-steps", "02-three-hands"]) {
    for (const role of roles) {
      // room 01 is index 0: seat i plays roles[i]; room 02 rotates by one
      const seat = (roles.indexOf(role) + (room.startsWith("01") ? 0 : 2)) % 3;
      const width = seat === phoneSeat ? 375 : 1280;
      files[revealPath(room, role, rotation)] = `REVEAL ${role} ${room} r${rotation}`;
      listing.push(revealPath(room, role, rotation));
      for (const beat of ["start", "1", "2", "end"]) {
        const stem = `${room}/${shotStem(role, width, beat, rotation)}`;
        files[`${stem}.txt`] = `SEEN ${role} ${beat} r${rotation}`;
        listing.push(`${stem}.txt`, `${stem}.png`);
      }
    }
  }
}
addRotation(0, 1);
const read = (p: string) => files[p] ?? "";

describe("collect", () => {
  const items = collect(listing, read, "01");
  it("gives 9 items for room 01: 3 roles x start, 1, 2, and no end", () => {
    expect(items).toHaveLength(9);
    expect(items.some((i) => i.beat === "end")).toBe(false);
  });
  it("makes a beat-1 file an item (the run shoots beat 1)", () => {
    expect(items.find((i) => i.role === "blind" && i.beat === "1")?.perceived).toBe(
      "SEEN blind 1 r0",
    );
  });
  it("gives blind no screenshot, the sighted theirs, at the seat's width", () => {
    for (const i of items) {
      if (i.role === "blind") expect(i.screenshot).toBeUndefined();
      else expect(i.screenshot).toBe(`01-first-steps/${i.role}-${i.width}-r0-${i.beat}.png`);
    }
    expect(items.find((i) => i.role === "deaf")?.width).toBe(375);
  });
  it("puts the seat's home and the room's reveal in prior", () => {
    const blind = items.find((i) => i.role === "blind");
    expect(blind?.prior).toContain("HOME0 r0");
    expect(blind?.prior).toContain("REVEAL blind 01-first-steps r0");
    // room 01 is index 0: seat 1 is deaf
    expect(items.find((i) => i.role === "deaf")?.prior).toContain("HOME1 r0");
  });
  it("rotates the seats' roles by room index", () => {
    const second = collect(listing, read, "02").find((i) => i.role === "blind");
    expect(second?.prior).toContain("HOME2 r0");
  });
  it("collects every room when not filtered", () => {
    expect(collect(listing, read)).toHaveLength(18);
  });

  it("builds one item per rotation, each with its own seat's files", () => {
    addRotation(1, 0);
    const both = collect(listing, read, "01");
    expect(both).toHaveLength(18);
    const blind1 = both.filter((i) => i.role === "blind" && i.beat === "1");
    expect(blind1.map((i) => [i.rotation, i.width])).toEqual([
      [0, 1280],
      [1, 375],
    ]);
    expect(blind1[1]?.perceived).toBe("SEEN blind 1 r1");
    expect(blind1[1]?.prior).toContain("HOME0 r1");
    expect(blind1[1]?.prior).toContain("REVEAL blind 01-first-steps r1");
  });
});

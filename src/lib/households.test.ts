import { describe, expect, it } from "vitest";
import { openDb } from "./db.ts";
import { createHousehold, sessionForToken, ValidationError } from "./households.ts";

const input = { householdName: "Unit 4", memberName: "Sam" };

describe("createHousehold", () => {
  it("trims names", () => {
    const db = openDb(":memory:");
    const s = createHousehold(db, { householdName: "  Unit 4 ", memberName: " Sam  " });
    expect(s.household.name).toBe("Unit 4");
    expect(s.member.name).toBe("Sam");
    expect(s.member.householdId).toBe(s.household.id);
  });

  it.each([
    ["blank household", { ...input, householdName: "   " }],
    ["blank member", { ...input, memberName: "" }],
    ["household over 60 chars", { ...input, householdName: "x".repeat(61) }],
    ["member over 60 chars", { ...input, memberName: "x".repeat(61) }],
  ])("rejects a %s", (_label, bad) => {
    expect(() => createHousehold(openDb(":memory:"), bad)).toThrow(ValidationError);
  });

  it("accepts names of exactly 60 chars", () => {
    const s = createHousehold(openDb(":memory:"), {
      householdName: "x".repeat(60),
      memberName: "y".repeat(60),
    });
    expect(s.household.name).toHaveLength(60);
  });

  it("stores only the hash of the device token", async () => {
    const db = openDb(":memory:");
    const { deviceToken } = createHousehold(db, input);
    const { hashToken } = await import("./session.ts");
    const { deviceTokens } = await import("./schema.ts");
    const rows = db.select().from(deviceTokens).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(hashToken(deviceToken));
    for (const value of Object.values(rows[0])) expect(value).not.toBe(deviceToken);
  });

  it("makes invite codes shaped WORD-NN that are unique across 200 creations", () => {
    const db = openDb(":memory:");
    const codes = Array.from(
      { length: 200 },
      () => createHousehold(db, input).household.inviteCode,
    );
    for (const code of codes) expect(code).toMatch(/^[A-Z]+-\d{2}$/);
    expect(new Set(codes).size).toBe(200);
  });
});

describe("sessionForToken", () => {
  it("returns the same member and household for the raw token", () => {
    const db = openDb(":memory:");
    const created = createHousehold(db, input);
    const found = sessionForToken(db, created.deviceToken);
    expect(found?.member).toEqual(created.member);
    expect(found?.household).toEqual(created.household);
  });

  it("returns null for an unknown token", () => {
    const db = openDb(":memory:");
    createHousehold(db, input);
    expect(sessionForToken(db, "not-a-real-token")).toBeNull();
  });
});

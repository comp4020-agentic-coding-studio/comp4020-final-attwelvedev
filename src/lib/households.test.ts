import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { openDb } from "./db.ts";
import {
  createDeviceLink,
  createHousehold,
  createInviteLink,
  DEVICE_LINK_TTL_MS,
  INVITE_LINK_TTL_MS,
  joinByCode,
  joinByLink,
  leaveHousehold,
  listMembers,
  previewDeviceLink,
  previewInviteLink,
  redeemDeviceLink,
  removeMember,
  sessionForToken,
  ValidationError,
} from "./households.ts";
import { addItem, listHistory, listPantry, NotFoundError, recordOutcome } from "./items.ts";
import { deviceLinks, households, inviteLinks, members } from "./schema.ts";
import { hashToken } from "./session.ts";

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

const NOW = 1_800_000_000_000;

function setup() {
  const db = openDb(":memory:");
  const sam = createHousehold(db, { householdName: "Unit 4", memberName: "Sam" });
  return { db, sam };
}

describe("createInviteLink", () => {
  it("returns a 22-character base64url token that expires after the TTL", () => {
    const { db, sam } = setup();
    const link = createInviteLink(db, sam, NOW);
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(link.expiresAt).toBe(NOW + INVITE_LINK_TTL_MS);
    expect(INVITE_LINK_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("stores only a hash, and mints a different token each time", () => {
    const { db, sam } = setup();
    const a = createInviteLink(db, sam, NOW);
    const b = createInviteLink(db, sam, NOW);
    expect(a.token).not.toBe(b.token);
    const rows = db.select().from(inviteLinks).all();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      for (const value of Object.values(row)) {
        expect(value).not.toBe(a.token);
        expect(value).not.toBe(b.token);
      }
    }
    expect(rows.map((r) => r.tokenHash)).toContain(hashToken(a.token));
  });
});

describe("previewInviteLink", () => {
  it("returns the household for a valid token", () => {
    const { db, sam } = setup();
    const { token } = createInviteLink(db, sam, NOW);
    expect(previewInviteLink(db, token, NOW)?.id).toBe(sam.household.id);
  });

  it("returns null for an unknown token and past expiry", () => {
    const { db, sam } = setup();
    const { token, expiresAt } = createInviteLink(db, sam, NOW);
    expect(previewInviteLink(db, "nope", NOW)).toBeNull();
    expect(previewInviteLink(db, token, expiresAt - 1)).not.toBeNull();
    expect(previewInviteLink(db, token, expiresAt)).toBeNull();
  });
});

describe("joinByLink", () => {
  it("adds a trimmed member to the link's household and returns a working token", () => {
    const { db, sam } = setup();
    const { token } = createInviteLink(db, sam, NOW);
    const joined = joinByLink(db, { token, memberName: "  Alex " }, NOW);
    expect(joined.member.name).toBe("Alex");
    expect(joined.household.id).toBe(sam.household.id);
    expect(sessionForToken(db, joined.deviceToken)?.member.id).toBe(joined.member.id);
  });

  it("works more than once", () => {
    const { db, sam } = setup();
    const { token } = createInviteLink(db, sam, NOW);
    joinByLink(db, { token, memberName: "Alex" }, NOW);
    joinByLink(db, { token, memberName: "Jo" }, NOW);
    expect(listMembers(db, sam.household.id)).toHaveLength(3);
  });

  it("throws NotFoundError for unknown or expired links", () => {
    const { db, sam } = setup();
    const { token, expiresAt } = createInviteLink(db, sam, NOW);
    expect(() => joinByLink(db, { token: "nope", memberName: "Alex" }, NOW)).toThrow(NotFoundError);
    expect(() => joinByLink(db, { token, memberName: "Alex" }, expiresAt)).toThrow(NotFoundError);
  });

  it.each([
    ["blank", "  "],
    ["61 characters", "x".repeat(61)],
  ])("rejects a %s name and adds no member", (_label, memberName) => {
    const { db, sam } = setup();
    const { token } = createInviteLink(db, sam, NOW);
    expect(() => joinByLink(db, { token, memberName }, NOW)).toThrow(ValidationError);
    expect(listMembers(db, sam.household.id)).toHaveLength(1);
  });
});

describe("joinByCode", () => {
  it("matches the code however it is typed", () => {
    const { db, sam } = setup();
    const code = sam.household.inviteCode;
    const lower = code.toLowerCase();
    const spaced = ` ${code.replace("-", " ")} `;
    for (const typed of [code, lower, spaced]) {
      const joined = joinByCode(db, { code: typed, memberName: "Alex" });
      expect(joined.household.id).toBe(sam.household.id);
    }
    expect(listMembers(db, sam.household.id)).toHaveLength(4);
  });

  it("throws NotFoundError for an unknown code and ValidationError for a blank name", () => {
    const { db, sam } = setup();
    expect(() => joinByCode(db, { code: "NOPE-00", memberName: "Alex" })).toThrow(NotFoundError);
    expect(() => joinByCode(db, { code: sam.household.inviteCode, memberName: " " })).toThrow(
      ValidationError,
    );
  });
});

describe("device links", () => {
  it("redeeming gives the same member a new working token", () => {
    const { db, sam } = setup();
    const link = createDeviceLink(db, sam, NOW);
    expect(link.expiresAt).toBe(NOW + DEVICE_LINK_TTL_MS);
    expect(DEVICE_LINK_TTL_MS).toBe(10 * 60 * 1000);
    const redeemed = redeemDeviceLink(db, link.token, NOW);
    expect(redeemed.member.id).toBe(sam.member.id);
    expect(redeemed.deviceToken).not.toBe(sam.deviceToken);
    expect(sessionForToken(db, redeemed.deviceToken)?.member.id).toBe(sam.member.id);
    expect(listMembers(db, sam.household.id)).toHaveLength(1);
  });

  it("is single use", () => {
    const { db, sam } = setup();
    const { token } = createDeviceLink(db, sam, NOW);
    redeemDeviceLink(db, token, NOW);
    expect(() => redeemDeviceLink(db, token, NOW)).toThrow(NotFoundError);
  });

  it("works at expiresAt - 1 and fails at expiresAt", () => {
    const { db, sam } = setup();
    const a = createDeviceLink(db, sam, NOW);
    const b = createDeviceLink(db, sam, NOW);
    expect(() => redeemDeviceLink(db, a.token, a.expiresAt)).toThrow(NotFoundError);
    expect(redeemDeviceLink(db, b.token, b.expiresAt - 1).member.id).toBe(sam.member.id);
  });

  it("previews the member without using the link up", () => {
    const { db, sam } = setup();
    const { token, expiresAt } = createDeviceLink(db, sam, NOW);
    expect(previewDeviceLink(db, token, NOW)?.id).toBe(sam.member.id);
    expect(previewDeviceLink(db, token, NOW)?.id).toBe(sam.member.id);
    expect(previewDeviceLink(db, "nope", NOW)).toBeNull();
    expect(previewDeviceLink(db, token, expiresAt)).toBeNull();
    redeemDeviceLink(db, token, NOW);
    expect(previewDeviceLink(db, token, NOW)).toBeNull();
  });

  it("throws NotFoundError for an unknown token and stores only a hash", () => {
    const { db, sam } = setup();
    expect(() => redeemDeviceLink(db, "nope", NOW)).toThrow(NotFoundError);
    const { token } = createDeviceLink(db, sam, NOW);
    const [row] = db.select().from(deviceLinks).all();
    expect(row.tokenHash).toBe(hashToken(token));
    for (const value of Object.values(row)) expect(value).not.toBe(token);
  });
});

describe("listMembers", () => {
  it("lists oldest first", () => {
    const { db, sam } = setup();
    const { token } = createInviteLink(db, sam, NOW);
    const alex = joinByLink(db, { token, memberName: "Alex" }, NOW);
    db.update(members).set({ createdAt: 1 }).where(eq(members.id, alex.member.id)).run();
    expect(listMembers(db, sam.household.id).map((m) => m.name)).toEqual(["Alex", "Sam"]);
  });
});

describe("removeMember", () => {
  function twoMembers() {
    const { db, sam } = setup();
    const { token } = createInviteLink(db, sam, NOW);
    const alex = joinByLink(db, { token, memberName: "Alex" }, NOW);
    return { db, sam, alex };
  }

  it("deletes the member and their device tokens, keeping the rest", () => {
    const { db, sam, alex } = twoMembers();
    const result = removeMember(db, sam, alex.member.id);
    expect(result).toEqual({
      member: alex.member,
      householdDeleted: false,
      communityLeaves: [],
    });
    expect(sessionForToken(db, alex.deviceToken)).toBeNull();
    expect(sessionForToken(db, sam.deviceToken)).not.toBeNull();
    expect(listMembers(db, sam.household.id).map((m) => m.name)).toEqual(["Sam"]);
  });

  it("keeps items and history, with the removed member's name now null", () => {
    const { db, sam, alex } = twoMembers();
    const item = addItem(db, alex, "milk");
    recordOutcome(db, alex, item.id, "used");
    addItem(db, sam, "eggs");
    removeMember(db, sam, alex.member.id);
    expect(listPantry(db, sam.household.id).map((i) => i.name)).toEqual(["eggs"]);
    const [entry] = listHistory(db, sam.household.id);
    expect(entry.memberId).toBe(alex.member.id);
    expect(entry.memberName).toBeNull();
  });

  it("throws NotFoundError for an unknown id or another household's member, changing nothing", () => {
    const { db, sam } = twoMembers();
    const other = createHousehold(db, { householdName: "Other", memberName: "Zed" });
    expect(() => removeMember(db, sam, "nope")).toThrow(NotFoundError);
    expect(() => removeMember(db, sam, other.member.id)).toThrow(NotFoundError);
    expect(sessionForToken(db, other.deviceToken)).not.toBeNull();
    expect(listMembers(db, sam.household.id)).toHaveLength(2);
  });

  it("lets you remove yourself", () => {
    const { db, sam } = twoMembers();
    const result = removeMember(db, sam, sam.member.id);
    expect(result.householdDeleted).toBe(false);
    expect(sessionForToken(db, sam.deviceToken)).toBeNull();
  });

  it("removes a removed member's unredeemed device link", () => {
    const { db, sam, alex } = twoMembers();
    const link = createDeviceLink(db, alex, NOW);
    removeMember(db, sam, alex.member.id);
    expect(() => redeemDeviceLink(db, link.token, NOW)).toThrow(NotFoundError);
  });
});

describe("removing or leaving as the last member", () => {
  function deletedHousehold(how: "remove" | "leave") {
    const { db, sam } = setup();
    const other = createHousehold(db, { householdName: "Other", memberName: "Zed" });
    const item = addItem(db, sam, "milk");
    recordOutcome(db, sam, item.id, "used");
    addItem(db, other, "tea");
    const invite = createInviteLink(db, sam, NOW);
    const device = createDeviceLink(db, sam, NOW);
    const result = how === "leave" ? leaveHousehold(db, sam) : removeMember(db, sam, sam.member.id);
    return { db, sam, other, invite, device, result };
  }

  it.each(["remove", "leave"] as const)("%s deletes the household and everything in it", (how) => {
    const { db, sam, other, invite, device, result } = deletedHousehold(how);
    expect(result.householdDeleted).toBe(true);
    expect(result.member.id).toBe(sam.member.id);
    expect(db.select().from(households).where(eq(households.id, sam.household.id)).all()).toEqual(
      [],
    );
    expect(listPantry(db, sam.household.id)).toEqual([]);
    expect(listHistory(db, sam.household.id)).toEqual([]);
    expect(db.select().from(inviteLinks).all()).toEqual([]);
    expect(db.select().from(deviceLinks).all()).toEqual([]);
    expect(previewInviteLink(db, invite.token, NOW)).toBeNull();
    expect(() => redeemDeviceLink(db, device.token, NOW)).toThrow(NotFoundError);
    expect(() => joinByCode(db, { code: sam.household.inviteCode, memberName: "X" })).toThrow(
      NotFoundError,
    );
    expect(listPantry(db, other.household.id)).toHaveLength(1);
  });

  it("leaving with others present keeps the household", () => {
    const { db, sam } = setup();
    const { token } = createInviteLink(db, sam, NOW);
    const alex = joinByLink(db, { token, memberName: "Alex" }, NOW);
    const result = leaveHousehold(db, alex);
    expect(result).toEqual({
      member: alex.member,
      householdDeleted: false,
      communityLeaves: [],
    });
    expect(listMembers(db, sam.household.id).map((m) => m.name)).toEqual(["Sam"]);
  });
});

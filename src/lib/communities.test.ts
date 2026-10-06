import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  COMMUNITY_LINK_TTL_MS,
  communityIdsFor,
  createCommunity,
  createCommunityLink,
  getCommunity,
  joinCommunityByCode,
  joinCommunityByLink,
  leaveCommunity,
  listMyCommunities,
  previewCommunityLink,
  removeHouseholdFromCommunity,
} from "./communities.ts";
import { openDb } from "./db.ts";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors.ts";
import { createHousehold, removeMember, type Session } from "./households.ts";
import { communities, communityHouseholds, communityLinks } from "./schema.ts";
import { hashToken } from "./session.ts";

function setup() {
  const db = openDb(":memory:");
  const household = (name: string): Session =>
    createHousehold(db, { householdName: name, memberName: `${name} member` });
  return { db, household };
}

describe("createCommunity", () => {
  it("trims the name, makes the creator household the first member, and gives a WORD-NN code", () => {
    const { db, household } = setup();
    const unit4 = household("Unit 4");
    const c = createCommunity(db, unit4, "  Elm Street ");
    expect(c.name).toBe("Elm Street");
    expect(c.creatorHouseholdId).toBe(unit4.household.id);
    expect(c.joinCode).toMatch(/^[A-Z]+-\d{2}$/);
    const rows = db.select().from(communityHouseholds).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ householdId: unit4.household.id, displayName: "Unit 4" });
  });

  it.each([
    ["blank", "   "],
    ["over 60 characters", "x".repeat(61)],
  ])("rejects a name that is %s", (_, name) => {
    const { db, household } = setup();
    expect(() => createCommunity(db, household("Unit 4"), name)).toThrow(ValidationError);
  });

  it("gives every community its own code", () => {
    const { db, household } = setup();
    const s = household("Unit 4");
    const codes = new Set(Array.from({ length: 20 }, () => createCommunity(db, s, "C").joinCode));
    expect(codes.size).toBe(20);
  });
});

describe("display names", () => {
  it("suffixes a clash with the smallest free number, ignoring case", () => {
    const { db, household } = setup();
    const c = createCommunity(db, household("Unit 4"), "Elm");
    const second = joinCommunityByCode(db, household("Unit 4"), c.joinCode);
    const third = joinCommunityByCode(db, household("unit 4"), c.joinCode);
    expect(second.household.displayName).toBe("Unit 4 · 2");
    expect(third.household.displayName).toBe("unit 4 · 3");
  });

  it("does not rename anyone when an earlier household leaves", () => {
    const { db, household } = setup();
    const first = household("Unit 4");
    const c = createCommunity(db, first, "Elm");
    const second = household("Unit 4");
    joinCommunityByCode(db, second, c.joinCode);
    leaveCommunity(db, first, c.id);
    expect(getCommunity(db, second.household.id, c.id).households[0].displayName).toBe(
      "Unit 4 · 2",
    );
  });
});

describe("joinCommunityByCode", () => {
  it("accepts a normalised code", () => {
    const { db, household } = setup();
    const c = createCommunity(db, household("A"), "Elm");
    const join = joinCommunityByCode(
      db,
      household("B"),
      ` ${c.joinCode.toLowerCase().replace("-", " ")} `,
    );
    expect(join.joined).toBe(true);
    expect(join.community.id).toBe(c.id);
  });

  it("is NotFoundError for an unknown code", () => {
    const { db, household } = setup();
    expect(() => joinCommunityByCode(db, household("A"), "NOPE-00")).toThrow(NotFoundError);
  });

  it("is idempotent: joining twice reports joined false and keeps one row", () => {
    const { db, household } = setup();
    const b = household("B");
    const c = createCommunity(db, household("A"), "Elm");
    joinCommunityByCode(db, b, c.joinCode);
    expect(joinCommunityByCode(db, b, c.joinCode).joined).toBe(false);
    expect(db.select().from(communityHouseholds).all()).toHaveLength(2);
  });

  it("lets one household be in two communities", () => {
    const { db, household } = setup();
    const b = household("B");
    const c1 = createCommunity(db, household("A"), "Elm");
    const c2 = createCommunity(db, household("C"), "Oak");
    joinCommunityByCode(db, b, c1.joinCode);
    joinCommunityByCode(db, b, c2.joinCode);
    expect(communityIdsFor(db, b.household.id).sort()).toEqual([c1.id, c2.id].sort());
    // same-millisecond joins tie, so pin the join times to check the order
    for (const [c, joinedAt] of [
      [c2, 1],
      [c1, 2],
    ] as const) {
      db.update(communityHouseholds)
        .set({ joinedAt })
        .where(
          and(
            eq(communityHouseholds.communityId, c.id),
            eq(communityHouseholds.householdId, b.household.id),
          ),
        )
        .run();
    }
    expect(listMyCommunities(db, b.household.id).map((c) => c.name)).toEqual(["Oak", "Elm"]);
  });
});

describe("community links", () => {
  it("can be minted only by a member", () => {
    const { db, household } = setup();
    const c = createCommunity(db, household("A"), "Elm");
    expect(() => createCommunityLink(db, household("B"), c.id)).toThrow(NotFoundError);
  });

  it("previews and joins until it expires, reusably, and stores only a hash", () => {
    const { db, household } = setup();
    const a = household("A");
    const c = createCommunity(db, a, "Elm");
    const now = 1_000_000;
    const { token, expiresAt } = createCommunityLink(db, a, c.id, now);
    expect(expiresAt).toBe(now + COMMUNITY_LINK_TTL_MS);
    expect(COMMUNITY_LINK_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);

    expect(previewCommunityLink(db, token, now)).toEqual({ id: c.id, name: "Elm" });
    expect(joinCommunityByLink(db, household("B"), token, now).joined).toBe(true);
    expect(joinCommunityByLink(db, household("C"), token, now + 1).joined).toBe(true);

    expect(previewCommunityLink(db, token, expiresAt)).toBeNull();
    expect(() => joinCommunityByLink(db, household("D"), token, expiresAt)).toThrow(NotFoundError);
    expect(previewCommunityLink(db, "bogus", now)).toBeNull();

    const [row] = db.select().from(communityLinks).all();
    expect(row.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
  });
});

describe("leaveCommunity", () => {
  it("is NotFoundError for a household that is not a member", () => {
    const { db, household } = setup();
    const c = createCommunity(db, household("A"), "Elm");
    expect(() => leaveCommunity(db, household("B"), c.id)).toThrow(NotFoundError);
  });

  it("passes the creator role to the earliest joined household", () => {
    const { db, household } = setup();
    const a = household("A");
    const c = createCommunity(db, a, "Elm");
    const b = household("B");
    const d = household("D");
    joinCommunityByCode(db, b, c.joinCode);
    joinCommunityByCode(db, d, c.joinCode);
    db.update(communityHouseholds)
      .set({ joinedAt: 5 })
      .where(eq(communityHouseholds.householdId, d.household.id))
      .run();
    db.update(communityHouseholds)
      .set({ joinedAt: 9 })
      .where(eq(communityHouseholds.householdId, b.household.id))
      .run();
    const leave = leaveCommunity(db, a, c.id);
    expect(leave).toMatchObject({
      community: { id: c.id, name: "Elm" },
      householdId: a.household.id,
      communityDeleted: false,
      creatorHouseholdId: d.household.id,
    });
    expect(getCommunity(db, d.household.id, c.id).isCreator).toBe(true);
  });

  it("keeps the creator when a non-creator leaves", () => {
    const { db, household } = setup();
    const a = household("A");
    const b = household("B");
    const c = createCommunity(db, a, "Elm");
    joinCommunityByCode(db, b, c.joinCode);
    expect(leaveCommunity(db, b, c.id).creatorHouseholdId).toBe(a.household.id);
  });

  it("deletes the community when the last household leaves", () => {
    const { db, household } = setup();
    const a = household("A");
    const c = createCommunity(db, a, "Elm");
    const leave = leaveCommunity(db, a, c.id);
    expect(leave).toMatchObject({ communityDeleted: true, creatorHouseholdId: null });
    expect(db.select().from(communities).all()).toEqual([]);
  });

  it("leaving one community keeps the other", () => {
    const { db, household } = setup();
    const b = household("B");
    const c1 = createCommunity(db, b, "Elm");
    const c2 = createCommunity(db, b, "Oak");
    leaveCommunity(db, b, c1.id);
    expect(communityIdsFor(db, b.household.id)).toEqual([c2.id]);
  });
});

describe("removeHouseholdFromCommunity", () => {
  it("lets only the creator household remove another", () => {
    const { db, household } = setup();
    const a = household("A");
    const b = household("B");
    const c = createCommunity(db, a, "Elm");
    joinCommunityByCode(db, b, c.joinCode);
    expect(() => removeHouseholdFromCommunity(db, b, c.id, a.household.id)).toThrow(ForbiddenError);
    const leave = removeHouseholdFromCommunity(db, a, c.id, b.household.id);
    expect(leave.householdId).toBe(b.household.id);
    expect(communityIdsFor(db, b.household.id)).toEqual([]);
  });

  it("refuses to remove your own household, and an unknown one", () => {
    const { db, household } = setup();
    const a = household("A");
    const c = createCommunity(db, a, "Elm");
    expect(() => removeHouseholdFromCommunity(db, a, c.id, a.household.id)).toThrow(
      ValidationError,
    );
    expect(() => removeHouseholdFromCommunity(db, a, c.id, "nobody")).toThrow(NotFoundError);
  });

  it("is NotFoundError for a caller who is not in the community", () => {
    const { db, household } = setup();
    const a = household("A");
    const c = createCommunity(db, a, "Elm");
    expect(() => removeHouseholdFromCommunity(db, household("B"), c.id, a.household.id)).toThrow(
      NotFoundError,
    );
  });
});

describe("getCommunity", () => {
  it("is NotFoundError for a non-member and lists households oldest first", () => {
    const { db, household } = setup();
    const a = household("A");
    const c = createCommunity(db, a, "Elm");
    const b = household("B");
    joinCommunityByCode(db, b, c.joinCode);
    // same-millisecond joins tie, so pin the join times to check the order
    db.update(communityHouseholds)
      .set({ joinedAt: 1 })
      .where(eq(communityHouseholds.householdId, a.household.id))
      .run();
    db.update(communityHouseholds)
      .set({ joinedAt: 2 })
      .where(eq(communityHouseholds.householdId, b.household.id))
      .run();
    expect(() => getCommunity(db, household("Z").household.id, c.id)).toThrow(NotFoundError);
    const got = getCommunity(db, a.household.id, c.id);
    expect(got.isCreator).toBe(true);
    expect(got.households.map((h) => h.displayName)).toEqual(["A", "B"]);
  });
});

describe("a household deleted with its last member", () => {
  it("leaves every community: the survivor gets a new creator, an empty one is deleted", () => {
    const { db, household } = setup();
    const a = household("A");
    const b = household("B");
    const shared = createCommunity(db, a, "Shared");
    const alone = createCommunity(db, a, "Alone");
    joinCommunityByCode(db, b, shared.joinCode);

    const result = removeMember(db, a, a.member.id);
    expect(result.householdDeleted).toBe(true);
    const byId = Object.fromEntries(result.communityLeaves.map((l) => [l.community.id, l]));
    expect(byId[shared.id]).toMatchObject({
      communityDeleted: false,
      creatorHouseholdId: b.household.id,
    });
    expect(byId[alone.id]).toMatchObject({ communityDeleted: true, creatorHouseholdId: null });
    expect(getCommunity(db, b.household.id, shared.id).isCreator).toBe(true);
    expect(
      db
        .select()
        .from(communities)
        .all()
        .map((r) => r.id),
    ).toEqual([shared.id]);
  });
});

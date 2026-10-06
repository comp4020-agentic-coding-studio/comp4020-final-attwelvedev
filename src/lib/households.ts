import { randomUUID } from "node:crypto";
import { and, asc, count, eq, gt, isNull } from "drizzle-orm";
import { newCode, normaliseCode } from "./codes.ts";
import { type CommunityLeave, leaveAllCommunities } from "./communities.ts";
import type { Db, Tx } from "./db.ts";
import { NotFoundError, ValidationError } from "./errors.ts";
import { deviceLinks, deviceTokens, households, inviteLinks, members } from "./schema.ts";
import { hashToken, newDeviceToken, newLinkToken } from "./session.ts";

export { ValidationError };

export interface Household {
  id: string;
  name: string;
  inviteCode: string;
  createdAt: number;
}
export interface Member {
  id: string;
  householdId: string;
  name: string;
  createdAt: number;
}
export interface Session {
  member: Member;
  household: Household;
}

export const INVITE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const DEVICE_LINK_TTL_MS = 10 * 60 * 1000;

const MAX_NAME = 60;

// A Household is these columns only: the pickup note is offers' business and
// must not ride along in every session.
const householdColumns = {
  id: households.id,
  name: households.name,
  inviteCode: households.inviteCode,
  createdAt: households.createdAt,
};
const SEEN_EVERY_MS = 60 * 60 * 1000;

export function cleanName(raw: string, label: string): string {
  const name = raw.trim();
  if (!name) throw new ValidationError(`${label} can't be blank.`);
  if (name.length > MAX_NAME) {
    throw new ValidationError(`${label} must be ${MAX_NAME} characters or fewer.`);
  }
  return name;
}

// Inserts a member and the first device token for them. Shared by creating a
// household and joining one, so both sign a person in the same way.
function insertMember(
  tx: Tx,
  household: Household,
  memberName: string,
  now: number,
): Session & { deviceToken: string } {
  const member: Member = {
    id: randomUUID(),
    householdId: household.id,
    name: memberName,
    createdAt: now,
  };
  tx.insert(members).values(member).run();
  return { household, member, deviceToken: insertDeviceToken(tx, member.id, now) };
}

function insertDeviceToken(tx: Tx, memberId: string, now: number): string {
  const deviceToken = newDeviceToken();
  tx.insert(deviceTokens)
    .values({ tokenHash: hashToken(deviceToken), memberId, createdAt: now, lastSeenAt: now })
    .run();
  return deviceToken;
}

export function createHousehold(
  db: Db,
  input: { householdName: string; memberName: string },
): Session & { deviceToken: string } {
  const householdName = cleanName(input.householdName, "Household name");
  const memberName = cleanName(input.memberName, "Your name");
  const now = Date.now();

  return db.transaction((tx) => {
    const household: Household = {
      id: randomUUID(),
      name: householdName,
      inviteCode: newCode(
        (code) =>
          !!tx
            .select({ id: households.id })
            .from(households)
            .where(eq(households.inviteCode, code))
            .get(),
      ),
      createdAt: now,
    };
    tx.insert(households).values(household).run();
    return insertMember(tx, household, memberName, now);
  });
}

export function joinByCode(
  db: Db,
  input: { code: string; memberName: string },
): Session & { deviceToken: string } {
  const memberName = cleanName(input.memberName, "Your name");
  return db.transaction((tx) => {
    const household = tx
      .select(householdColumns)
      .from(households)
      .where(eq(households.inviteCode, normaliseCode(input.code)))
      .get();
    if (!household) throw new NotFoundError("No household has that code.");
    return insertMember(tx, household, memberName, Date.now());
  });
}

// Minted on demand and stored hashed, so the page can show a link only once.
// The household's own invite code is the permanent way in.
export function createInviteLink(
  db: Db,
  session: Session,
  now = Date.now(),
): { token: string; expiresAt: number } {
  const token = newLinkToken();
  const expiresAt = now + INVITE_LINK_TTL_MS;
  db.insert(inviteLinks)
    .values({
      tokenHash: hashToken(token),
      householdId: session.household.id,
      createdBy: session.member.id,
      createdAt: now,
      expiresAt,
    })
    .run();
  return { token, expiresAt };
}

export function previewInviteLink(db: Db, token: string, now = Date.now()): Household | null {
  const row = db
    .select({ household: householdColumns })
    .from(inviteLinks)
    .innerJoin(households, eq(households.id, inviteLinks.householdId))
    .where(and(eq(inviteLinks.tokenHash, hashToken(token)), gt(inviteLinks.expiresAt, now)))
    .get();
  return row?.household ?? null;
}

export function joinByLink(
  db: Db,
  input: { token: string; memberName: string },
  now = Date.now(),
): Session & { deviceToken: string } {
  const memberName = cleanName(input.memberName, "Your name");
  return db.transaction((tx) => {
    const household = previewInviteLink(tx, input.token, now);
    if (!household) throw new NotFoundError("That invite link is unknown or has expired.");
    return insertMember(tx, household, memberName, now);
  });
}

export function createDeviceLink(
  db: Db,
  session: Session,
  now = Date.now(),
): { token: string; expiresAt: number } {
  const token = newLinkToken();
  const expiresAt = now + DEVICE_LINK_TTL_MS;
  db.insert(deviceLinks)
    .values({ tokenHash: hashToken(token), memberId: session.member.id, createdAt: now, expiresAt })
    .run();
  return { token, expiresAt };
}

// Who a device link would sign in as, without using it up: the confirm page
// names the member before anything is redeemed (a prefetch must not burn it).
export function previewDeviceLink(db: Db, token: string, now = Date.now()): Member | null {
  const row = db
    .select({ member: members })
    .from(deviceLinks)
    .innerJoin(members, eq(members.id, deviceLinks.memberId))
    .where(
      and(
        eq(deviceLinks.tokenHash, hashToken(token)),
        isNull(deviceLinks.usedAt),
        gt(deviceLinks.expiresAt, now),
      ),
    )
    .get();
  return row?.member ?? null;
}

// Single use: the first redeem marks it used, and a second finds nothing.
export function redeemDeviceLink(
  db: Db,
  token: string,
  now = Date.now(),
): Session & { deviceToken: string } {
  return db.transaction((tx) => {
    const tokenHash = hashToken(token);
    const row = tx
      .select({ member: members, household: householdColumns })
      .from(deviceLinks)
      .innerJoin(members, eq(members.id, deviceLinks.memberId))
      .innerJoin(households, eq(households.id, members.householdId))
      .where(
        and(
          eq(deviceLinks.tokenHash, tokenHash),
          isNull(deviceLinks.usedAt),
          gt(deviceLinks.expiresAt, now),
        ),
      )
      .get();
    if (!row) throw new NotFoundError("That device link is unknown, expired or already used.");
    tx.update(deviceLinks).set({ usedAt: now }).where(eq(deviceLinks.tokenHash, tokenHash)).run();
    const deviceToken = insertDeviceToken(tx, row.member.id, now);
    return { member: row.member, household: row.household, deviceToken };
  });
}

export function listMembers(db: Db, householdId: string): Member[] {
  return db
    .select()
    .from(members)
    .where(eq(members.householdId, householdId))
    .orderBy(asc(members.createdAt), asc(members.id))
    .all();
}

// Deleting the member cascades to their device tokens and device links, so
// their next request is simply signed out. If they were the last member the
// household goes too, with its items, history and links.
export interface MemberRemoval {
  member: Member;
  householdDeleted: boolean;
  // the communities a deleted household left, for the endpoint to publish
  communityLeaves: CommunityLeave[];
}

export function removeMember(db: Db, session: Session, memberId: string): MemberRemoval {
  return db.transaction((tx) => {
    const member = tx
      .select()
      .from(members)
      .where(and(eq(members.id, memberId), eq(members.householdId, session.household.id)))
      .get();
    if (!member) throw new NotFoundError("No such member.");
    tx.delete(members).where(eq(members.id, member.id)).run();
    const left = tx
      .select({ n: count() })
      .from(members)
      .where(eq(members.householdId, session.household.id))
      .get();
    const householdDeleted = (left?.n ?? 0) === 0;
    let communityLeaves: CommunityLeave[] = [];
    if (householdDeleted) {
      communityLeaves = leaveAllCommunities(tx, session.household.id);
      tx.delete(households).where(eq(households.id, session.household.id)).run();
    }
    return { member, householdDeleted, communityLeaves };
  });
}

export function leaveHousehold(db: Db, session: Session): MemberRemoval {
  return removeMember(db, session, session.member.id);
}

// Resolves a raw cookie value to who it belongs to, or null. A token that
// doesn't match is simply no session. Records the device as seen at most once
// an hour, so reads don't turn into a write per request.
export function sessionForToken(db: Db, token: string): Session | null {
  const tokenHash = hashToken(token);
  const row = db
    .select({
      member: members,
      household: householdColumns,
      lastSeenAt: deviceTokens.lastSeenAt,
    })
    .from(deviceTokens)
    .innerJoin(members, eq(members.id, deviceTokens.memberId))
    .innerJoin(households, eq(households.id, members.householdId))
    .where(eq(deviceTokens.tokenHash, tokenHash))
    .get();
  if (!row) return null;

  const now = Date.now();
  if (now - row.lastSeenAt >= SEEN_EVERY_MS) {
    db.update(deviceTokens)
      .set({ lastSeenAt: now })
      .where(eq(deviceTokens.tokenHash, tokenHash))
      .run();
  }
  return { member: row.member, household: row.household };
}

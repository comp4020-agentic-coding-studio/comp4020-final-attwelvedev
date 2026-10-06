import { randomUUID } from "node:crypto";
import { and, asc, count, eq, gt } from "drizzle-orm";
import { newCode, normaliseCode } from "./codes.ts";
import type { Db, Tx } from "./db.ts";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors.ts";
import { cleanName, type Session } from "./households.ts";
import { type OfferChange, retargetOnLeave } from "./offers.ts";
import { communities, communityHouseholds, communityLinks } from "./schema.ts";
import { hashToken, newLinkToken } from "./session.ts";

export interface Community {
  id: string;
  name: string;
  joinCode: string;
  creatorHouseholdId: string;
  createdAt: number;
}
export interface CommunityHousehold {
  householdId: string;
  displayName: string;
  joinedAt: number;
}
export interface MyCommunity extends Community {
  households: number;
  displayName: string;
}
export interface CommunityJoin {
  community: Community;
  joined: boolean;
  household: { id: string; displayName: string };
}
export interface CommunityLeave {
  community: { id: string; name: string };
  householdId: string;
  communityDeleted: boolean;
  creatorHouseholdId: string | null;
  // what leaving did to the household's offers and claims here
  offerChanges: OfferChange[];
}

export const COMMUNITY_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const communityColumns = {
  id: communities.id,
  name: communities.name,
  joinCode: communities.joinCode,
  creatorHouseholdId: communities.creatorHouseholdId,
  createdAt: communities.createdAt,
};

function membership(tx: Db | Tx, communityId: string, householdId: string) {
  return tx
    .select()
    .from(communityHouseholds)
    .where(
      and(
        eq(communityHouseholds.communityId, communityId),
        eq(communityHouseholds.householdId, householdId),
      ),
    )
    .get();
}

// A household's name, or "<name> · N" with the smallest free N from 2 when
// another household in the community already shows it (ignoring case).
function displayNameFor(tx: Db | Tx, communityId: string, householdName: string): string {
  const shown = new Set(
    tx
      .select({ name: communityHouseholds.displayName })
      .from(communityHouseholds)
      .where(eq(communityHouseholds.communityId, communityId))
      .all()
      .map((row) => row.name.toLowerCase()),
  );
  if (!shown.has(householdName.toLowerCase())) return householdName;
  for (let n = 2; ; n++) {
    const candidate = `${householdName} · ${n}`;
    if (!shown.has(candidate.toLowerCase())) return candidate;
  }
}

function joinInto(tx: Tx, session: Session, community: Community, now: number): CommunityJoin {
  const existing = membership(tx, community.id, session.household.id);
  if (existing) {
    return {
      community,
      joined: false,
      household: { id: existing.householdId, displayName: existing.displayName },
    };
  }
  const displayName = displayNameFor(tx, community.id, session.household.name);
  tx.insert(communityHouseholds)
    .values({
      communityId: community.id,
      householdId: session.household.id,
      joinedAt: now,
      displayName,
    })
    .run();
  return { community, joined: true, household: { id: session.household.id, displayName } };
}

export function createCommunity(db: Db, session: Session, name: string): Community {
  const cleaned = cleanName(name, "Community name");
  const now = Date.now();
  return db.transaction((tx) => {
    const community: Community = {
      id: randomUUID(),
      name: cleaned,
      joinCode: newCode(
        (code) =>
          !!tx
            .select({ id: communities.id })
            .from(communities)
            .where(eq(communities.joinCode, code))
            .get(),
      ),
      creatorHouseholdId: session.household.id,
      createdAt: now,
    };
    tx.insert(communities).values(community).run();
    joinInto(tx, session, community, now);
    return community;
  });
}

export function joinCommunityByCode(db: Db, session: Session, code: string): CommunityJoin {
  return db.transaction((tx) => {
    const community = tx
      .select(communityColumns)
      .from(communities)
      .where(eq(communities.joinCode, normaliseCode(code)))
      .get();
    if (!community) throw new NotFoundError("No community has that code.");
    return joinInto(tx, session, community, Date.now());
  });
}

export function joinCommunityByLink(
  db: Db,
  session: Session,
  token: string,
  now = Date.now(),
): CommunityJoin {
  return db.transaction((tx) => {
    const row = tx
      .select(communityColumns)
      .from(communityLinks)
      .innerJoin(communities, eq(communities.id, communityLinks.communityId))
      .where(and(eq(communityLinks.tokenHash, hashToken(token)), gt(communityLinks.expiresAt, now)))
      .get();
    if (!row) throw new NotFoundError("That community link is unknown or has expired.");
    return joinInto(tx, session, row, now);
  });
}

// Minted on demand and stored hashed, so the page can show a link only once.
export function createCommunityLink(
  db: Db,
  session: Session,
  communityId: string,
  now = Date.now(),
): { token: string; expiresAt: number } {
  if (!membership(db, communityId, session.household.id)) {
    throw new NotFoundError("No such community.");
  }
  const token = newLinkToken();
  const expiresAt = now + COMMUNITY_LINK_TTL_MS;
  db.insert(communityLinks)
    .values({
      tokenHash: hashToken(token),
      communityId,
      createdBy: session.member.id,
      createdAt: now,
      expiresAt,
    })
    .run();
  return { token, expiresAt };
}

export function previewCommunityLink(
  db: Db,
  token: string,
  now = Date.now(),
): { id: string; name: string } | null {
  const row = db
    .select({ id: communities.id, name: communities.name })
    .from(communityLinks)
    .innerJoin(communities, eq(communities.id, communityLinks.communityId))
    .where(and(eq(communityLinks.tokenHash, hashToken(token)), gt(communityLinks.expiresAt, now)))
    .get();
  return row ?? null;
}

// Oldest joined first.
export function listMyCommunities(db: Db, householdId: string): MyCommunity[] {
  const mine = db
    .select({ ...communityColumns, displayName: communityHouseholds.displayName })
    .from(communityHouseholds)
    .innerJoin(communities, eq(communities.id, communityHouseholds.communityId))
    .where(eq(communityHouseholds.householdId, householdId))
    .orderBy(asc(communityHouseholds.joinedAt), asc(communities.createdAt), asc(communities.id))
    .all();
  return mine.map((c) => ({
    ...c,
    households:
      db
        .select({ n: count() })
        .from(communityHouseholds)
        .where(eq(communityHouseholds.communityId, c.id))
        .get()?.n ?? 0,
  }));
}

export function getCommunity(
  db: Db,
  householdId: string,
  communityId: string,
): { community: Community; households: CommunityHousehold[]; isCreator: boolean } {
  if (!membership(db, communityId, householdId)) throw new NotFoundError("No such community.");
  const community = db
    .select(communityColumns)
    .from(communities)
    .where(eq(communities.id, communityId))
    .get();
  if (!community) throw new NotFoundError("No such community.");
  const households = db
    .select({
      householdId: communityHouseholds.householdId,
      displayName: communityHouseholds.displayName,
      joinedAt: communityHouseholds.joinedAt,
    })
    .from(communityHouseholds)
    .where(eq(communityHouseholds.communityId, communityId))
    .orderBy(asc(communityHouseholds.joinedAt), asc(communityHouseholds.householdId))
    .all();
  return { community, households, isCreator: community.creatorHouseholdId === householdId };
}

export function communityIdsFor(db: Db, householdId: string): string[] {
  return listMyCommunities(db, householdId).map((c) => c.id);
}

// Removes the household, hands the creator role to the earliest remaining
// household if it was theirs, and deletes the community when it is empty.
function leave(tx: Tx, communityId: string, householdId: string): CommunityLeave {
  const community = tx
    .select({ id: communities.id, name: communities.name, creator: communities.creatorHouseholdId })
    .from(communities)
    .where(eq(communities.id, communityId))
    .get();
  if (!community) throw new NotFoundError("No such community.");
  // before the membership row goes: the display name there is still needed
  const offerChanges = retargetOnLeave(tx, householdId, communityId);
  tx.delete(communityHouseholds)
    .where(
      and(
        eq(communityHouseholds.communityId, communityId),
        eq(communityHouseholds.householdId, householdId),
      ),
    )
    .run();
  const next = tx
    .select({ householdId: communityHouseholds.householdId })
    .from(communityHouseholds)
    .where(eq(communityHouseholds.communityId, communityId))
    .orderBy(asc(communityHouseholds.joinedAt), asc(communityHouseholds.householdId))
    .get();
  const summary = { id: community.id, name: community.name };
  if (!next) {
    tx.delete(communities).where(eq(communities.id, communityId)).run();
    return {
      community: summary,
      householdId,
      communityDeleted: true,
      creatorHouseholdId: null,
      offerChanges,
    };
  }
  let creatorHouseholdId = community.creator;
  if (creatorHouseholdId === householdId) {
    creatorHouseholdId = next.householdId;
    tx.update(communities).set({ creatorHouseholdId }).where(eq(communities.id, communityId)).run();
  }
  return {
    community: summary,
    householdId,
    communityDeleted: false,
    creatorHouseholdId,
    offerChanges,
  };
}

export function leaveCommunity(db: Db, session: Session, communityId: string): CommunityLeave {
  return db.transaction((tx) => {
    if (!membership(tx, communityId, session.household.id)) {
      throw new NotFoundError("No such community.");
    }
    return leave(tx, communityId, session.household.id);
  });
}

export function removeHouseholdFromCommunity(
  db: Db,
  session: Session,
  communityId: string,
  householdId: string,
): CommunityLeave {
  return db.transaction((tx) => {
    if (!membership(tx, communityId, session.household.id)) {
      throw new NotFoundError("No such community.");
    }
    const community = tx
      .select({ creator: communities.creatorHouseholdId })
      .from(communities)
      .where(eq(communities.id, communityId))
      .get();
    if (community?.creator !== session.household.id) {
      throw new ForbiddenError("Only the creator household can remove a household.");
    }
    if (householdId === session.household.id) {
      throw new ValidationError("To remove your own household, leave the community.");
    }
    if (!membership(tx, communityId, householdId)) throw new NotFoundError("No such household.");
    return leave(tx, communityId, householdId);
  });
}

// Used when a household is deleted with its last member: it goes from every
// community first, so none is left pointing at it.
export function leaveAllCommunities(tx: Tx, householdId: string): CommunityLeave[] {
  return tx
    .select({ communityId: communityHouseholds.communityId })
    .from(communityHouseholds)
    .where(eq(communityHouseholds.householdId, householdId))
    .orderBy(asc(communityHouseholds.joinedAt), asc(communityHouseholds.communityId))
    .all()
    .map((row) => leave(tx, row.communityId, householdId));
}

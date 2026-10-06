import { sql } from "drizzle-orm";
import {
  blob,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Times are epoch milliseconds. A device token is stored only as its hash.

export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  createdAt: integer("created_at").notNull(),
  // what an offer's note starts as; the first note posted becomes it
  defaultPickupNote: text("default_pickup_note"),
});

export const members = sqliteTable("members", {
  id: text("id").primaryKey(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const deviceTokens = sqliteTable("device_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  memberId: text("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  createdAt: integer("created_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
});

// An item with removed_at set is out of the pantry. Undo clears it and
// deletes the history row.
export const items = sqliteTable("items", {
  id: text("id").primaryKey(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdBy: text("created_by").references(() => members.id, { onDelete: "set null" }),
  createdAt: integer("created_at").notNull(),
  removedAt: integer("removed_at"),
});

// item_id and item_name are copied, not referenced: the record outlives the
// item row, and the member can leave without erasing what they did.
export const history = sqliteTable("history", {
  id: text("id").primaryKey(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  itemId: text("item_id").notNull(),
  itemName: text("item_name").notNull(),
  outcome: text("outcome", { enum: ["used", "binned", "given"] }).notNull(),
  memberId: text("member_id"),
  at: integer("at").notNull(),
});

// Invite links are minted on demand, stored as hashes and reusable until they
// expire, so the page can show one only once.
export const inviteLinks = sqliteTable("invite_links", {
  tokenHash: text("token_hash").primaryKey(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  createdBy: text("created_by").references(() => members.id, { onDelete: "set null" }),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

// A device link signs one more device in as an existing member, once.
export const deviceLinks = sqliteTable("device_links", {
  tokenHash: text("token_hash").primaryKey(),
  memberId: text("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
});

// A community is a set of households that can see each other's offers. The
// creator is a household, and the role passes on when it leaves. The centre and
// radius stay empty until communities get a map area.
export const communities = sqliteTable("communities", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  joinCode: text("join_code").notNull().unique(),
  creatorHouseholdId: text("creator_household_id")
    .notNull()
    .references(() => households.id),
  createdAt: integer("created_at").notNull(),
  centreLat: real("centre_lat"),
  centreLng: real("centre_lng"),
  radiusM: integer("radius_m"),
});

// display_name is the household's name, suffixed when another household in the
// community already shows it. It is fixed when the household joins.
export const communityHouseholds = sqliteTable(
  "community_households",
  {
    communityId: text("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    joinedAt: integer("joined_at").notNull(),
    displayName: text("display_name").notNull(),
  },
  (t) => [primaryKey({ columns: [t.communityId, t.householdId] })],
);

// Like invite_links: minted on demand, stored hashed, reusable until they expire.
export const communityLinks = sqliteTable("community_links", {
  tokenHash: text("token_hash").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  createdBy: text("created_by").references(() => members.id, { onDelete: "set null" }),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

// An item has at most one open (offered or claimed) offer, enforced by the
// partial unique index. claimed_community_id fixes the display names both
// sides see for the life of a claim. The note reaches only the claimer.
export const offers = sqliteTable(
  "offers",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    pickupNote: text("pickup_note").notNull(),
    status: text("status", { enum: ["offered", "claimed", "collected", "withdrawn"] }).notNull(),
    claimedByHouseholdId: text("claimed_by_household_id").references(() => households.id, {
      onDelete: "set null",
    }),
    claimedCommunityId: text("claimed_community_id").references(() => communities.id, {
      onDelete: "set null",
    }),
    claimedAt: integer("claimed_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("offers_one_open_per_item")
      .on(t.itemId)
      .where(sql`${t.status} in ('offered', 'claimed')`),
  ],
);

export const offerTargets = sqliteTable(
  "offer_targets",
  {
    offerId: text("offer_id")
      .notNull()
      .references(() => offers.id, { onDelete: "cascade" }),
    communityId: text("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.offerId, t.communityId] })],
);

// A passkey signs a member in on a device with no cookie (the sign-in mints a
// new device token). Only the public half is stored: the credential id, its
// public key, the signature counter and how to reach the authenticator.
export const passkeys = sqliteTable("passkeys", {
  credentialId: text("credential_id").primaryKey(), // base64url
  memberId: text("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  publicKey: blob("public_key", { mode: "buffer" }).notNull(),
  counter: integer("counter").notNull(),
  transports: text("transports"), // JSON array, or null
  createdAt: integer("created_at").notNull(),
  lastUsedAt: integer("last_used_at"),
});

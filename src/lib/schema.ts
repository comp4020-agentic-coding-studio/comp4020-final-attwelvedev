import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Times are epoch milliseconds. A device token is stored only as its hash.

export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  createdAt: integer("created_at").notNull(),
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

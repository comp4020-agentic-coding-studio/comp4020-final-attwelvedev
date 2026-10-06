import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "./db.ts";
import { ValidationError } from "./errors.ts";
import { deviceTokens, households, members } from "./schema.ts";
import { hashToken, newDeviceToken } from "./session.ts";

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

const MAX_NAME = 60;
const SEEN_EVERY_MS = 60 * 60 * 1000;

// Kitchen words for invite codes like KETTLE-42: easy to say aloud.
const WORDS = [
  "APRON",
  "BASIL",
  "BASKET",
  "BOWL",
  "BREAD",
  "BROTH",
  "BUTTER",
  "CARROT",
  "CELERY",
  "CHIVES",
  "CLOVE",
  "COLANDER",
  "CUMIN",
  "CUP",
  "CURRY",
  "DILL",
  "DISH",
  "DOUGH",
  "EGGS",
  "FENNEL",
  "FLOUR",
  "FORK",
  "GARLIC",
  "GINGER",
  "GRATER",
  "HONEY",
  "JAR",
  "JAM",
  "KALE",
  "KETTLE",
  "KNIFE",
  "LADLE",
  "LEMON",
  "LENTIL",
  "MAPLE",
  "MINT",
  "MUFFIN",
  "MUG",
  "NOODLE",
  "NUTMEG",
  "OATS",
  "OLIVE",
  "ONION",
  "OVEN",
  "PASTA",
  "PEPPER",
  "PLATE",
  "PORRIDGE",
  "RADISH",
  "RICE",
  "SAGE",
  "SALT",
  "SAUCE",
  "SPATULA",
  "SPOON",
  "STEW",
  "SUGAR",
  "TEAPOT",
  "THYME",
  "TOAST",
  "TONGS",
  "WHISK",
  "YEAST",
  "ZESTER",
];

function cleanName(raw: string, label: string): string {
  const name = raw.trim();
  if (!name) throw new ValidationError(`${label} can't be blank.`);
  if (name.length > MAX_NAME) {
    throw new ValidationError(`${label} must be ${MAX_NAME} characters or fewer.`);
  }
  return name;
}

function newInviteCode(db: Db): string {
  for (;;) {
    const code = `${WORDS[randomInt(WORDS.length)]}-${String(randomInt(100)).padStart(2, "0")}`;
    const taken = db
      .select({ id: households.id })
      .from(households)
      .where(eq(households.inviteCode, code))
      .get();
    if (!taken) return code;
  }
}

export function createHousehold(
  db: Db,
  input: { householdName: string; memberName: string },
): Session & { deviceToken: string } {
  const householdName = cleanName(input.householdName, "Household name");
  const memberName = cleanName(input.memberName, "Your name");
  const deviceToken = newDeviceToken();
  const now = Date.now();

  return db.transaction((tx) => {
    const household: Household = {
      id: randomUUID(),
      name: householdName,
      inviteCode: newInviteCode(tx),
      createdAt: now,
    };
    const member: Member = {
      id: randomUUID(),
      householdId: household.id,
      name: memberName,
      createdAt: now,
    };
    tx.insert(households).values(household).run();
    tx.insert(members).values(member).run();
    tx.insert(deviceTokens)
      .values({
        tokenHash: hashToken(deviceToken),
        memberId: member.id,
        createdAt: now,
        lastSeenAt: now,
      })
      .run();
    return { household, member, deviceToken };
  });
}

// Resolves a raw cookie value to who it belongs to, or null. A token that
// doesn't match is simply no session. Records the device as seen at most once
// an hour, so reads don't turn into a write per request.
export function sessionForToken(db: Db, token: string): Session | null {
  const tokenHash = hashToken(token);
  const row = db
    .select({
      member: members,
      household: households,
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

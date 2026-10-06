import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "./db.ts";
import { NotFoundError, ValidationError } from "./errors.ts";
import { type Session, sessionForToken } from "./households.ts";
import { deviceTokens, passkeys } from "./schema.ts";
import { hashToken, newDeviceToken } from "./session.ts";

// Passkeys are an optional way back in: sign-in mints an ordinary device token
// (the same cookie as every other sign-in), so middleware and every endpoint
// stay as they are. The server library is imported inside the handlers, so a
// process that never sees a passkey request never loads it.

export interface Rp {
  id: string;
  origin: string;
  name: string;
}
export interface PasskeyRow {
  id: string;
  createdAt: number;
  lastUsedAt: number | null;
}
export interface ChallengeEntry {
  challenge: string;
  kind: "register" | "signin";
  memberId: string | null;
}

const CHALLENGE_TTL_MS = 5 * 60_000;

// One Fly machine, so memory is enough: a restart only costs a retry.
const challenges = new Map<string, ChallengeEntry & { expiresAt: number }>();

function keepChallenge(entry: ChallengeEntry, now = Date.now()): string {
  for (const [id, held] of challenges) if (held.expiresAt <= now) challenges.delete(id);
  const challengeId = randomBytes(16).toString("base64url");
  challenges.set(challengeId, { ...entry, expiresAt: now + CHALLENGE_TTL_MS });
  return challengeId;
}

// Single use: asking for a challenge consumes it, right or wrong.
export function takeChallenge(challengeId: string, now = Date.now()): ChallengeEntry | null {
  const held = challenges.get(challengeId);
  challenges.delete(challengeId);
  if (!held || held.expiresAt < now) return null;
  const { expiresAt: _, ...entry } = held;
  return entry;
}

// An unknown credential, a wrong challenge and a bad signature all read the
// same, so the endpoint reveals nothing about which credentials exist.
const SIGNIN_FAILED = "That passkey didn't work.";
const REGISTER_FAILED = "That passkey couldn't be added.";

const lib = () => import("@simplewebauthn/server");

export function listPasskeys(db: Db, memberId: string): PasskeyRow[] {
  return db
    .select()
    .from(passkeys)
    .where(eq(passkeys.memberId, memberId))
    .orderBy(desc(passkeys.createdAt), passkeys.credentialId)
    .all()
    .map((p) => ({ id: p.credentialId, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt }));
}

export function removePasskey(db: Db, session: Session, credentialId: string): void {
  const removed = db
    .delete(passkeys)
    .where(and(eq(passkeys.credentialId, credentialId), eq(passkeys.memberId, session.member.id)))
    .returning({ id: passkeys.credentialId })
    .all();
  if (removed.length === 0) throw new NotFoundError("No such passkey.");
}

export async function registrationOptions(
  db: Db,
  session: Session,
  rp: Rp,
): Promise<{ challengeId: string; options: unknown }> {
  const { generateRegistrationOptions } = await lib();
  const options = await generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    userName: session.member.name,
    userID: new TextEncoder().encode(session.member.id),
    excludeCredentials: db
      .select({ id: passkeys.credentialId })
      .from(passkeys)
      .where(eq(passkeys.memberId, session.member.id))
      .all(),
    // discoverable, so sign-in asks for no username
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  const challengeId = keepChallenge({
    challenge: options.challenge,
    kind: "register",
    memberId: session.member.id,
  });
  return { challengeId, options };
}

export async function verifyRegistration(
  db: Db,
  session: Session,
  rp: Rp,
  challengeId: string,
  response: unknown,
  now = Date.now(),
): Promise<PasskeyRow> {
  const entry = takeChallenge(challengeId, now);
  if (entry?.kind !== "register" || entry.memberId !== session.member.id) {
    throw new ValidationError(REGISTER_FAILED);
  }
  const { verifyRegistrationResponse } = await lib();
  try {
    const verified = await verifyRegistrationResponse({
      response: response as Parameters<typeof verifyRegistrationResponse>[0]["response"],
      expectedChallenge: entry.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
    });
    if (!verified.verified) throw new Error("not verified");
    const { credential } = verified.registrationInfo;
    db.insert(passkeys)
      .values({
        credentialId: credential.id,
        memberId: session.member.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ? JSON.stringify(credential.transports) : null,
        createdAt: now,
      })
      .run();
    return { id: credential.id, createdAt: now, lastUsedAt: null };
  } catch {
    // never echo the library's message
    throw new ValidationError(REGISTER_FAILED);
  }
}

export async function signinOptions(rp: Rp): Promise<{ challengeId: string; options: unknown }> {
  const { generateAuthenticationOptions } = await lib();
  const options = await generateAuthenticationOptions({
    rpID: rp.id,
    userVerification: "required",
  });
  const challengeId = keepChallenge({
    challenge: options.challenge,
    kind: "signin",
    memberId: null,
  });
  return { challengeId, options };
}

export async function verifySignin(
  db: Db,
  rp: Rp,
  challengeId: string,
  response: unknown,
  now = Date.now(),
): Promise<Session & { deviceToken: string }> {
  const entry = takeChallenge(challengeId, now);
  if (entry?.kind !== "signin") throw new ValidationError(SIGNIN_FAILED);

  const asserted = response as {
    id?: unknown;
    response?: { userHandle?: unknown };
  } | null;
  const credentialId = typeof asserted?.id === "string" ? asserted.id : "";
  const stored = db.select().from(passkeys).where(eq(passkeys.credentialId, credentialId)).get();
  if (!stored) throw new ValidationError(SIGNIN_FAILED);
  // the handle is the member id: it must name whoever owns the credential
  const handle = asserted?.response?.userHandle;
  if (
    typeof handle !== "string" ||
    Buffer.from(handle, "base64url").toString() !== stored.memberId
  ) {
    throw new ValidationError(SIGNIN_FAILED);
  }

  const { verifyAuthenticationResponse } = await lib();
  let newCounter: number;
  try {
    const verified = await verifyAuthenticationResponse({
      response: response as Parameters<typeof verifyAuthenticationResponse>[0]["response"],
      expectedChallenge: entry.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      credential: {
        id: stored.credentialId,
        publicKey: new Uint8Array(stored.publicKey),
        counter: stored.counter,
        transports: stored.transports ? JSON.parse(stored.transports) : undefined,
      },
    });
    if (!verified.verified) throw new Error("not verified");
    newCounter = verified.authenticationInfo.newCounter;
  } catch {
    throw new ValidationError(SIGNIN_FAILED);
  }

  return db.transaction((tx) => {
    tx.update(passkeys)
      .set({ counter: newCounter, lastUsedAt: now })
      .where(eq(passkeys.credentialId, stored.credentialId))
      .run();
    const deviceToken = newDeviceToken();
    tx.insert(deviceTokens)
      .values({
        tokenHash: hashToken(deviceToken),
        memberId: stored.memberId,
        createdAt: now,
        lastSeenAt: now,
      })
      .run();
    const session = sessionForToken(tx, deviceToken);
    if (!session) throw new ValidationError(SIGNIN_FAILED);
    return { ...session, deviceToken };
  });
}

// The challenge id travels in a short-lived cookie scoped to /passkey, so the
// page's script never handles it.
export const PASSKEY_COOKIE = "pantry_passkey";
export const CHALLENGE_COOKIE_MAX_AGE_S = 300;

// The relying party is wherever the request arrived: Astro trusts Fly's
// x-forwarded-proto, so url.origin is https://…fly.dev there and
// http://localhost:8080 locally.
export const rpFor = (url: URL): Rp => ({
  id: url.hostname,
  origin: url.origin,
  name: "Shared pantry",
});

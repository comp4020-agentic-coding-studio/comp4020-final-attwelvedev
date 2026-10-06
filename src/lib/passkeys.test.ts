import { describe, expect, it } from "vitest";
import { openDb } from "./db.ts";
import { NotFoundError, ValidationError } from "./errors.ts";
import { createHousehold, createInviteLink, joinByLink, removeMember } from "./households.ts";
import {
  listPasskeys,
  type Rp,
  removePasskey,
  signinOptions,
  takeChallenge,
  verifySignin,
} from "./passkeys.ts";
import { passkeys } from "./schema.ts";

const rp: Rp = { id: "localhost", origin: "http://localhost:8080", name: "Shared pantry" };
const FIVE_MINUTES = 5 * 60_000;

function twoMembers() {
  const db = openDb(":memory:");
  const sam = createHousehold(db, { householdName: "Unit 4", memberName: "Sam" });
  const { token } = createInviteLink(db, sam);
  const alex = joinByLink(db, { token, memberName: "Alex" });
  return { db, sam, alex };
}

function addPasskey(db: ReturnType<typeof openDb>, memberId: string, credentialId: string) {
  db.insert(passkeys)
    .values({
      credentialId,
      memberId,
      publicKey: Buffer.from([1, 2, 3]),
      counter: 0,
      transports: null,
      createdAt: 1,
    })
    .run();
}

describe("takeChallenge", () => {
  it("hands a challenge over once", async () => {
    const { challengeId } = await signinOptions(rp);
    expect(takeChallenge(challengeId)).not.toBeNull();
    expect(takeChallenge(challengeId)).toBeNull();
  });

  it("forgets a challenge after five minutes", async () => {
    const { challengeId } = await signinOptions(rp);
    expect(takeChallenge(challengeId, Date.now() + FIVE_MINUTES + 1)).toBeNull();
  });

  it("knows nothing about an id it never issued", () => {
    expect(takeChallenge("nope")).toBeNull();
  });
});

describe("signinOptions", () => {
  it("names no credential, so the browser offers whatever it holds", async () => {
    const { options } = await signinOptions(rp);
    expect((options as { allowCredentials?: unknown[] }).allowCredentials ?? []).toEqual([]);
  });
});

describe("listPasskeys and removePasskey", () => {
  it("lists only that member's passkeys", () => {
    const { db, sam, alex } = twoMembers();
    addPasskey(db, sam.member.id, "cred-sam");
    addPasskey(db, alex.member.id, "cred-alex");
    expect(listPasskeys(db, sam.member.id).map((p) => p.id)).toEqual(["cred-sam"]);
  });

  it("removes your own passkey", () => {
    const { db, sam } = twoMembers();
    addPasskey(db, sam.member.id, "cred-sam");
    removePasskey(db, sam, "cred-sam");
    expect(listPasskeys(db, sam.member.id)).toEqual([]);
  });

  it("will not remove another member's passkey", () => {
    const { db, sam, alex } = twoMembers();
    addPasskey(db, alex.member.id, "cred-alex");
    expect(() => removePasskey(db, sam, "cred-alex")).toThrow(NotFoundError);
    expect(listPasskeys(db, alex.member.id)).toHaveLength(1);
  });

  it("goes with the member when they are removed", () => {
    const { db, sam, alex } = twoMembers();
    addPasskey(db, alex.member.id, "cred-alex");
    removeMember(db, sam, alex.member.id);
    expect(db.select().from(passkeys).all()).toEqual([]);
  });
});

describe("verifySignin", () => {
  it("answers an unknown credential and a wrong challenge in the same words", async () => {
    const { db, sam } = twoMembers();
    addPasskey(db, sam.member.id, "cred-sam");
    const { challengeId } = await signinOptions(rp);
    const response = { id: "not-a-credential", rawId: "not-a-credential", type: "public-key" };
    const unknown = await verifySignin(db, rp, challengeId, response).catch((e) => e);
    const wrongChallenge = await verifySignin(db, rp, "no-such-challenge", {
      ...response,
      id: "cred-sam",
    }).catch((e) => e);
    expect(unknown).toBeInstanceOf(ValidationError);
    expect(wrongChallenge).toBeInstanceOf(ValidationError);
    expect(unknown.message).toBe(wrongChallenge.message);
  });
});

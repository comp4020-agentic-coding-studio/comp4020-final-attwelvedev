import { createHash, randomBytes } from "node:crypto";

export const DEVICE_COOKIE = "pantry_device";

// The cookie holds the raw token; the database only ever sees its hash, so a
// leaked database can't be replayed as a login.
export function newDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

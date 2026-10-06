import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import type { Session } from "./households.ts";
import { ACTIONS, anon, describeRequest, isLogged } from "./requestLog.ts";
import { hashToken } from "./session.ts";

const session: Session = {
  member: { id: "m1", householdId: "h1", name: "NOSY-Sam", createdAt: 1 },
  household: { id: "h1", name: "SECRET-Unit-4", inviteCode: "KETTLE-42", createdAt: 1 },
};
const TOKEN = "raw-cookie-value-0123456789";

const base = {
  method: "POST",
  route: "/items",
  status: 303,
  ms: 3.7,
  token: TOKEN,
  session,
  now: Date.parse("2026-10-07T03:00:00Z"),
};

describe("describeRequest", () => {
  it("gives the documented shape for a signed-in action", () => {
    const line = describeRequest(base);
    expect(line).toMatchObject({
      ts: "2026-10-07T03:00:00.000Z",
      kind: "request",
      method: "POST",
      route: "/items",
      action: "item.add",
      status: 303,
    });
    expect(Number.isInteger(line.ms)).toBe(true);
    expect(line.who).toMatch(/^[0-9a-f]{8}$/);
    expect(line.hh).toMatch(/^[0-9a-f]{8}$/);
    expect(line.who).toBe(hashToken(TOKEN).slice(0, 8));
  });

  it("has no who or hh without a session", () => {
    const line = describeRequest({ ...base, session: null });
    expect(line.who).toBeNull();
    expect(line.hh).toBeNull();
  });

  it("names an unknown route '<METHOD> <pattern>'", () => {
    expect(describeRequest({ ...base, method: "GET", route: "/nowhere/[x]" }).action).toBe(
      "GET /nowhere/[x]",
    );
  });

  it("logs the route pattern and nothing private", () => {
    const line = describeRequest({
      ...base,
      route: "/join/[token]/accept",
      detail: { via: "link", memberName: "NOSY-Sam", note: "SECRETNOTE" },
    });
    const text = JSON.stringify(line);
    expect(line.route).toBe("/join/[token]/accept");
    for (const secret of [TOKEN, hashToken(TOKEN), "NOSY", "SECRET", "h1", "m1", "KETTLE"]) {
      expect(text).not.toContain(secret);
    }
    expect(line.detail).toEqual({ via: "link" });
  });

  it("omits detail when there is none", () => {
    expect("detail" in describeRequest(base)).toBe(false);
  });

  it("logs a thrown error as 500 with its class name and never its message", () => {
    class BoomError extends Error {}
    const line = describeRequest({
      ...base,
      status: 200,
      error: new BoomError("the pantry of SECRETMILK exploded"),
    });
    expect(line.status).toBe(500);
    expect(line.err).toBe("BoomError");
    expect(JSON.stringify(line)).not.toContain("SECRETMILK");
  });
});

describe("anon", () => {
  it("is 8 hex characters and stable", () => {
    expect(anon("x")).toMatch(/^[0-9a-f]{8}$/);
    expect(anon("x")).toBe(anon("x"));
    expect(anon("x")).not.toBe(anon("y"));
  });
});

describe("isLogged", () => {
  it.each(["/stats", "/stats.json", "/_astro/a.js"])("skips %s", (route) => {
    expect(isLogged(route)).toBe(false);
  });
  it("logs the rest", () => {
    expect(isLogged("/items")).toBe(true);
  });
});

// Every POST endpoint must be named, so a new endpoint can't ship unlogged
// under a raw pattern.
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

function patternOf(file: string): string {
  const rel = relative("src/pages", file)
    .split(sep)
    .join("/")
    .replace(/\.(ts|astro)$/, "")
    .replace(/(^|\/)index$/, "");
  return `/${rel}`;
}

describe("ACTIONS", () => {
  it("names every POST endpoint", () => {
    const missing = files("src/pages")
      .filter((f) => f.endsWith(".ts") && /export const POST\b/.test(readFileSync(f, "utf-8")))
      .map((f) => `POST ${patternOf(f)}`)
      .filter((key) => !(key in ACTIONS));
    expect(missing).toEqual([]);
  });
});

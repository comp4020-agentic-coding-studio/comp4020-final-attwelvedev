import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTIONS, anon, describeRequest, isLogged } from "./requestLog.ts";
import { hashToken } from "./session.ts";

const TOKEN = "raw-cookie-value-0123456789";

const base = {
  method: "GET",
  route: "/",
  status: 200,
  ms: 3.7,
  token: TOKEN,
  now: Date.parse("2026-10-07T03:00:00Z"),
};

describe("describeRequest", () => {
  it("gives the documented shape", () => {
    const line = describeRequest(base);
    expect(line).toMatchObject({
      ts: "2026-10-07T03:00:00.000Z",
      kind: "request",
      method: "GET",
      route: "/",
      action: "view.home",
      status: 200,
    });
    expect(Number.isInteger(line.ms)).toBe(true);
  });

  it("who is 8 hex of the token hash when a token is present", () => {
    const line = describeRequest(base);
    expect(line.who).toMatch(/^[0-9a-f]{8}$/);
    expect(line.who).toBe(hashToken(TOKEN).slice(0, 8));
  });

  it("who is null without a token", () => {
    expect(describeRequest({ ...base, token: undefined }).who).toBeNull();
    expect(describeRequest({ ...base, token: null }).who).toBeNull();
  });

  it("names an unknown route '<METHOD> <pattern>'", () => {
    expect(describeRequest({ ...base, route: "/nowhere/[x]" }).action).toBe("GET /nowhere/[x]");
  });

  it("detail is redacted", () => {
    const line = describeRequest({
      ...base,
      route: "/lobby/[code]",
      detail: { via: "code", nickname: "NOSY-Sam", note: "SECRETNOTE" },
    });
    const text = JSON.stringify(line);
    expect(line.route).toBe("/lobby/[code]");
    for (const secret of [TOKEN, hashToken(TOKEN), "NOSY", "SECRET"]) {
      expect(text).not.toContain(secret);
    }
    expect(line.detail).toEqual({ via: "code" });
  });

  it("omits detail when there is none", () => {
    expect("detail" in describeRequest(base)).toBe(false);
  });

  it("an error becomes err with the class name only", () => {
    class BoomError extends Error {}
    const line = describeRequest({
      ...base,
      error: new BoomError("the lobby of SECRETTEAM exploded"),
    });
    expect(line.status).toBe(500);
    expect(line.err).toBe("BoomError");
    expect(JSON.stringify(line)).not.toContain("SECRETTEAM");
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
    expect(isLogged("/lobby/[code]")).toBe(true);
  });
});

describe("ACTIONS", () => {
  it("names the pages a player can reach", () => {
    expect(ACTIONS).toMatchObject({
      "GET /": "view.home",
      "GET /readme": "view.readme",
      "GET /lobby/[code]": "view.lobby",
      "GET /leaderboard": "view.leaderboard",
    });
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

describe("ACTIONS coverage", () => {
  it("names every POST endpoint", () => {
    const missing = files("src/pages")
      .filter((f) => f.endsWith(".ts") && /export const POST\b/.test(readFileSync(f, "utf-8")))
      .map((f) => `POST ${patternOf(f)}`)
      .filter((key) => !(key in ACTIONS));
    expect(missing).toEqual([]);
  });
});

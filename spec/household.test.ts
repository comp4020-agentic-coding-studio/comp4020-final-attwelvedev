import { describe, expect, inject, it } from "vitest";
import { client } from "./http.ts";

const baseUrl = inject("baseUrl");
const create = { householdName: "Unit 4", memberName: "Sam" };

describe("first run", () => {
  it("shows the first-run form to a visitor with no session", async () => {
    const res = await client(baseUrl).get("/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/<form[^>]*action="\/households"/);
    expect(html).toContain('name="householdName"');
    expect(html).toContain('name="memberName"');
  });

  it("creates a household, sets the device cookie and redirects to /", async () => {
    const me = client(baseUrl);
    const res = await me.post("/households", create);
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location") ?? "", baseUrl).pathname).toBe("/");
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith("pantry_device="));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(me.cookie("pantry_device")).toBeTruthy();
  });

  it("shows the household, and no first-run form, once signed in", async () => {
    const me = client(baseUrl);
    await me.post("/households", create);
    const html = await (await me.get("/")).text();
    expect(html).toContain("Unit 4");
    expect(html).not.toMatch(/<form[^>]*action="\/households"/);
  });

  it("keeps one device's household out of another's", async () => {
    await client(baseUrl).post("/households", { ...create, householdName: "Unit 4 private" });
    const html = await (await client(baseUrl).get("/")).text();
    expect(html).not.toContain("Unit 4 private");
    expect(html).toMatch(/<form[^>]*action="\/households"/);
  });

  it("rejects a blank name with 400, keeping the typed household name", async () => {
    const res = await client(baseUrl).post("/households", { ...create, memberName: "  " });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toMatch(/<form[^>]*action="\/households"/);
    expect(html).toContain('value="Unit 4"');
    expect(html).toMatch(/name/i);
    expect(html).toMatch(/role="alert"/);
  });

  it("treats a garbage cookie as no session, not a server error", async () => {
    const res = await fetch(new URL("/", baseUrl), {
      headers: { cookie: "pantry_device=garbage-value" },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/<form[^>]*action="\/households"/);
  });
});

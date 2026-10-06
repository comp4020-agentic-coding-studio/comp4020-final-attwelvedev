import { describe, expect, it } from "vitest";
import { deviceCookieOptions } from "./cookie.ts";

describe("deviceCookieOptions", () => {
  it("is not secure on plain http with no forwarded proto", () => {
    expect(deviceCookieOptions(new URL("http://localhost:8080/"), null).secure).toBe(false);
  });

  it("is secure on https, and when the proxy forwarded https", () => {
    expect(deviceCookieOptions(new URL("https://x.fly.dev/"), null).secure).toBe(true);
    expect(deviceCookieOptions(new URL("http://x/"), "https").secure).toBe(true);
  });

  it("is HttpOnly, SameSite=Lax, Path=/ and lasts 400 days", () => {
    expect(deviceCookieOptions(new URL("http://x/"), null)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 400 * 24 * 60 * 60,
    });
  });
});

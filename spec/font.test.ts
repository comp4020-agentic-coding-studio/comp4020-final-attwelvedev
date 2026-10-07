import { describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

describe("the self-hosted font", () => {
  it("is a small, long-cached woff2 served from the app's own origin", async () => {
    const html = await (await fetch(baseUrl)).text();
    const link = html.match(/<link[^>]*as="font"[^>]*>/)?.[0] ?? "";
    expect(link).toContain('rel="preload"');
    const href = link.match(/href="([^"]+)"/)?.[1];
    expect(href, "a font preload link").toBeTruthy();
    const res = await fetch(new URL(href as string, baseUrl));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("font/woff2");
    const bytes = (await res.arrayBuffer()).byteLength;
    expect(bytes).toBeLessThanOrEqual(45_000);
    const cache = res.headers.get("cache-control") ?? "";
    const longLived =
      cache.includes("immutable") || Number(cache.match(/max-age=(\d+)/)?.[1]) >= 31_536_000;
    expect(longLived, `cache-control was "${cache}"`).toBe(true);
  });
});

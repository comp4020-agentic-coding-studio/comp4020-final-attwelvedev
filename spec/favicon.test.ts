import { describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

// The browser tab shows the crew: three heads in the role colours, an SVG with a 32 px PNG fallback,
// linked from the shared layout so every page has it.
describe("the favicon", () => {
  it("every page links the SVG icon and its 32 px PNG fallback", async () => {
    for (const path of ["/", "/preferences"]) {
      const html = await (await fetch(new URL(path, baseUrl))).text();
      const icons = html.match(/<link rel="icon"[^>]*>/g) ?? [];
      expect(
        icons.some((l) => l.includes('href="/favicon.svg"')),
        path,
      ).toBe(true);
      expect(
        icons.some((l) => l.includes('href="/favicon-32.png"')),
        path,
      ).toBe(true);
    }
  });

  it("serves the SVG with all three role colours on the shell's dark", async () => {
    const res = await fetch(new URL("/favicon.svg", baseUrl));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    const svg = (await res.text()).toLowerCase();
    for (const colour of ["#f2a93b", "#4db3ff", "#9b7ee0", "#15121f"])
      expect(svg, colour).toContain(colour);
  });

  it("serves the 32 px PNG fallback", async () => {
    const res = await fetch(new URL("/favicon-32.png", baseUrl));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/png");
  });
});

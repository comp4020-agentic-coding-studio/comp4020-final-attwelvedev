import { readFileSync } from "node:fs";
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

  // the crew as the game draws them: each role a rounded pill body, a face disc and a hat in its shape
  it("draws each role as a pill with a dome, box or cone hat in its colour", () => {
    const svg = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8");
    const hats = {
      blind: ["circle", "#f2a93b"],
      deaf: ["rect", "#4db3ff"],
      mute: ["path", "#9b7ee0"],
    };
    for (const [role, [tag, colour]] of Object.entries(hats)) {
      const group = svg.match(new RegExp(`<g data-role="${role}">([\\s\\S]*?)</g>`))?.[1] ?? "";
      expect(group, role).toMatch(
        new RegExp(`<rect class="body"[^>]*rx="\\d+[^>]*fill="${colour}"`),
      );
      expect(group, role).toMatch(new RegExp(`<${tag} class="hat"[^>]*fill="${colour}"`));
      expect(group, role).toMatch(/<circle class="face"/);
    }
  });

  it("the PNG fallback is 32 by 32", async () => {
    const bytes = Buffer.from(
      await (await fetch(new URL("/favicon-32.png", baseUrl))).arrayBuffer(),
    );
    expect(bytes.subarray(1, 4).toString()).toBe("PNG");
    expect(bytes.readUInt32BE(16)).toBe(32); // IHDR width
    expect(bytes.readUInt32BE(20)).toBe(32); // IHDR height
  });
});

import { describe, expect, it } from "vitest";
import type { Answered } from "./html.ts";
import { renderReview } from "./html.ts";

const t = { calls: 2, errors: 0, input: 10, output: 5, cacheRead: 3, cacheWrite: 0, usd: 0.01 };
const base = { room: "01-x", beat: "1", width: 1280, rotation: 0, perceived: "", prior: "" };
const intents = { "01-x": { "1": { blind: "stands on <the plate>", deaf: "calls it" } } };
const blind: Answered = {
  item: { ...base, role: "blind" },
  answer: {
    findings: [{ kind: "missing", what: "a <b>cue</b>", where: "captions" }],
    next: "walk left",
  },
};
const deaf: Answered = {
  item: { ...base, role: "deaf", screenshot: "01-x/deaf-1280-r0-1.png" },
  error: "boom <script>",
};

describe("renderReview", () => {
  const html = renderReview([blind, deaf], intents, t);
  it("says screen dark with no image for Can't see", () => {
    const cell = html.split("<td>").find((c) => c.includes("walk left")) as string;
    expect(cell).toContain("screen dark");
    expect(cell).not.toContain("<img");
  });
  it("shows the next line beside the designed intent", () => {
    expect(html).toContain("would do next:</strong> walk left");
    expect(html).toContain("designed:</strong> stands on &lt;the plate&gt;");
  });
  it("escapes model text", () => {
    expect(html).toContain("a &lt;b&gt;cue&lt;/b&gt;");
    expect(html).not.toContain("<b>cue</b>");
  });
  it("shows an errored item's error, with its screenshot", () => {
    expect(html).toContain("boom &lt;script&gt;");
    expect(html).toContain('<img src="01-x/deaf-1280-r0-1.png"');
  });
});

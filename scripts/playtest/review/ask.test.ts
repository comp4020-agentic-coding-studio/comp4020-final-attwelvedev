import { describe, expect, it } from "vitest";
import { requestFor } from "./ask.ts";
import type { ReviewItem } from "./collect.ts";

const item = (over: Partial<ReviewItem> = {}): ReviewItem => ({
  room: "01-first-steps",
  beat: "1",
  role: "deaf",
  width: 1280,
  screenshot: "shot.png",
  perceived: "- main: a plate\n\nCaptions:\n",
  prior: "HOME TEXT\nREVEAL TEXT",
  ...over,
});
const png = () => Buffer.from("PNG");
const blocks = (r: ReturnType<typeof requestFor>) => {
  const c = (r.messages[0] as { content: { type: string }[] }).content;
  return c;
};

describe("requestFor", () => {
  it("carries no image for Can't see, even if a screenshot path is present", () => {
    const r = requestFor(item({ role: "blind" }), "m", png);
    expect(blocks(r).some((b) => b.type === "image")).toBe(false);
    expect(JSON.stringify(r)).not.toContain(Buffer.from("PNG").toString("base64"));
  });
  it("puts a sighted player's image before the text", () => {
    const c = blocks(requestFor(item(), "m", png));
    expect(c.map((b) => b.type)).toEqual(["image", "text"]);
  });
  it("names only that role's label", () => {
    const sys = JSON.stringify(requestFor(item({ role: "mute" }), "m", png).system);
    expect(sys).toContain("Can't speak");
    expect(sys).not.toContain("Can't see");
    expect(sys).not.toContain("Can't hear");
  });
  it("carries the prior in a cached system block", () => {
    const sys = requestFor(item(), "m", png).system as { text: string; cache_control?: unknown }[];
    expect(sys[0]?.text).toContain("HOME TEXT");
    expect(sys[0]?.cache_control).toEqual({ type: "ephemeral" });
  });
  it("leaks no design data (the FR9 tripwire)", () => {
    for (const role of ["blind", "deaf", "mute"] as const) {
      const text = JSON.stringify(requestFor(item({ role }), "m", png));
      for (const word of [
        "intent",
        "RoleView",
        "entities",
        "hints",
        "decode",
        "README",
        "budgetS",
        "01-first-steps",
      ]) {
        expect(text).not.toContain(word);
      }
    }
  });
  it("asks for a closed json schema", () => {
    const r = requestFor(item(), "m", png) as unknown as {
      output_config: { format: { schema: { additionalProperties: boolean } } };
    };
    expect(r.output_config.format.schema.additionalProperties).toBe(false);
  });
});

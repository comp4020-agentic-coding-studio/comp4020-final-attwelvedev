import { describe, expect, it } from "vitest";
import { parseClientMsg } from "./protocol.ts";

describe("parseClientMsg", () => {
  it("returns the message for a ping", () => {
    expect(parseClientMsg('{"t":"ping","at":1}')).toEqual({ t: "ping", at: 1 });
  });

  it.each([
    ["non-JSON", "not json"],
    ["a JSON string", '"ping"'],
    ["a JSON number", "7"],
    ["null", "null"],
    ["an array", '[{"t":"ping","at":1}]'],
    ["an unknown t", '{"t":"nope"}'],
    ["a missing t", '{"at":1}'],
    ["a ping without a numeric at", '{"t":"ping","at":"1"}'],
  ])("returns null for %s", (_name, raw) => {
    expect(parseClientMsg(raw)).toBeNull();
  });

  it("returns null for a frame over 8 KB even when it is valid", () => {
    const raw = JSON.stringify({ t: "ping", at: 1, pad: "x".repeat(8 * 1024) });
    expect(raw.length).toBeGreaterThan(8 * 1024);
    expect(parseClientMsg(raw)).toBeNull();
  });
});

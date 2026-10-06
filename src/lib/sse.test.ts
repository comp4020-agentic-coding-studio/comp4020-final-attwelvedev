import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type LiveEvent, publish, subscriberCount } from "./live.ts";
import { eventFrame, eventStream } from "./sse.ts";

const decoder = new TextDecoder();
const added = (name: string): LiveEvent => ({
  type: "item.added",
  item: { id: "i", householdId: "h", name, createdBy: "m", createdAt: 1 },
  by: { id: "m", name: "Sam" },
});
const removedSelf: LiveEvent = {
  type: "member.removed",
  member: { id: "m", name: "Sam" },
  by: { id: "z", name: "Zed" },
};

async function read(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string | null> {
  const { value, done } = await reader.read();
  return done ? null : decoder.decode(value);
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("eventFrame", () => {
  it("is `event:` then one line of `data:` then a blank line", () => {
    const e = added("milk");
    expect(eventFrame(e)).toBe(`event: item.added\ndata: ${JSON.stringify(e)}\n\n`);
  });

  it("keeps data on one line even when an item name contains a newline", () => {
    const frame = eventFrame(added("milk\nevent: injected\n\ndata: x"));
    expect(frame.split("\n")).toHaveLength(4); // event, data, blank, trailing
    expect(frame).not.toContain("\nevent: injected");
  });
});

describe("eventStream", () => {
  it("starts with a retry hint, then delivers published events as frames", async () => {
    const ac = new AbortController();
    const reader = eventStream({ channels: ["household:s1"], signal: ac.signal }).getReader();
    expect(await read(reader)).toBe("retry: 2000\n\n");
    publish("household:s1", added("milk"));
    expect(await read(reader)).toBe(eventFrame(added("milk")));
    ac.abort();
  });

  it("sends a ping comment after heartbeatMs", async () => {
    const ac = new AbortController();
    const reader = eventStream({
      channels: ["household:s2"],
      signal: ac.signal,
      heartbeatMs: 1000,
    }).getReader();
    await read(reader);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await read(reader)).toBe(": ping\n\n");
    ac.abort();
  });

  it("closes and unsubscribes when the signal aborts", async () => {
    const ac = new AbortController();
    const reader = eventStream({ channels: ["household:s3"], signal: ac.signal }).getReader();
    await read(reader);
    expect(subscriberCount("household:s3")).toBe(1);
    ac.abort();
    expect(await read(reader)).toBeNull();
    expect(subscriberCount("household:s3")).toBe(0);
  });

  it("unsubscribes when the reader cancels", async () => {
    const ac = new AbortController();
    const reader = eventStream({ channels: ["household:s4"], signal: ac.signal }).getReader();
    await read(reader);
    await reader.cancel();
    expect(subscriberCount("household:s4")).toBe(0);
  });

  it("delivers the event that satisfies closeWhen, then closes", async () => {
    const ac = new AbortController();
    const reader = eventStream({
      channels: ["household:s5"],
      signal: ac.signal,
      closeWhen: (e) => e.type === "member.removed",
    }).getReader();
    await read(reader);
    publish("household:s5", added("milk"));
    publish("household:s5", removedSelf);
    expect(await read(reader)).toBe(eventFrame(added("milk")));
    expect(await read(reader)).toBe(eventFrame(removedSelf));
    expect(await read(reader)).toBeNull();
    expect(subscriberCount("household:s5")).toBe(0);
  });

  it("is closed at once when the signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const reader = eventStream({ channels: ["household:s6"], signal: ac.signal }).getReader();
    expect(await read(reader)).toBeNull();
    expect(subscriberCount("household:s6")).toBe(0);
  });

  describe("follow", () => {
    const joined = (communityId: string): LiveEvent => ({
      type: "membership.joined",
      community: { id: communityId, name: "Elm" },
    });
    const left = (communityId: string): LiveEvent => ({ type: "membership.left", communityId });
    const follow = (e: LiveEvent) =>
      e.type === "membership.joined"
        ? { add: [`community:${e.community.id}`] }
        : e.type === "membership.left"
          ? { remove: [`community:${e.communityId}`] }
          : undefined;
    const announced = (communityId: string): LiveEvent => ({
      type: "community.householdJoined",
      communityId,
      household: { id: "h", displayName: "Unit 4" },
    });

    it("subscribes an added channel, delivering the triggering event first", async () => {
      const ac = new AbortController();
      const reader = eventStream({
        channels: ["household:f1"],
        signal: ac.signal,
        follow,
      }).getReader();
      await read(reader);
      expect(subscriberCount("community:f1")).toBe(0);
      publish("household:f1", joined("f1"));
      expect(await read(reader)).toBe(eventFrame(joined("f1")));
      publish("community:f1", announced("f1"));
      expect(await read(reader)).toBe(eventFrame(announced("f1")));
      ac.abort();
      expect(await read(reader)).toBeNull();
      expect(subscriberCount("community:f1")).toBe(0);
    });

    it("stops delivering a removed channel, after delivering the triggering event", async () => {
      const ac = new AbortController();
      const reader = eventStream({
        channels: ["household:f2", "community:f2"],
        signal: ac.signal,
        follow,
      }).getReader();
      await read(reader);
      publish("household:f2", left("f2"));
      expect(await read(reader)).toBe(eventFrame(left("f2")));
      expect(subscriberCount("community:f2")).toBe(0);
      publish("community:f2", announced("f2"));
      publish("household:f2", added("milk"));
      expect(await read(reader)).toBe(eventFrame(added("milk")));
      ac.abort();
    });

    it("does not double-deliver when an added channel is already held", async () => {
      const ac = new AbortController();
      const reader = eventStream({
        channels: ["household:f3", "community:f3"],
        signal: ac.signal,
        follow,
      }).getReader();
      await read(reader);
      publish("household:f3", joined("f3"));
      expect(subscriberCount("community:f3")).toBe(1);
      expect(await read(reader)).toBe(eventFrame(joined("f3")));
      publish("community:f3", announced("f3"));
      publish("household:f3", added("milk"));
      expect(await read(reader)).toBe(eventFrame(announced("f3")));
      expect(await read(reader)).toBe(eventFrame(added("milk")));
      ac.abort();
    });
  });
});

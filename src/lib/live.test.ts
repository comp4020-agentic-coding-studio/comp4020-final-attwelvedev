import { describe, expect, it, vi } from "vitest";
import { householdChannel, type LiveEvent, publish, subscribe, subscriberCount } from "./live.ts";
import { testItem } from "./testItem.ts";

const added = (name: string): LiveEvent => ({
  type: "item.added",
  item: testItem({ id: name, name }),
  by: { id: "m", name: "Sam" },
});

describe("live hub", () => {
  it("names a household's channel", () => {
    expect(householdChannel("abc")).toBe("household:abc");
  });

  it("delivers only to subscribers of that channel", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribe("household:a", a);
    const offB = subscribe("household:b", b);
    publish("household:a", added("milk"));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    offA();
    offB();
  });

  it("stops delivering after unsubscribe and counts subscribers", () => {
    const send = vi.fn();
    expect(subscriberCount("household:c")).toBe(0);
    const off = subscribe("household:c", send);
    const off2 = subscribe("household:c", () => {});
    expect(subscriberCount("household:c")).toBe(2);
    off();
    expect(subscriberCount("household:c")).toBe(1);
    publish("household:c", added("milk"));
    expect(send).not.toHaveBeenCalled();
    off2();
    expect(subscriberCount("household:c")).toBe(0);
  });

  it("keeps going when a subscriber throws, and never throws itself", () => {
    const after = vi.fn();
    const offs = [
      subscribe("household:d", () => {
        throw new Error("broken stream");
      }),
      subscribe("household:d", after),
    ];
    expect(() => publish("household:d", added("milk"))).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
    for (const off of offs) off();
  });

  it("lets a subscriber unsubscribe while it is being delivered to", () => {
    const second = vi.fn();
    const offs: Array<() => void> = [];
    offs.push(subscribe("household:e", () => offs[0]()));
    offs.push(subscribe("household:e", second));
    publish("household:e", added("milk"));
    expect(second).toHaveBeenCalledTimes(1);
    for (const off of offs) off();
  });
});

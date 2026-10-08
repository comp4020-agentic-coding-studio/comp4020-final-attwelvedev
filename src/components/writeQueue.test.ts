import { describe, expect, it } from "vitest";
import { createWriteQueue } from "./writeQueue.ts";

// a send that finishes when told to, and records that it ran
function gate(log: string[], name: string) {
  let release: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    send: async () => {
      log.push(name);
      await done;
    },
    release,
  };
}

describe("createWriteQueue", () => {
  it("sends the first and only the newest of those that wait behind it", async () => {
    const log: string[] = [];
    const queue = createWriteQueue();
    const one = gate(log, "one");
    const two = gate(log, "two");
    const three = gate(log, "three");
    const a = queue.run("k", one.send);
    const b = queue.run("k", two.send);
    const c = queue.run("k", three.send);
    expect(log).toEqual(["one"]);
    one.release();
    three.release();
    await Promise.all([a, b, c]);
    expect(log).toEqual(["one", "three"]);
  });

  it("runs different keys at the same time", async () => {
    const log: string[] = [];
    const queue = createWriteQueue();
    const a = gate(log, "a");
    const b = gate(log, "b");
    const ra = queue.run("x", a.send);
    const rb = queue.run("y", b.send);
    expect(log).toEqual(["a", "b"]);
    a.release();
    b.release();
    await Promise.all([ra, rb]);
  });

  it("is not blocked by a send that fails", async () => {
    const log: string[] = [];
    const queue = createWriteQueue();
    const first = queue.run("k", async () => {
      log.push("first");
      throw new Error("offline");
    });
    const second = queue.run("k", async () => {
      log.push("second");
    });
    await Promise.all([first, second]);
    expect(log).toEqual(["first", "second"]);
    await queue.run("k", async () => {
      log.push("later");
    });
    expect(log).toEqual(["first", "second", "later"]);
  });
});

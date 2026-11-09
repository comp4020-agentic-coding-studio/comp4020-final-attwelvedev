import { describe, expect, it } from "vitest";
import { netTrace } from "./nettrace.ts";

describe("netTrace", () => {
  it("puts what the page sent beside what the server says it applied", () => {
    const view = { tick: 412, ack: 37, you: { pos: { x: 8.3612, y: 1.5 } } };
    expect(netTrace({ count: 40, seq: 41 }, view)).toBe(
      "sent=40 seq=41 ack=37 tick=412 srv=8.361,1.500",
    );
  });

  it("says so when nothing was sent or no view has come", () => {
    expect(netTrace({ count: 0, seq: 0 }, null)).toBe("sent=0 seq=0 ack=- tick=- srv=-");
  });

  it("has no server position for a seat that is not told one", () => {
    const view = { tick: 3, ack: 0, you: { pos: undefined } };
    expect(netTrace({ count: 1, seq: 2 }, view)).toBe("sent=1 seq=2 ack=0 tick=3 srv=-");
  });
});

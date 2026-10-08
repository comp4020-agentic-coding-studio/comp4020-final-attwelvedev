// @vitest-environment jsdom
import { h, render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomCleared } from "./RoomCleared.tsx";

afterEach(() => {
  render(null, document.body);
  document.body.innerHTML = "";
});

const mount = (over: Partial<Parameters<typeof RoomCleared>[0]> = {}) =>
  render(
    h(RoomCleared, {
      ms: 95_000,
      loot: 1,
      lootTotal: 2,
      last: false,
      host: true,
      onNext: vi.fn(),
      onRestart: vi.fn(),
      ...over,
    }),
    document.body,
  );
const names = () => [...document.querySelectorAll("button")].map((b) => b.textContent);

describe("RoomCleared", () => {
  it("never offers Leave: it is too easy to press without reading", () => {
    for (const host of [true, false]) {
      for (const last of [true, false]) {
        mount({ host, last });
        expect(names().join("|")).not.toMatch(/leave/i);
      }
    }
  });

  it("gives the host Next room and a clearly named Restart room", () => {
    mount({ host: true, last: false });
    expect(names()).toEqual(["Next room", "Restart room"]);
  });

  it("after the last room the host can still restart that room, and there is no next", () => {
    mount({ host: true, last: true });
    expect(names()).toEqual(["Restart room"]);
    expect(document.body.textContent).toMatch(/last room/i);
  });

  it("gives everyone else no buttons, only that the host decides", () => {
    mount({ host: false, last: false });
    expect(names()).toEqual([]);
    expect(document.body.textContent).toMatch(/waiting for the host/i);
  });

  it("shows the time and the loot", () => {
    mount();
    expect(document.body.textContent).toContain("1:35");
    expect(document.body.textContent).toMatch(/Loot 1 of 2/);
  });
});

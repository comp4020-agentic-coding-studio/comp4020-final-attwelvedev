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
      onRestartHeist: vi.fn(),
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

  it("gives the host Next room, and anyone clearly named restarts that the others vote on", () => {
    mount({ host: true, last: false });
    expect(names()).toEqual(["Next room", "Restart room", "Restart heist"]);
  });

  it("after the last room there is no next, but a room or the heist can still be restarted", () => {
    mount({ host: true, last: true });
    expect(names()).toEqual(["Restart room", "Restart heist"]);
    expect(document.body.textContent).toMatch(/last room/i);
  });

  it("gives everyone else the restarts too, and says the host picks the next room", () => {
    mount({ host: false, last: false });
    expect(names()).toEqual(["Restart room", "Restart heist"]);
    expect(document.body.textContent).toMatch(/host picks the next room/i);
  });

  it("asking to restart takes two presses and sends a proposal, not a restart", async () => {
    const onRestart = vi.fn();
    mount({ host: false, onRestart });
    const room = document.querySelectorAll("button")[0] as HTMLButtonElement;
    room.click();
    await Promise.resolve();
    expect(onRestart).not.toHaveBeenCalled();
  });

  it("shows the time and the loot", () => {
    mount();
    expect(document.body.textContent).toContain("1:35");
    expect(document.body.textContent).toMatch(/Loot 1 of 2/);
  });
});

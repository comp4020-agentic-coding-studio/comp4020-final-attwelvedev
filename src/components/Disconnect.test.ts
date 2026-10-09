// @vitest-environment jsdom
import { h, render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { countdown, Disconnect } from "./Disconnect.tsx";

afterEach(() => {
  render(null, document.body);
  document.body.innerHTML = "";
});

const mount = (over: Partial<Parameters<typeof Disconnect>[0]> = {}) =>
  render(
    h(Disconnect, {
      waitingFor: "Bo",
      secondsLeft: 45,
      choosing: false,
      host: true,
      onChoice: vi.fn(),
      ...over,
    }),
    document.body,
  );
const names = () => [...document.querySelectorAll("button")].map((b) => b.textContent);

describe("countdown", () => {
  it("shows minutes and seconds, never below 0:00", () => {
    expect(countdown(45)).toBe("0:45");
    expect(countdown(5)).toBe("0:05");
    expect(countdown(0)).toBe("0:00");
    expect(countdown(-3)).toBe("0:00");
  });
});

describe("Disconnect", () => {
  it("is an alert dialog named by who it waits for, so a screen reader announces it", () => {
    mount();
    const box = document.querySelector("[role=alertdialog]");
    expect(box?.getAttribute("aria-labelledby")).toBe("pause-title");
    expect(document.getElementById("pause-title")?.textContent).toContain("Bo");
  });

  it("says who the game is waiting for, and how long they have", () => {
    mount();
    expect(document.querySelector("h2")?.textContent).toContain("Waiting for Bo");
    expect(document.querySelector("[role=timer]")?.textContent).toBe("0:45");
    expect(document.body.textContent).toMatch(/connection dropped/i);
  });

  it("gives nobody a button until the time is up", () => {
    for (const host of [true, false]) {
      mount({ host, choosing: false });
      expect(names()).toEqual([]);
    }
  });

  it("then gives the host the two choices, and reports which", () => {
    const onChoice = vi.fn();
    mount({ host: true, choosing: true, secondsLeft: 0, onChoice });
    expect(names()).toEqual(["Let a bot take over", "Back to lobby"]);
    for (const b of document.querySelectorAll("button")) b.click();
    expect(onChoice.mock.calls).toEqual([["bot"], ["lobby"]]);
  });

  it("tells everyone else that the host is choosing", () => {
    mount({ host: false, choosing: true, secondsLeft: 0 });
    expect(names()).toEqual([]);
    expect(document.body.textContent).toMatch(/waiting for the host to choose/i);
  });

  it("stops the clock once it is the host's turn", () => {
    mount({ choosing: true, secondsLeft: 0 });
    expect(document.querySelector("[role=timer]")).toBeNull();
  });
});

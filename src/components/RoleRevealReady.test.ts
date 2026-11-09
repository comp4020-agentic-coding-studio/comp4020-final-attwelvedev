// @vitest-environment jsdom
import { h, render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoleReveal } from "./RoleReveal.tsx";

// Replaces the "lets a person take I'm ready back, and everyone sees them not ready again" test in
// spec/layout/reveal.test.ts, which pressed the button on one of three live pages and polled another for the
// host's row to change. It failed once in a full local check and never again in 7 runs, and the cause was not found
// (the hypothesis, not shown: socket.ts `send` drops a message while the socket is not open, so a press made then
// never reaches the server). What is tested here is what the page decides, with no socket: the button offers the
// right choice and calls onReady with it, and the crew rows follow the ready seats the server reports. The server's
// half is `unready` in src/net/game.test.ts and the socket's dropped send is src/client/socket.test.ts.
afterEach(() => {
  render(null, document.body);
  document.body.innerHTML = "";
});

const crew = [
  { seat: 0, role: "blind", nickname: "Ana" },
  { seat: 1, role: "deaf", nickname: "Bo" },
  { seat: 2, role: "mute", nickname: "Cy" },
] as never;

function mount(over: { ready: boolean; readySeats: number[] }, onReady = vi.fn()) {
  render(
    h(RoleReveal, {
      name: "First steps",
      index: 1,
      rooms: 9,
      role: "deaf",
      crew,
      real: { lines: [] } as never,
      cues: [],
      played: {},
      sittingOut: [],
      watching: [],
      me: 1,
      host: false,
      onSwap: vi.fn(),
      audio: { current: null },
      onReady,
      ...over,
    } as never),
    document.body,
  );
  return onReady;
}

const buttons = () => [...document.querySelectorAll(".reveal-go button, .reveal button")];
const named = (text: string) => buttons().find((b) => b.textContent?.trim() === text);
const rowOf = (nickname: string) =>
  [...document.querySelectorAll("li, tr, .crew-row, [class*=crew]")].find(
    (el) => el.textContent?.includes(nickname) && !el.querySelector("li, tr"),
  );

describe("RoleReveal's I'm ready", () => {
  it("offers I'm ready until you are, and pressing it says on", () => {
    const onReady = mount({ ready: false, readySeats: [] });
    expect(named("I'm ready")).toBeDefined();
    expect(named("Not ready yet")).toBeUndefined();
    (named("I'm ready") as HTMLElement).click();
    expect(onReady).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("offers only Not ready yet once you are, and pressing it takes it back (off)", () => {
    const onReady = mount({ ready: true, readySeats: [1] });
    expect(named("I'm ready")).toBeUndefined();
    expect(named("Not ready yet")).toBeDefined();
    (named("Not ready yet") as HTMLElement).click();
    expect(onReady).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("shows a seat as Ready when the server lists it, and Not ready again once it is taken off", () => {
    mount({ ready: true, readySeats: [1] });
    expect(rowOf("Bo")?.textContent).toContain("Ready");
    expect(rowOf("Bo")?.textContent).not.toContain("Not ready");
    expect(document.body.textContent).toContain("Waiting for the others · 1 of 3");
    mount({ ready: false, readySeats: [] });
    expect(rowOf("Bo")?.textContent).toContain("Not ready");
    expect(document.body.textContent).toContain("0 of 3");
  });
});

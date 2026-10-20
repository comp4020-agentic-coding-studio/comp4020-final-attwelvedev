// @vitest-environment jsdom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HudMenu } from "./HudMenu.tsx";

afterEach(() => {
  render(null, document.body);
  document.body.innerHTML = "";
});

const mount = (over: Partial<Parameters<typeof HudMenu>[0]> = {}) => {
  const onAsk = vi.fn();
  const onLeave = vi.fn();
  render(
    h(HudMenu, { onAsk, onLeave, settings: h("p", { id: "settings-slot" }, "settings"), ...over }),
    document.body,
  );
  return { onAsk, onLeave };
};
const toggle = () => document.querySelector("button.hud-menu-btn") as HTMLButtonElement;
const items = () =>
  [...document.querySelectorAll(".hud-menu-panel button")].map((b) => b.textContent);
const button = (label: RegExp) =>
  [...document.querySelectorAll("button")].find((b) =>
    label.test(b.textContent ?? ""),
  ) as HTMLButtonElement;

describe("HudMenu", () => {
  it("is one button named Menu that opens and closes a panel", async () => {
    mount();
    expect(toggle().getAttribute("aria-label")).toBe("Menu");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector(".hud-menu-panel")).toBeNull();
    await act(() => toggle().click());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector(".hud-menu-panel")).not.toBeNull();
    await act(() => toggle().click());
    expect(document.querySelector(".hud-menu-panel")).toBeNull();
  });

  it("holds the settings, the two restarts and Leave, in that order", async () => {
    mount();
    await act(() => toggle().click());
    expect(document.querySelector("#settings-slot")).not.toBeNull();
    expect(items()).toEqual(["Restart room", "Restart heist", "Leave game"]);
  });

  it("asks twice before it asks the others to restart the room", async () => {
    const { onAsk } = mount();
    await act(() => toggle().click());
    await act(() => button(/^Restart room$/).click());
    expect(onAsk).not.toHaveBeenCalled();
    await act(() => button(/Sure\? Ask to restart room/).click());
    expect(onAsk).toHaveBeenCalledWith("room");
  });

  it("asks twice before it asks the others to restart the heist", async () => {
    const { onAsk } = mount();
    await act(() => toggle().click());
    await act(() => button(/^Restart heist$/).click());
    await act(() => button(/Sure\? Ask to restart heist/).click());
    expect(onAsk).toHaveBeenCalledWith("heist");
  });

  it("hands Leave to the page, whose own modal asks (so it is one press here)", async () => {
    const { onLeave } = mount();
    await act(() => toggle().click());
    const leave = button(/^Leave game$/);
    expect(leave.classList.contains("danger")).toBe(true);
    await act(() => leave.click());
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and gives focus back to its button", async () => {
    mount();
    await act(() => toggle().click());
    await act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.querySelector(".hud-menu-panel")).toBeNull();
  });
});

// @vitest-environment jsdom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Settings } from "./Settings.tsx";

afterEach(() => {
  render(null, document.body);
  document.body.innerHTML = "";
});

const settings = { captions: true, sound: true, speech: true, keepOpen: false };

async function open(onLeave: () => void) {
  render(h(Settings, { role: "mute", settings, onChange: () => {}, onLeave }), document.body);
  await act(() => (document.querySelector("button.hud-btn") as HTMLButtonElement).click());
  return [...document.querySelectorAll("button")].find((b) => /leave/i.test(b.textContent ?? ""));
}

describe("Settings: Leave game", () => {
  it("is tucked inside the panel, not on the bar", async () => {
    render(
      h(Settings, { role: "mute", settings, onChange: () => {}, onLeave: () => {} }),
      document.body,
    );
    expect(document.body.textContent).not.toMatch(/leave/i);
    const leave = await open(() => {});
    expect(leave?.textContent).toBe("Leave game");
  });

  it("looks destructive and asks twice before leaving", async () => {
    const onLeave = vi.fn();
    const leave = (await open(onLeave)) as HTMLButtonElement;
    expect(leave.classList.contains("danger")).toBe(true);
    await act(() => leave.click());
    expect(onLeave).not.toHaveBeenCalled();
    expect(leave.textContent).toBe("Sure? Leave game");
    await act(() => leave.click());
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});

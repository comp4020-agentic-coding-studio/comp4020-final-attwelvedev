// @vitest-environment jsdom
import { h, render } from "preact";
import { afterEach, describe, expect, it } from "vitest";
import { TouchControls } from "./TouchControls.tsx";

afterEach(() => {
  render(null, document.body);
  document.body.innerHTML = "";
});

const menu = (el: Element): boolean => {
  const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e.defaultPrevented;
};

describe("TouchControls", () => {
  // The browser spec fired this event the instant the joystick appeared, before
  // any effect had run. The handler must belong to the element, not be added later.
  it("keeps the joystick and Act from raising a context menu the moment they exist", () => {
    render(h(TouchControls, { moveDisabled: false }), document.body);
    const stick = document.querySelector("[data-joystick]");
    const act = document.querySelector("[data-act]");
    expect(stick).not.toBeNull();
    expect(act).not.toBeNull();
    expect(menu(stick as Element)).toBe(true);
    expect(menu(act as Element)).toBe(true);
  });

  it("labels the joystick for assistive technology", () => {
    render(h(TouchControls, { moveDisabled: false }), document.body);
    expect(document.querySelector("[data-joystick]")?.getAttribute("aria-label")).toBe("Move");
  });

  it("greys out and stops answering touches when disabled, but still blocks the menu", () => {
    render(h(TouchControls, { moveDisabled: true }), document.body);
    const stick = document.querySelector("[data-joystick]") as Element;
    const act = document.querySelector("[data-act]") as HTMLButtonElement;
    expect(stick.getAttribute("aria-disabled")).toBe("true");
    expect(act.disabled).toBe(true);
    expect(stick.classList.contains("is-off")).toBe(true);
    expect(act.classList.contains("is-off")).toBe(true);
    expect(menu(stick)).toBe(true);
  });

  it("keeps the comms buttons live while movement is off, so the crew can still talk", () => {
    const comms = { current: null };
    render(h(TouchControls, { moveDisabled: true, comms, quickLabel: "Wait" }), document.body);
    for (const sel of [".quick-btn", ".wheel-btn"]) {
      const b = document.querySelector(sel) as HTMLButtonElement;
      expect(b.disabled, sel).toBe(false);
      expect(b.closest(".is-off"), sel).toBeNull();
    }
  });

  it("is live by default", () => {
    render(h(TouchControls, { moveDisabled: false }), document.body);
    expect(document.querySelector(".is-off")).toBeNull();
    expect((document.querySelector("[data-act]") as HTMLButtonElement).disabled).toBe(false);
  });
});

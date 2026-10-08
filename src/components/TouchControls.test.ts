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
    render(h(TouchControls, { disabled: false }), document.body);
    const stick = document.querySelector("[data-joystick]");
    const act = document.querySelector("[data-act]");
    expect(stick).not.toBeNull();
    expect(act).not.toBeNull();
    expect(menu(stick as Element)).toBe(true);
    expect(menu(act as Element)).toBe(true);
  });

  it("labels the joystick for assistive technology", () => {
    render(h(TouchControls, { disabled: false }), document.body);
    expect(document.querySelector("[data-joystick]")?.getAttribute("aria-label")).toBe("Move");
  });

  it("greys out and stops answering touches when disabled, but still blocks the menu", () => {
    render(h(TouchControls, { disabled: true }), document.body);
    const stick = document.querySelector("[data-joystick]") as Element;
    const act = document.querySelector("[data-act]") as HTMLButtonElement;
    expect(stick.getAttribute("aria-disabled")).toBe("true");
    expect(act.disabled).toBe(true);
    expect(document.querySelector(".touch-zone")?.classList.contains("is-off")).toBe(true);
    expect(menu(stick)).toBe(true);
  });

  it("is live by default", () => {
    render(h(TouchControls, { disabled: false }), document.body);
    expect(document.querySelector(".touch-zone")?.classList.contains("is-off")).toBe(false);
    expect((document.querySelector("[data-act]") as HTMLButtonElement).disabled).toBe(false);
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createInput, type InputSource } from "./input.ts";

let source: InputSource | null = null;
afterEach(() => {
  source?.dispose();
  source = null;
  document.body.innerHTML = "";
});

const key = (type: "keydown" | "keyup", k: string, target: EventTarget = window) =>
  target.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true }));

describe("createInput", () => {
  it("reads WASD and the arrows as a move, Space as act", () => {
    source = createInput(document.body);
    expect(source.read().move).toEqual({ x: 0, y: 0 });
    key("keydown", "d");
    expect(source.read().move).toEqual({ x: 1, y: 0 });
    key("keydown", "ArrowUp");
    expect(source.read().move).toEqual({ x: 1, y: -1 });
    key("keyup", "d");
    key("keydown", "a");
    expect(source.read().move).toEqual({ x: -1, y: -1 });
    key("keyup", "a");
    key("keyup", "ArrowUp");
    expect(source.read().move).toEqual({ x: 0, y: 0 });
    key("keydown", " ");
    expect(source.read().act).toBe(true);
    key("keyup", " ");
    expect(source.read().act).toBe(false);
  });

  it("cancels opposite keys and is not case sensitive", () => {
    source = createInput(document.body);
    key("keydown", "A");
    key("keydown", "D");
    expect(source.read().move.x).toBe(0);
  });

  it("gives every read a higher seq", () => {
    source = createInput(document.body);
    const a = source.read().seq;
    const b = source.read().seq;
    expect(b).toBeGreaterThan(a);
  });

  it("ignores keys typed into a text field", () => {
    document.body.innerHTML = '<input id="f" />';
    source = createInput(document.body);
    key("keydown", "d", document.getElementById("f") as HTMLElement);
    expect(source.read().move.x).toBe(0);
  });

  it("drops held keys when the window loses focus", () => {
    source = createInput(document.body);
    key("keydown", "d");
    window.dispatchEvent(new Event("blur"));
    expect(source.read().move.x).toBe(0);
  });

  it("stops listening once disposed", () => {
    source = createInput(document.body);
    source.dispose();
    key("keydown", "d");
    expect(source.read().move.x).toBe(0);
  });

  it("keeps the joystick and Act from raising a context menu, until disposed", () => {
    document.body.innerHTML = "<div data-joystick></div><button data-act></button>";
    source = createInput(document.body);
    const menu = (el: Element) => {
      const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    };
    const stick = document.querySelector("[data-joystick]") as Element;
    const act = document.querySelector("[data-act]") as Element;
    expect(menu(stick)).toBe(true);
    expect(menu(act)).toBe(true);
    source.dispose();
    expect(menu(stick)).toBe(false);
  });
});

// @vitest-environment jsdom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WatchChat, type WatchLine } from "./WatchChat.tsx";

afterEach(() => {
  render(null, document.body);
  document.body.innerHTML = "";
});

const lines: WatchLine[] = [
  { id: 1, nickname: "Gus", text: "nice one" },
  { id: 2, nickname: "Di", text: "did you see that" },
];
const submit = () =>
  (document.querySelector("form") as HTMLFormElement).dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true }),
  );
const mount = (over: Partial<Parameters<typeof WatchChat>[0]> = {}) => {
  const onSay = vi.fn();
  render(h(WatchChat, { lines, onSay, ...over }), document.body);
  return onSay;
};

describe("WatchChat", () => {
  it("is a labelled region that says only watchers can read it", () => {
    mount();
    const box = document.querySelector("section");
    expect(box?.getAttribute("aria-labelledby")).toBeTruthy();
    expect(document.body.textContent).toMatch(/players can't see this/i);
  });

  it("lists who said what, in order", () => {
    mount();
    const items = [...document.querySelectorAll("li")].map((li) => li.textContent);
    expect(items).toEqual(["Gus: nice one", "Di: did you see that"]);
  });

  it("says so when nobody has spoken", () => {
    mount({ lines: [] });
    expect(document.querySelectorAll("li")).toHaveLength(0);
    expect(document.body.textContent).toMatch(/no messages yet/i);
  });

  it("sends what is typed, and clears the box", async () => {
    const onSay = mount();
    const input = document.querySelector("input") as HTMLInputElement;
    input.value = "hello";
    await act(() => {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(() => {
      submit();
    });
    expect(onSay).toHaveBeenCalledWith("hello");
    expect((document.querySelector("input") as HTMLInputElement).value).toBe("");
  });

  it("sends nothing for an empty or blank line", async () => {
    const onSay = mount();
    await act(() => {
      submit();
    });
    expect(onSay).not.toHaveBeenCalled();
  });

  it("limits a line to what the server keeps", () => {
    mount();
    expect((document.querySelector("input") as HTMLInputElement).maxLength).toBe(120);
  });
});

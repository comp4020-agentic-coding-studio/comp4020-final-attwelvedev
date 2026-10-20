// @vitest-environment jsdom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpectatorChat, type WatchLine } from "./SpectatorChat.tsx";

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
const mount = (over: Partial<Parameters<typeof SpectatorChat>[0]> = {}) => {
  const onSay = vi.fn();
  render(h(SpectatorChat, { lines, onSay, ...over }), document.body);
  return onSay;
};

const hold = (over: Partial<Parameters<typeof SpectatorChat>[0]> = {}) => {
  const onTalk = vi.fn();
  render(
    h(SpectatorChat, { lines, onSay: vi.fn(), onTalk, talking: false, ...over }),
    document.body,
  );
  return onTalk;
};
const talkButton = () => document.querySelector("button.talk-mic") as HTMLButtonElement | null;

describe("SpectatorChat", () => {
  it("is a labelled region that says players cannot see it", () => {
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

  it("shows only the newest few lines, so it never needs to scroll", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      nickname: "Gus",
      text: `line ${i}`,
    }));
    mount({ lines: many });
    const items = [...document.querySelectorAll("li")].map((li) => li.textContent);
    expect(items).toHaveLength(6);
    expect(items.at(-1)).toBe("Gus: line 9");
    expect(items[0]).toBe("Gus: line 4");
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

  it("has a hold-to-talk button for the watchers' voice, named with its key", async () => {
    const onTalk = hold();
    const button = talkButton();
    expect(button?.textContent).toMatch(/Hold to talk/);
    expect(button?.getAttribute("aria-keyshortcuts")).toBe("V");
    await act(() => {
      button?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    await act(() => {
      button?.dispatchEvent(new Event("pointerup", { bubbles: true }));
    });
    expect(onTalk.mock.calls).toEqual([[true], [false]]);
  });

  it("says while the mic is open, in words and not only a colour", () => {
    hold({ talking: true });
    expect(talkButton()?.getAttribute("aria-pressed")).toBe("true");
    expect(document.body.textContent).toMatch(/Mic live/);
  });

  it("says why there is no mic when the browser cannot give one", () => {
    hold({ micNote: "Microphone blocked: voice is off. Chat still works." });
    expect(talkButton()).toBeNull();
    expect(document.body.textContent).toMatch(/Microphone blocked/);
  });
});

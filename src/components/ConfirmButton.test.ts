// @vitest-environment jsdom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmButton } from "./ConfirmButton.tsx";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  render(null, document.body);
  document.body.innerHTML = "";
});

function mount(onConfirm: () => void) {
  render(
    h(ConfirmButton, {
      label: "Restart room",
      confirmLabel: "Sure? Restart room",
      onConfirm,
      class: "hud-btn",
    }),
    document.body,
  );
  return document.querySelector("button") as HTMLButtonElement;
}

describe("ConfirmButton", () => {
  it("does nothing on the first press except ask", async () => {
    const onConfirm = vi.fn();
    const button = mount(onConfirm);
    expect(button.textContent).toBe("Restart room");
    await act(() => button.click());
    expect(onConfirm).not.toHaveBeenCalled();
    expect(button.textContent).toBe("Sure? Restart room");
    expect(button.classList.contains("asking")).toBe(true);
  });

  it("acts on the second press, and goes back to its first label", async () => {
    const onConfirm = vi.fn();
    const button = mount(onConfirm);
    await act(() => button.click());
    await act(() => button.click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(button.textContent).toBe("Restart room");
  });

  it("stops asking after 3 s, so a stray tap later starts again", async () => {
    const onConfirm = vi.fn();
    const button = mount(onConfirm);
    await act(() => button.click());
    await act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(button.textContent).toBe("Restart room");
    await act(() => button.click());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("tells assistive technology to press again", async () => {
    const button = mount(() => {});
    await act(() => button.click());
    expect(document.querySelector("[role=status]")?.textContent).toMatch(/press again/i);
  });
});

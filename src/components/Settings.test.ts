// @vitest-environment jsdom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Settings } from "./Settings.tsx";

afterEach(() => {
  render(null, document.body);
  document.body.innerHTML = "";
});

const settings = {
  captions: true,
  sound: true,
  speech: true,
  keepOpen: false,
  highContrast: false,
  maskNoiseOn: true,
  volume: 0.5,
};

async function open(onLeave: () => void) {
  render(
    h(Settings, {
      role: "mute",
      settings,
      onChange: () => {},
      onLeave,
      maskNoiseAvailable: false,
      othersSoundOff: false,
    }),
    document.body,
  );
  await act(() => (document.querySelector("button.hud-btn") as HTMLButtonElement).click());
  return [...document.querySelectorAll("button")].find((b) => /leave/i.test(b.textContent ?? ""));
}

async function openAs(
  role: "blind" | "deaf" | "mute",
  maskNoiseAvailable: boolean,
  onChange = () => {},
  othersSoundOff = false,
) {
  render(
    h(Settings, {
      role,
      settings,
      onChange,
      onLeave: () => {},
      maskNoiseAvailable,
      othersSoundOff,
    }),
    document.body,
  );
  await act(() => (document.querySelector("button.hud-btn") as HTMLButtonElement).click());
}

describe("Settings: high contrast", () => {
  it("offers a high-contrast toggle to every role, not disabled for Can't hear", async () => {
    render(
      h(Settings, {
        role: "deaf",
        settings,
        onChange: () => {},
        onLeave: () => {},
        maskNoiseAvailable: false,
        othersSoundOff: false,
      }),
      document.body,
    );
    await act(() => (document.querySelector("button.hud-btn") as HTMLButtonElement).click());
    const toggle = [...document.querySelectorAll("input[type=checkbox]")].find((i) =>
      /high contrast/i.test(i.closest("label")?.textContent ?? ""),
    ) as HTMLInputElement;
    expect(toggle).toBeTruthy();
    expect(toggle.disabled).toBe(false);
  });

  it("calls onChange with highContrast flipped", async () => {
    const onChange = vi.fn();
    render(
      h(Settings, {
        role: "mute",
        settings,
        onChange,
        onLeave: () => {},
        maskNoiseAvailable: false,
        othersSoundOff: false,
      }),
      document.body,
    );
    await act(() => (document.querySelector("button.hud-btn") as HTMLButtonElement).click());
    const toggle = [...document.querySelectorAll("input[type=checkbox]")].find((i) =>
      /high contrast/i.test(i.closest("label")?.textContent ?? ""),
    ) as HTMLInputElement;
    await act(() => toggle.click());
    expect(onChange).toHaveBeenCalledWith({ ...settings, highContrast: true });
  });
});

describe("Settings: masking noise", () => {
  it("is not offered to a role that isn't Can't hear", async () => {
    await openAs("mute", true);
    expect(document.body.textContent).not.toMatch(/masking noise/i);
  });

  it("offers a toggle and a volume slider when the host has turned it on", async () => {
    await openAs("deaf", true);
    const toggle = document.querySelector('input[type="checkbox"][name="mask-noise"]');
    const slider = document.querySelector('input[type="range"]');
    expect((toggle as HTMLInputElement)?.disabled).toBe(false);
    expect((slider as HTMLInputElement)?.disabled).toBe(false);
  });

  it("is greyed out with an explanation when the host hasn't turned it on", async () => {
    await openAs("deaf", false);
    const toggle = document.querySelector('input[type="checkbox"][name="mask-noise"]');
    const slider = document.querySelector('input[type="range"]');
    expect((toggle as HTMLInputElement)?.disabled).toBe(true);
    expect((slider as HTMLInputElement)?.disabled).toBe(true);
    expect(document.body.textContent).toMatch(/real-life setup/i);
  });

  it("calls onChange with maskNoiseOn flipped", async () => {
    const onChange = vi.fn();
    await openAs("deaf", true, onChange);
    const toggle = document.querySelector(
      'input[type="checkbox"][name="mask-noise"]',
    ) as HTMLInputElement;
    await act(() => toggle.click());
    expect(onChange).toHaveBeenCalledWith({ ...settings, maskNoiseOn: false });
  });
});

describe("Settings: forced captions (host turned off game sound)", () => {
  it("shows captions checked and disabled, and game sound unchecked and disabled, with a note", async () => {
    await openAs("blind", false, () => {}, true);
    const checkbox = (label: string) =>
      [...document.querySelectorAll("input[type=checkbox]")].find((i) =>
        new RegExp(label, "i").test(i.closest("label")?.textContent ?? ""),
      ) as HTMLInputElement;
    const captions = checkbox("^captions$");
    const sound = checkbox("game sound");
    expect(captions.checked).toBe(true);
    expect(captions.disabled).toBe(true);
    expect(sound.checked).toBe(false);
    expect(sound.disabled).toBe(true);
    expect(document.body.textContent).toMatch(/host turned off game sound/i);
  });

  it("does not disable captions or sound for Can't hear, who has their own note already", async () => {
    await openAs("deaf", false, () => {}, true);
    expect(document.body.textContent).not.toMatch(/host turned off game sound/i);
  });

  it("leaves spoken lines alone: the say channel is unaffected", async () => {
    await openAs("mute", false, () => {}, true);
    const speech = [...document.querySelectorAll("input[type=checkbox]")].find((i) =>
      /spoken lines/i.test(i.closest("label")?.textContent ?? ""),
    ) as HTMLInputElement;
    expect(speech.disabled).toBe(false);
  });
});

describe("Settings: Leave game", () => {
  it("is tucked inside the panel, not on the bar", async () => {
    render(
      h(Settings, {
        role: "mute",
        settings,
        onChange: () => {},
        onLeave: () => {},
        maskNoiseAvailable: false,
        othersSoundOff: false,
      }),
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

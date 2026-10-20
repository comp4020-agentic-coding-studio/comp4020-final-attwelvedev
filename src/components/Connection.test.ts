// @vitest-environment jsdom
import { h, render } from "preact";
import { afterEach, describe, expect, it } from "vitest";
import { Connection } from "./Connection.tsx";

afterEach(() => {
  render(null, document.body);
  document.body.innerHTML = "";
});

const mount = (state: Parameters<typeof Connection>[0]["state"], rttMs: number | null = null) =>
  render(h(Connection, { state, rttMs }), document.body);

describe("Connection: the live light", () => {
  it("says Live in words, with a dot that is only decoration", () => {
    mount("live");
    const pill = document.querySelector(".conn") as HTMLElement;
    expect(pill.getAttribute("role")).toBe("status");
    expect(pill.textContent).toContain("Live");
    expect(pill.querySelector(".conn-dot")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps a different shape and wording for each state, never colour alone", () => {
    const dots: string[] = [];
    for (const [state, words] of [
      ["live", "Live"],
      ["weak", "Weak 300 ms"],
      ["offline", "Offline. Retrying…"],
      ["connecting", "Connecting…"],
    ] as const) {
      mount(state, 300);
      const pill = document.querySelector(".conn") as HTMLElement;
      expect(pill.className).toContain(`conn-${state}`);
      expect(pill.textContent).toContain(words);
      dots.push(pill.querySelector(".conn-dot")?.textContent ?? "");
    }
    expect(new Set(dots).size).toBe(4);
  });
});

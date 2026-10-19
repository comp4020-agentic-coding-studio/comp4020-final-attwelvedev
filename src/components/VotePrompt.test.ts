// @vitest-environment jsdom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type OpenVote, outcomeText, VotePrompt } from "./VotePrompt.tsx";

afterEach(() => {
  render(null, document.body);
  document.body.innerHTML = "";
});

const vote: OpenVote = { kind: "room", by: "Ana", until: 0, yes: [0], no: [], voters: [0, 1, 2] };
const names = () => [...document.querySelectorAll("button")].map((b) => b.textContent);
const mount = (seat: 0 | 1 | 2 | null, over: Partial<OpenVote> = {}, onCast = vi.fn()) => {
  render(
    h(VotePrompt, { vote: { ...vote, ...over }, seat, secondsLeft: 12, onCast }),
    document.body,
  );
  return onCast;
};

describe("VotePrompt", () => {
  it("is an alertdialog that says who asked for what, and how long is left", () => {
    mount(1);
    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog?.textContent).toMatch(/Ana wants to restart the room/);
    expect(dialog?.textContent).toContain("0:12");
  });

  it("asks someone who has not answered, and passes their answer on", async () => {
    const onCast = mount(1);
    expect(names()).toEqual(["Yes", "No"]);
    await act(() => (document.querySelectorAll("button")[1] as HTMLButtonElement).click());
    expect(onCast).toHaveBeenCalledWith(false);
  });

  it("says what a heist restart does", () => {
    mount(1, { kind: "heist" });
    expect(document.body.textContent).toMatch(/restart the heist from room 1/);
  });

  it("does not ask the one who proposed, whose yes is counted already", () => {
    mount(0);
    expect(names()).toEqual([]);
    expect(document.body.textContent).toMatch(/1 of 3 said yes/);
  });

  it("does not ask someone who is not a voter", () => {
    mount(null);
    expect(names()).toEqual([]);
  });
});

describe("outcomeText", () => {
  it("is one line each", () => {
    expect(outcomeText("room", "passed")).toBe("Restarting the room.");
    expect(outcomeText("heist", "passed")).toBe("Back to room 1.");
    expect(outcomeText("room", "declined", "Bo")).toBe("Bo said no. Nothing restarts.");
    expect(outcomeText("room", "timeout")).toBe("No answer in time. Nothing restarts.");
  });
});

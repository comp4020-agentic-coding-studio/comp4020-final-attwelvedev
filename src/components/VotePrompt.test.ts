// @vitest-environment jsdom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrewMember } from "../net/protocol.ts";
import { type OpenVote, outcomeText, VotePrompt } from "./VotePrompt.tsx";

afterEach(() => {
  render(null, document.body);
  document.body.innerHTML = "";
});

const crew: CrewMember[] = [
  { seat: 0, role: "blind", nickname: "Ana", bot: false },
  { seat: 1, role: "deaf", nickname: "Bo", bot: false },
  { seat: 2, role: "mute", nickname: "Cy", bot: false },
];
const vote: OpenVote = {
  kind: "room",
  by: "Ana",
  until: 0,
  total: 15000,
  yes: [0],
  no: [],
  voters: [0, 1, 2],
};
const names = () => [...document.querySelectorAll("button")].map((b) => b.textContent);
const mount = (seat: 0 | 1 | 2 | null, over: Partial<OpenVote> = {}, onCast = vi.fn()) => {
  render(
    h(VotePrompt, { vote: { ...vote, ...over }, seat, crew, secondsLeft: 12, onCast }),
    document.body,
  );
  return onCast;
};
const chips = () => [...document.querySelectorAll(".vote-voters li")].map((li) => li.textContent);

describe("VotePrompt", () => {
  it("is an alertdialog that says who asked for what, and how long is left", () => {
    mount(1);
    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog?.textContent).toMatch(/Ana wants to restart the room/);
    expect(dialog?.querySelector('[role="timer"]')?.textContent).toBe("0:12");
  });

  it("draws the time left as a bar as well as a number", () => {
    mount(1);
    const fill = document.querySelector(".vote-bar > span") as HTMLElement;
    expect(fill.style.width).toBe("80%");
    expect(document.querySelector(".vote-bar")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("names each voter with their shape and what they have said, in words", () => {
    mount(1, { yes: [0, 2], no: [] });
    expect(chips()).toEqual(["Ana yes", "Bo waiting", "Cy yes"]);
    expect(document.querySelectorAll(".vote-voters li svg")).toHaveLength(3);
    mount(1, { yes: [0], no: [2] });
    expect(chips()).toEqual(["Ana yes", "Bo waiting", "Cy no"]);
  });

  it("leaves out anyone who is not a voter", () => {
    mount(1, { voters: [0, 1] });
    expect(chips()).toEqual(["Ana yes", "Bo waiting"]);
  });

  it("asks someone who has not answered, and passes their answer on", async () => {
    const onCast = mount(1);
    expect(names()).toEqual(["Restart room", "Keep playing"]);
    await act(() => (document.querySelectorAll("button")[1] as HTMLButtonElement).click());
    expect(onCast).toHaveBeenCalledWith(false);
  });

  it("says what a heist restart does, and puts it on the Yes button", () => {
    mount(1, { kind: "heist" });
    expect(document.body.textContent).toMatch(/restart the heist from room 1/);
    expect(names()).toEqual(["Restart heist", "Keep playing"]);
  });

  it("does not ask the one who proposed, whose yes is counted already", () => {
    mount(0);
    expect(names()).toEqual([]);
    expect(chips()).toContain("Ana yes");
  });

  it("does not ask someone who is not a voter", () => {
    mount(null);
    expect(names()).toEqual([]);
  });
});

describe("outcomeText", () => {
  it("says in one line how a vote ended", () => {
    expect(outcomeText("room", "passed")).toBe("Restarting the room.");
    expect(outcomeText("heist", "passed")).toBe("Back to room 1.");
    expect(outcomeText("room", "declined", "Bo")).toBe("Not restarted: Bo kept playing.");
    expect(outcomeText("heist", "declined", "Bo")).toBe("Not restarted: Bo kept playing.");
    expect(outcomeText("room", "declined")).toBe("Not restarted: someone kept playing.");
    expect(outcomeText("room", "timeout")).toBe("Not restarted: time ran out.");
  });
});

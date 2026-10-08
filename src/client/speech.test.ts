import { describe, expect, it } from "vitest";
import type { Role } from "../game/types.ts";
import { createSpeech, SUPERSEDE_MS } from "./speech.ts";

function fake() {
  const log: string[] = [];
  let at = 1000;
  const synth = {
    speak: (u: { text: string }) => log.push(`speak:${u.text}`),
    cancel: () => log.push("cancel"),
  };
  const speech = (role: Role, enabled = true) =>
    createSpeech({
      synth,
      role,
      enabled: () => enabled,
      utter: (text) => ({ text }),
      now: () => at,
    });
  return { log, speech, advance: (ms: number) => (at += ms) };
}

describe("createSpeech", () => {
  it("speaks for Can't see and Can't speak while spoken lines are on", () => {
    for (const role of ["blind", "mute"] as const) {
      const f = fake();
      f.speech(role, true).say("door is left");
      expect(f.log).toEqual(["speak:door is left"]);
    }
  });

  it("is silent for everyone while spoken lines are off", () => {
    for (const role of ["blind", "mute"] as const) {
      const f = fake();
      f.speech(role, false).say("hi");
      expect(f.log).toEqual([]);
    }
  });

  it("never speaks for Can't hear", () => {
    const f = fake();
    f.speech("deaf").say("hi");
    expect(f.log).toEqual([]);
  });

  it("cancels the old line when a newer one arrives within 300 ms of it starting", () => {
    const f = fake();
    const s = f.speech("blind");
    s.say("one");
    f.advance(SUPERSEDE_MS - 1);
    s.say("two");
    expect(f.log).toEqual(["speak:one", "cancel", "speak:two"]);
  });

  it("lets the old line finish when the newer one comes later", () => {
    const f = fake();
    const s = f.speech("blind");
    s.say("one");
    f.advance(SUPERSEDE_MS);
    s.say("two");
    expect(f.log).toEqual(["speak:one", "speak:two"]);
  });

  it("does nothing, quietly, when the browser has no speech synthesis", () => {
    const s = createSpeech({ synth: null, role: "blind", enabled: () => true, utter: (t) => t });
    expect(() => s.say("hi")).not.toThrow();
  });
});

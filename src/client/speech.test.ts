import { describe, expect, it } from "vitest";
import type { Role } from "../game/types.ts";
import { askShownAsLine, createSpeech, SUPERSEDE_MS, speakWhile } from "./speech.ts";

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

// B2 (playtest 3): a bot's lines were still being spoken on the next room's reveal. The browser's
// speech queue is global and outlives the game that queued it: the game (keyed by reveal) unmounts
// when the next reveal opens, and its message listener's cleanup must empty the queue.
describe("speakWhile", () => {
  it("speaks what arrives while listening, and when the listener goes the queue is emptied", () => {
    const f = fake();
    const speech = f.speech("blind");
    const listener: { say: ((text: string) => void) | null } = { say: null };
    const stop = speakWhile(speech, (say) => {
      listener.say = say;
      return () => {
        listener.say = null;
      };
    });
    listener.say?.("left");
    f.advance(SUPERSEDE_MS);
    listener.say?.("go");
    expect(f.log).toEqual(["speak:left", "speak:go"]);
    stop(); // the next reveal opens
    expect(listener.say).toBeNull();
    expect(f.log.at(-1)).toBe("cancel");
  });
});

describe("an ask shown as a caption line", () => {
  it("Can't see reads it when spoken lines are off, or when captions are on", () => {
    expect(askShownAsLine("blind", false, false)).toBe(true);
    expect(askShownAsLine("blind", true, true)).toBe(true);
    expect(askShownAsLine("blind", true, false)).toBe(false);
  });
  it("Can't speak and Can't hear get no line, whatever the settings", () => {
    for (const speechOn of [true, false])
      for (const captionsOn of [true, false]) {
        expect(askShownAsLine("mute", speechOn, captionsOn)).toBe(false);
        expect(askShownAsLine("deaf", speechOn, captionsOn)).toBe(false);
      }
  });
});

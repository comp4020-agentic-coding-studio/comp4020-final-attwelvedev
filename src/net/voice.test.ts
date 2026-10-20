import { describe, expect, it } from "vitest";
import {
  createRateLimiter,
  encodeVoiceOut,
  encodeWatcherVoice,
  MAX_FRAME_BYTES,
  MAX_FRAMES_PER_S,
  parseVoiceFrame,
  voiceReceivers,
} from "./voice.ts";

function frameIn(opus: Uint8Array, seq = 7, captureServerMs = 1234.5, type = 1): Uint8Array {
  const buf = new Uint8Array(13 + opus.length);
  const view = new DataView(buf.buffer);
  buf[0] = type;
  view.setUint32(1, seq);
  view.setFloat64(5, captureServerMs);
  buf.set(opus, 13);
  return buf;
}

describe("voice frames", () => {
  it("parses a frame and re-encodes it with the sender's seat in the header", () => {
    const opus = Uint8Array.from([9, 8, 7, 6]);
    const parsed = parseVoiceFrame(frameIn(opus));
    expect(parsed).toEqual({ seq: 7, captureServerMs: 1234.5, opus });
    const out = encodeVoiceOut(2, parsed as NonNullable<typeof parsed>);
    const view = new DataView(out.buffer, out.byteOffset);
    expect(out[0]).toBe(1);
    expect(out[1]).toBe(2);
    expect(view.getUint32(2)).toBe(7);
    expect(view.getFloat64(6)).toBe(1234.5);
    expect([...out.slice(14)]).toEqual([9, 8, 7, 6]);
  });

  it("refuses a frame over the size limit, the wrong type byte, or a short header", () => {
    expect(parseVoiceFrame(new Uint8Array(MAX_FRAME_BYTES + 1).fill(1))).toBeNull();
    expect(parseVoiceFrame(frameIn(Uint8Array.from([1, 2]), 1, 0, 2))).toBeNull();
    expect(parseVoiceFrame(new Uint8Array(5))).toBeNull();
    expect(parseVoiceFrame(frameIn(new Uint8Array(0)))).toBeNull(); // no audio in it
  });
});

describe("voiceReceivers", () => {
  const roles: ["blind", "deaf", "mute"] = ["blind", "deaf", "mute"];
  it("is null for Can't speak, and when voice is off", () => {
    expect(voiceReceivers(roles, 2, true)).toBeNull();
    expect(voiceReceivers(roles, 1, false)).toBeNull();
  });
  it("sends Can't hear's voice to Can't see and Can't speak", () => {
    expect(voiceReceivers(roles, 1, true)).toEqual([0, 2]);
  });
  it("sends Can't see's voice to Can't speak only, never back to the sender", () => {
    expect(voiceReceivers(roles, 0, true)).toEqual([2]);
  });
  it("follows the roles, not the seat numbers", () => {
    expect(voiceReceivers(["mute", "blind", "deaf"], 2, true)).toEqual([0, 1]);
  });
});

describe("encodeWatcherVoice", () => {
  it("re-encodes a frame for the other watchers with header 0x02 and the speaker's place in the list", () => {
    const parsed = parseVoiceFrame(frameIn(Uint8Array.from([9, 8, 7, 6]), 11, 99.5));
    const out = encodeWatcherVoice(4, parsed as NonNullable<typeof parsed>);
    const view = new DataView(out.buffer, out.byteOffset);
    expect(out[0]).toBe(2); // not 1: a player's voice and a watcher's are never confused
    expect(out[1]).toBe(4);
    expect(view.getUint32(2)).toBe(11);
    expect(view.getFloat64(6)).toBe(99.5);
    expect([...out.slice(14)]).toEqual([9, 8, 7, 6]);
    expect(out.length).toBe(14 + 4);
  });
});

describe("createRateLimiter", () => {
  it("refuses the 26th frame within a second, then allows again", () => {
    const limiter = createRateLimiter();
    for (let i = 0; i < MAX_FRAMES_PER_S; i++) expect(limiter.allow("a", 1000 + i)).toBe(true);
    expect(limiter.allow("a", 1500)).toBe(false);
    expect(limiter.allow("b", 1500)).toBe(true); // each device has its own budget
    expect(limiter.allow("a", 2100)).toBe(true);
  });

  it("allows 25 frames a second per device, independently of any seat number", () => {
    // seat 0 of two different lobbies is two devices: one must not use up the other's budget
    const limiter = createRateLimiter();
    for (let i = 0; i < MAX_FRAMES_PER_S; i++) {
      expect(limiter.allow("device-in-lobby-1", 1000 + i)).toBe(true);
    }
    expect(limiter.allow("device-in-lobby-1", 1500)).toBe(false);
    for (let i = 0; i < MAX_FRAMES_PER_S; i++) {
      expect(limiter.allow("device-in-lobby-2", 1000 + i)).toBe(true);
    }
  });

  it("forgets a device's frames once they are over a second old, so it does not grow forever", () => {
    const limiter = createRateLimiter();
    limiter.allow("a", 0);
    limiter.allow("a", 5000);
    expect(limiter.size()).toBe(1);
    limiter.allow("b", 5000);
    limiter.sweep(10_000);
    expect(limiter.size()).toBe(0);
  });
});

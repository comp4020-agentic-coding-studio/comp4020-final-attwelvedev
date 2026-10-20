import { canReceive, canSend, type Role, type Seat } from "../game/types.ts";

// Wire format (phase 08 §4). In: [0x01][u32 seq][f64 captureServerMs][opus…].
// Out: [0x01][u8 seat][u32 seq][f64 captureServerMs][opus…]. A watcher's voice goes out with 0x02 and
// the watcher's place in the watchers' list instead of a seat, so it can't be taken for a player's.
// Voice frames are the only binary frames on the socket, and nothing here is ever logged.
const VOICE = 1;
const WATCHER_VOICE = 2;
const HEADER_IN = 13;
export const MAX_FRAME_BYTES = 400;
export const MAX_FRAMES_PER_S = 25;

export interface VoiceFrameIn {
  seq: number;
  captureServerMs: number;
  opus: Uint8Array;
}

export function parseVoiceFrame(buf: Uint8Array): VoiceFrameIn | null {
  if (buf.length <= HEADER_IN || buf.length > MAX_FRAME_BYTES || buf[0] !== VOICE) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return {
    seq: view.getUint32(1),
    captureServerMs: view.getFloat64(5),
    opus: buf.slice(HEADER_IN),
  };
}

export function encodeVoiceOut(seat: Seat, frame: VoiceFrameIn): Uint8Array {
  const out = new Uint8Array(14 + frame.opus.length);
  const view = new DataView(out.buffer);
  out[0] = VOICE;
  out[1] = seat;
  view.setUint32(2, frame.seq);
  view.setFloat64(6, frame.captureServerMs);
  out.set(frame.opus, 14);
  return out;
}

// A watcher's frame for the other watchers: [0x02][u8 watcher index][u32 seq][f64 captureServerMs][opus…].
export function encodeWatcherVoice(index: number, frame: VoiceFrameIn): Uint8Array {
  const out = encodeVoiceOut(index as Seat, frame);
  out[0] = WATCHER_VOICE;
  return out;
}

// Who hears this sender, from the voice rule; null when the sender may not speak
// (or voice is off), which the caller answers with cant-send.
export function voiceReceivers(
  roles: [Role, Role, Role],
  from: Seat,
  voiceOn: boolean,
): Seat[] | null {
  if (!voiceOn || !canSend(roles[from], "voice")) return null;
  return ([0, 1, 2] as const).filter((s) => s !== from && canReceive(roles[s], "voice"));
}

export interface RateLimiter {
  allow(key: string, now: number): boolean;
  sweep(now: number): void; // forgets whoever has sent nothing for a second
  size(): number;
}

// At most MAX_FRAMES_PER_S frames in any trailing second, per key. The key is a device: a seat
// number is shared by every lobby's seat 0, so keyed on it one lobby's talker would use up another's.
export function createRateLimiter(): RateLimiter {
  const sent = new Map<string, number[]>();
  return {
    allow(key, now) {
      const recent = (sent.get(key) ?? []).filter((t) => now - t < 1000);
      const ok = recent.length < MAX_FRAMES_PER_S;
      if (ok) recent.push(now);
      sent.set(key, recent);
      return ok;
    },
    sweep(now) {
      for (const [key, times] of sent) {
        if (times.every((t) => now - t >= 1000)) sent.delete(key);
      }
    },
    size: () => sent.size,
  };
}

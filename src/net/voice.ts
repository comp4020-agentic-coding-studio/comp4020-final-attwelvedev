import { CHANNEL_RULES, type Role, type Seat } from "../game/types.ts";

// Wire format (phase 08 §4). In: [0x01][u32 seq][f64 captureServerMs][opus…].
// Out: [0x01][u8 seat][u32 seq][f64 captureServerMs][opus…]. Voice frames are the
// only binary frames on the socket, and nothing here is ever logged.
const VOICE = 1;
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

// Who hears this sender, from the Say rule; null when the sender may not speak
// (or voice is off), which the caller answers with cant-send.
export function voiceReceivers(
  roles: [Role, Role, Role],
  from: Seat,
  voiceOn: boolean,
): Seat[] | null {
  const say = CHANNEL_RULES.say;
  if (!voiceOn || !say.send.includes(roles[from])) return null;
  return ([0, 1, 2] as const).filter((s) => s !== from && say.receive.includes(roles[s]));
}

export interface RateLimiter {
  allow(seat: Seat, now: number): boolean;
}

// At most MAX_FRAMES_PER_S frames in any trailing second, per seat.
export function createRateLimiter(): RateLimiter {
  const sent = new Map<Seat, number[]>();
  return {
    allow(seat, now) {
      const recent = (sent.get(seat) ?? []).filter((t) => now - t < 1000);
      const ok = recent.length < MAX_FRAMES_PER_S;
      if (ok) recent.push(now);
      sent.set(seat, recent);
      return ok;
    },
  };
}

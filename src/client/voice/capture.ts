import type { GameSocket } from "../socket.ts";
import { FRAME_MS } from "./playback.ts";

export type VoiceSupport = "ok" | "no-encoder" | "insecure";

// Whether this browser can send and hear voice: WebCodecs audio, and a page the browser trusts with
// the microphone (HTTPS or localhost).
export function voiceSupport(): VoiceSupport {
  if (typeof AudioEncoder === "undefined" || typeof AudioDecoder === "undefined") {
    return "no-encoder";
  }
  if (!navigator.mediaDevices?.getUserMedia) return "insecure";
  return "ok";
}

const RATE = 48000;
const SAMPLES = (RATE * FRAME_MS) / 1000; // 2880 samples in a 60 ms frame

export interface Capture {
  talk(on: boolean): void; // frames are only sent while this is on
  stop(): void;
}

// Opens the microphone and starts encoding it. Rejects with the browser's error when the person (or
// the browser) says no, so the caller can tell "blocked" from a fault. Nothing leaves this page until
// `talk(true)`; the frames carry the capture time on the server's clock, for the latency measure.
export async function startCapture(socket: GameSocket): Promise<Capture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  });
  const ctx = new AudioContext({ sampleRate: RATE });
  let talking = false;
  let seq = 0;
  let timestamp = 0;
  let pending = new Float32Array(SAMPLES);
  let filled = 0;
  const encoder = new AudioEncoder({
    output: (chunk) => {
      if (!talking) return;
      const opus = new Uint8Array(chunk.byteLength);
      chunk.copyTo(opus);
      const frame = new Uint8Array(13 + opus.length);
      const view = new DataView(frame.buffer);
      frame[0] = 1;
      view.setUint32(1, seq++ >>> 0);
      view.setFloat64(5, Date.now() + (socket.clockOffset() ?? 0));
      frame.set(opus, 13);
      socket.sendBinary(frame);
    },
    error: () => undefined,
  });
  encoder.configure({
    codec: "opus",
    sampleRate: RATE,
    numberOfChannels: 1,
    bitrate: 24000,
    opus: { frameDuration: FRAME_MS * 1000 },
  });
  await ctx.audioWorklet.addModule("/voice-worklet.js");
  const tap = new AudioWorkletNode(ctx, "voice-tap");
  tap.port.onmessage = (e: MessageEvent<Float32Array>) => {
    if (!talking) return;
    let at = 0;
    while (at < e.data.length) {
      const take = Math.min(SAMPLES - filled, e.data.length - at);
      pending.set(e.data.subarray(at, at + take), filled);
      filled += take;
      at += take;
      if (filled === SAMPLES) {
        const audio = new AudioData({
          format: "f32",
          sampleRate: RATE,
          numberOfFrames: SAMPLES,
          numberOfChannels: 1,
          timestamp,
          data: pending,
        });
        encoder.encode(audio);
        audio.close(); // the encoder keeps its own reference: this one would otherwise leak
        timestamp += FRAME_MS * 1000;
        pending = new Float32Array(SAMPLES);
        filled = 0;
      }
    }
  };
  ctx.createMediaStreamSource(stream).connect(tap);
  return {
    talk(on) {
      if (on && ctx.state === "suspended") void ctx.resume();
      if (!on) filled = 0; // half a frame of a finished word is not sent with the next one
      talking = on;
    },
    stop() {
      talking = false;
      for (const track of stream.getTracks()) track.stop();
      if (encoder.state !== "closed") encoder.close();
      void ctx.close();
    },
  };
}

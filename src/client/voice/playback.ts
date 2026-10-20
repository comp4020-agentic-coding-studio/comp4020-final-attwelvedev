import type { GameSocket } from "../socket.ts";

export const FRAME_MS = 60;
const BUFFER_S = 0.06; // the jitter buffer: playback starts this far ahead of the first frame
const MAX_LATENCY_MS = 300; // a frame this late on arrival is stale: dropped, not played
export const LAG_P95_MS = 400; // above this the HUD says "Voice lagging"
const STATS_EVERY_MS = 5000;
const HEADER = 14; // [0x01 | 0x02][u8 seat or watcher index][u32 seq][f64 captureServerMs]
// A watcher's frame (0x02) goes into a lane of its own, past the three seats, so a spectator
// talking never shares a decoder with a player.
export const WATCHER_LANE = 10;

export interface Frame {
  lane: number;
  seq: number;
  captureServerMs: number;
  opus: Uint8Array;
}

// A relayed voice frame, or null for anything that isn't one: no audio after the header, or a first
// byte that is neither a player's (0x01) nor a watcher's (0x02).
export function parseFrame(buf: Uint8Array): Frame | null {
  if (buf.length <= HEADER || (buf[0] !== 1 && buf[0] !== 2)) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return {
    lane: (buf[0] === 2 ? WATCHER_LANE : 0) + (buf[1] as number),
    seq: view.getUint32(2),
    captureServerMs: view.getFloat64(6),
    opus: buf.subarray(HEADER),
  };
}

export interface JitterDecision {
  play: boolean;
  at: number; // AudioContext time
}

// When to play a frame that arrived `frameLatencyMs` after it was captured. Frames follow each other
// back to back; after a gap the buffer starts again; a late frame, or one that would wait behind more
// than the buffer and two frames of audio, is dropped so latency never builds up.
export function schedule(
  frameLatencyMs: number,
  nowCtx: number,
  lastEndCtx: number,
  frameMs = FRAME_MS,
): JitterDecision {
  if (frameLatencyMs > MAX_LATENCY_MS) return { play: false, at: nowCtx };
  if (lastEndCtx < nowCtx) return { play: true, at: nowCtx + BUFFER_S };
  if (lastEndCtx - nowCtx > BUFFER_S + (2 * frameMs) / 1000) return { play: false, at: nowCtx };
  return { play: true, at: lastEndCtx };
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] as number;
}

export const canDecode = (): boolean =>
  typeof AudioDecoder !== "undefined" && typeof AudioContext !== "undefined";

export interface VoicePlayer {
  stop(): void;
}

// Plays the voice frames the server relays: one Opus decoder per speaking seat, scheduled through the
// jitter buffer, with latency measured from each frame's capture stamp (this page's clock plus its
// offset to the server's). Every 5 s while frames arrive it reports p50, p95 and the drop count.
export function startPlayer(
  socket: GameSocket,
  hooks: {
    onFrame: (lane: number) => void; // a frame from this seat (or WATCHER_LANE + n) arrived, played or not
    onLag: (lagging: boolean) => void;
  },
): VoicePlayer {
  const ctx = new AudioContext({ sampleRate: 48000 });
  const seats = new Map<number, { decoder: AudioDecoder; lastEnd: number; due: number[] }>();
  let latencies: number[] = [];
  let dropped = 0;

  function lane(seat: number) {
    let made = seats.get(seat);
    if (made) return made;
    const due: number[] = [];
    const decoder = new AudioDecoder({
      output: (data) => {
        const at = due.shift();
        const buffer = ctx.createBuffer(
          data.numberOfChannels,
          data.numberOfFrames,
          data.sampleRate,
        );
        for (let c = 0; c < data.numberOfChannels; c++) {
          const plane = new Float32Array(data.numberOfFrames);
          data.copyTo(plane, { planeIndex: c, format: "f32-planar" });
          buffer.copyToChannel(plane, c);
        }
        data.close();
        if (at === undefined) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(Math.max(at, ctx.currentTime));
      },
      error: () => undefined, // a bad packet costs a frame, never the page
    });
    decoder.configure({ codec: "opus", sampleRate: 48000, numberOfChannels: 1 });
    made = { decoder, lastEnd: 0, due };
    seats.set(seat, made);
    return made;
  }

  const offBinary = socket.onBinary((buf) => {
    const frame = parseFrame(buf);
    if (!frame) return;
    hooks.onFrame(frame.lane);
    const latency = Date.now() + (socket.clockOffset() ?? 0) - frame.captureServerMs;
    latencies.push(Math.max(0, latency));
    const mine = lane(frame.lane);
    const decision = schedule(latency, ctx.currentTime, mine.lastEnd);
    if (!decision.play) {
      dropped++;
      return;
    }
    if (ctx.state === "suspended") void ctx.resume();
    mine.lastEnd = decision.at + FRAME_MS / 1000;
    mine.due.push(decision.at);
    mine.decoder.decode(
      new EncodedAudioChunk({
        type: "key",
        timestamp: frame.seq * FRAME_MS * 1000,
        data: frame.opus,
      }),
    );
  });

  const reporter = setInterval(() => {
    if (latencies.length === 0) return;
    const p50 = percentile(latencies, 50);
    const p95 = percentile(latencies, 95);
    socket.send({ t: "voice.stats", p50: Math.round(p50), p95: Math.round(p95), dropped });
    hooks.onLag(p95 > LAG_P95_MS);
    latencies = [];
    dropped = 0;
  }, STATS_EVERY_MS);

  return {
    stop() {
      offBinary();
      clearInterval(reporter);
      for (const { decoder } of seats.values()) if (decoder.state !== "closed") decoder.close();
      void ctx.close();
    },
  };
}

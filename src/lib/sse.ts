import { type LiveEvent, subscribe } from "./live.ts";

export const HEARTBEAT_MS = 25_000;

// JSON.stringify never emits a raw newline, so `data:` is always one line,
// even for an item name that contains one.
export function eventFrame(e: LiveEvent): string {
  return `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
}

// A stream of the events on `channels`: a retry hint first, then one frame per
// event and a ping comment every `heartbeatMs` so proxies keep it open. It
// ends when the client goes away (`signal`) or after delivering the event
// `closeWhen` picks out. `follow` is asked about each event once it has been
// delivered and can subscribe or unsubscribe channels on this same stream.
export function eventStream(opts: {
  channels: string[];
  signal: AbortSignal;
  heartbeatMs?: number;
  closeWhen?: (e: LiveEvent) => boolean;
  follow?: (e: LiveEvent) => { add?: string[]; remove?: string[] } | undefined;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let cleanup = () => {};

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const unsubscribers = new Map<string, () => void>();
      let timer: ReturnType<typeof setInterval> | undefined;
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        for (const off of unsubscribers.values()) off();
        opts.signal.removeEventListener("abort", close);
        try {
          controller.close();
        } catch {
          // already cancelled by the reader
        }
      };
      cleanup = () => {
        closed = true;
        clearInterval(timer);
        for (const off of unsubscribers.values()) off();
        opts.signal.removeEventListener("abort", close);
      };
      const send = (text: string) => controller.enqueue(encoder.encode(text));

      if (opts.signal.aborted) return close();
      opts.signal.addEventListener("abort", close);
      send("retry: 2000\n\n");
      const hold = (channel: string) => {
        if (unsubscribers.has(channel)) return;
        unsubscribers.set(
          channel,
          subscribe(channel, (e) => {
            if (closed) return;
            send(eventFrame(e));
            if (opts.closeWhen?.(e)) return close();
            const change = opts.follow?.(e);
            for (const gone of change?.remove ?? []) {
              unsubscribers.get(gone)?.();
              unsubscribers.delete(gone);
            }
            for (const added of change?.add ?? []) hold(added);
          }),
        );
      };
      for (const channel of opts.channels) hold(channel);
      timer = setInterval(() => !closed && send(": ping\n\n"), opts.heartbeatMs ?? HEARTBEAT_MS);
    },
    cancel() {
      cleanup();
    },
  });
}

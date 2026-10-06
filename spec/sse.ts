// A raw reader for GET /events, so a spec can see exactly what a browser's
// EventSource would: when a frame arrives, and when the stream ends.

export interface Frame {
  event: string;
  data: Record<string, unknown>;
}

export interface Stream {
  response: Response;
  // the next event frame, or null if none arrives within `timeoutMs`
  next(timeoutMs: number): Promise<Frame | null>;
  // the first event frame of this type, skipping others; null on timeout
  nextOfType(type: string, timeoutMs: number): Promise<Frame | null>;
  // true if the server ends the stream within `timeoutMs`
  ended(timeoutMs: number): Promise<boolean>;
  close(): void;
}

export async function openStream(baseUrl: string, cookie?: string): Promise<Stream> {
  const abort = new AbortController();
  const response = await fetch(new URL("/events", baseUrl), {
    headers: cookie ? { cookie: `pantry_device=${cookie}` } : {},
    signal: abort.signal,
  });
  const frames: Frame[] = [];
  const waiting: Array<() => void> = [];
  let done = false;
  const notify = () => {
    for (const wake of waiting.splice(0)) wake();
  };

  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    (async () => {
      try {
        for (;;) {
          const { value, done: finished } = await reader.read();
          if (finished) break;
          buffer += decoder.decode(value, { stream: true });
          for (let at = buffer.indexOf("\n\n"); at >= 0; at = buffer.indexOf("\n\n")) {
            const block = buffer.slice(0, at);
            buffer = buffer.slice(at + 2);
            const event = block.match(/^event: (.*)$/m)?.[1];
            const data = block.match(/^data: (.*)$/m)?.[1];
            if (event && data) frames.push({ event, data: JSON.parse(data) });
            notify();
          }
        }
      } catch {
        // aborted by close()
      }
      done = true;
      notify();
    })();
  } else {
    done = true;
  }

  const wait = (timeoutMs: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      waiting.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });

  const next = async (timeoutMs: number): Promise<Frame | null> => {
    const deadline = Date.now() + timeoutMs;
    while (!frames.length && !done && Date.now() < deadline) await wait(deadline - Date.now());
    return frames.shift() ?? null;
  };

  return {
    response,
    next,
    async nextOfType(type, timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const frame = await next(Math.max(0, deadline - Date.now()));
        if (!frame || frame.event === type) return frame;
      }
    },
    async ended(timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      while (!done && Date.now() < deadline) await wait(deadline - Date.now());
      return done;
    },
    close() {
      abort.abort();
    },
  };
}

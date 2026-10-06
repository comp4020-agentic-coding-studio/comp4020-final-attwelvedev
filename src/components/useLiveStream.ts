import { useEffect, useRef, useState } from "preact/hooks";
import type { LiveEvent } from "../lib/live.ts";

const EVENT_TYPES: LiveEvent["type"][] = [
  "item.added",
  "item.removed",
  "item.restored",
  "member.joined",
  "member.removed",
];

const RECONNECTING_AFTER_MS = 3000;
const GIVE_UP_RETRY_MS = 2000;

export interface LiveHandlers {
  onEvent(e: LiveEvent): void;
  // every time the stream opens, first open and each reconnect: refetch a snapshot
  onOpen(): void;
  // the server says this device isn't signed in any more
  onUnauthorised(): void;
}

// Holds one EventSource on /events. `connected` is whether it is open now;
// `reconnecting` turns true only after 3 s without it, so a blink doesn't
// flash a warning.
export function useLiveStream(handlers: LiveHandlers): {
  connected: boolean;
  reconnecting: boolean;
} {
  const latest = useRef(handlers);
  latest.current = handlers;
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    let source: EventSource | null = null;
    let retry: number | undefined;
    let stopped = false;

    const open = () => {
      const es = new EventSource("/events");
      source = es;
      es.onopen = () => {
        setConnected(true);
        latest.current.onOpen();
      };
      for (const type of EVENT_TYPES) {
        es.addEventListener(type, (message) => {
          latest.current.onEvent(JSON.parse((message as MessageEvent<string>).data));
        });
      }
      es.onerror = () => {
        setConnected(false);
        // The browser retries a dropped stream itself. A CLOSED one is one it
        // gave up on (a 401 or a bad status): find out which, then try again.
        if (es.readyState !== EventSource.CLOSED || stopped) return;
        es.close();
        fetch("/api/pantry", { headers: { Accept: "application/json" } })
          .then((res) => {
            if (res.status === 401) latest.current.onUnauthorised();
          })
          .catch(() => {});
        retry = window.setTimeout(open, GIVE_UP_RETRY_MS);
      };
    };

    open();
    return () => {
      stopped = true;
      window.clearTimeout(retry);
      source?.close();
    };
  }, []);

  useEffect(() => {
    if (connected) {
      setReconnecting(false);
      return;
    }
    const timer = window.setTimeout(() => setReconnecting(true), RECONNECTING_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [connected]);

  return { connected, reconnecting };
}

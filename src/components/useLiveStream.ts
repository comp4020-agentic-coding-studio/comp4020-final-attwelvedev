import { useEffect, useRef, useState } from "preact/hooks";
import type { LiveEvent } from "../lib/live.ts";

const EVENT_TYPES: LiveEvent["type"][] = [
  "item.added",
  "item.removed",
  "item.restored",
  "item.updated",
  "member.joined",
  "member.removed",
  "membership.joined",
  "membership.left",
  "community.householdJoined",
  "community.householdLeft",
  "offer.posted",
  "offer.taken",
  "offer.closed",
  "offer.mine",
  "offer.claim",
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

interface Subscriber {
  handlers: { current: LiveHandlers };
  setConnected(connected: boolean): void;
}

// One EventSource per page however many islands use it, reference-counted:
// the first subscriber opens it and the last one closes it. Every subscriber
// hears every event, and each one's onOpen fires on every open (a late joiner
// gets its own at once if the stream is already open).
const subscribers = new Set<Subscriber>();
let source: EventSource | null = null;
let retry: number | undefined;
let open = false;

function connect() {
  const es = new EventSource("/events");
  source = es;
  es.onopen = () => {
    open = true;
    for (const s of [...subscribers]) {
      s.setConnected(true);
      s.handlers.current.onOpen();
    }
  };
  for (const type of EVENT_TYPES) {
    es.addEventListener(type, (message) => {
      const event = JSON.parse((message as MessageEvent<string>).data) as LiveEvent;
      for (const s of [...subscribers]) s.handlers.current.onEvent(event);
    });
  }
  es.onerror = () => {
    open = false;
    for (const s of [...subscribers]) s.setConnected(false);
    // The browser retries a dropped stream itself. A CLOSED one is one it
    // gave up on (a 401 or a bad status): find out which, then try again.
    if (es.readyState !== EventSource.CLOSED || source !== es) return;
    es.close();
    fetch("/api/pantry", { headers: { Accept: "application/json" } })
      .then((res) => {
        if (res.status === 401)
          for (const s of [...subscribers]) s.handlers.current.onUnauthorised();
      })
      .catch(() => {});
    retry = window.setTimeout(connect, GIVE_UP_RETRY_MS);
  };
}

function subscribe(subscriber: Subscriber) {
  subscribers.add(subscriber);
  if (!source) connect();
  else if (open) {
    subscriber.setConnected(true);
    subscriber.handlers.current.onOpen();
  }
  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size > 0) return;
    window.clearTimeout(retry);
    source?.close();
    source = null;
    open = false;
  };
}

// Listens on the page's one /events stream. `connected` is whether it is open
// now; `reconnecting` turns true only after 3 s without it, so a blink doesn't
// flash a warning.
export function useLiveStream(handlers: LiveHandlers): {
  connected: boolean;
  reconnecting: boolean;
} {
  const latest = useRef(handlers);
  latest.current = handlers;
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => subscribe({ handlers: latest, setConnected }), []);

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

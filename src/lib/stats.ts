import type { GameLine } from "./gameLog.ts";
import { isLogged, type RequestLine } from "./requestLog.ts";

// What the socket server knows right now and the stats can't count up from lines.
export interface LiveCounts {
  lobbiesOpen: number;
  gamesPlaying: number;
  playersConnected: number;
}

export interface StatsSnapshot {
  since: number;
  now: number;
  requests: number;
  errors: number;
  actions: Record<string, number>;
  activeDevices: number;
  perMinute: { minute: number; n: number }[];
  recent: { ts: string; who: string | null; action: string; status: number }[];
  game: LiveCounts & {
    events: Record<string, number>;
    channelsByRole: Record<string, Record<string, number>>;
    rssMb: number;
  };
}

const RING = 200;
const RECENT = 30;
const ACTIVE_MS = 5 * 60_000;
const MINUTE = 60_000;
const MINUTES = 10;

// What the app has been doing since it started, kept in memory: a restart
// starts the picture again, which is fine for a glance. The durable record is
// the log on stdout.
export function createStats(since = Date.now()) {
  let requests = 0;
  let errors = 0;
  const actions: Record<string, number> = {};
  const ring: StatsSnapshot["recent"] = [];
  const minutes = new Map<number, number>();
  const seen = new Map<string, number>();
  const events: Record<string, number> = {};
  const channelsByRole: Record<string, Record<string, number>> = {};
  let live: () => LiveCounts = () => ({ lobbiesOpen: 0, gamesPlaying: 0, playersConnected: 0 });

  return {
    recordGame(line: GameLine): void {
      events[line.event] = (events[line.event] ?? 0) + 1;
      const { role, family } = line.detail ?? {};
      if (line.event === "channel.send" && typeof role === "string" && typeof family === "string") {
        const byFamily = channelsByRole[role] ?? {};
        byFamily[family] = (byFamily[family] ?? 0) + 1;
        channelsByRole[role] = byFamily;
      }
    },

    // The socket module registers this once; the Astro page never imports it.
    setLiveProvider(fn: () => LiveCounts): void {
      live = fn;
    },

    record(line: RequestLine): void {
      if (!isLogged(line.route)) return;
      const at = Date.parse(line.ts);
      requests += 1;
      if (line.status >= 500) errors += 1;
      actions[line.action] = (actions[line.action] ?? 0) + 1;
      ring.push({ ts: line.ts, who: line.who, action: line.action, status: line.status });
      if (ring.length > RING) ring.shift();
      const minute = Math.floor(at / MINUTE);
      minutes.set(minute, (minutes.get(minute) ?? 0) + 1);
      if (line.who) seen.set(line.who, Math.max(at, seen.get(line.who) ?? 0));
      for (const old of minutes.keys()) if (old < minute - 2 * MINUTES) minutes.delete(old);
    },

    snapshot(now = Date.now()): StatsSnapshot {
      const minute = Math.floor(now / MINUTE);
      let activeDevices = 0;
      for (const [who, at] of seen) {
        if (now - at < ACTIVE_MS) activeDevices += 1;
        else if (now - at > 2 * ACTIVE_MS) seen.delete(who);
      }
      return {
        since,
        now,
        requests,
        errors,
        actions: { ...actions },
        activeDevices,
        perMinute: Array.from({ length: MINUTES }, (_, i) => {
          const m = minute - (MINUTES - 1) + i;
          return { minute: m, n: minutes.get(m) ?? 0 };
        }),
        recent: ring.slice(-RECENT).reverse(),
        game: {
          ...live(),
          events: { ...events },
          channelsByRole: Object.fromEntries(
            Object.entries(channelsByRole).map(([role, byFamily]) => [role, { ...byFamily }]),
          ),
          rssMb: Math.round(process.memoryUsage.rss() / (1024 * 1024)),
        },
      };
    },
  };
}

// The socket server (server.ts) and the Astro bundle are separate module
// instances, so what both must count into lives on globalThis behind this one
// accessor.
const SHARED = Symbol.for("heist.stats");
type Stats = ReturnType<typeof createStats>;
export function sharedStats(): Stats {
  const holder = globalThis as unknown as Record<symbol, Stats | undefined>;
  holder[SHARED] ??= createStats();
  return holder[SHARED];
}

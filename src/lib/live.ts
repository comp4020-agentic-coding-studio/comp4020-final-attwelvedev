import type { Item, Outcome } from "./items.ts";

// An in-process pub/sub: one machine, one Node process (ADR 0004), so a change
// reaches every open stream without a broker. A restart drops every stream and
// clients reconnect and refetch.

export interface Actor {
  id: string;
  name: string;
}

export type LiveEvent =
  | { type: "item.added"; item: Item; by: Actor; rid?: string }
  | {
      type: "item.removed";
      itemId: string;
      itemName: string;
      outcome: Outcome;
      historyId: string;
      by: Actor;
    }
  | { type: "item.restored"; item: Item; by: Actor }
  | { type: "member.joined"; member: { id: string; name: string } }
  | { type: "member.removed"; member: { id: string; name: string }; by: Actor };

export const householdChannel = (householdId: string): string => `household:${householdId}`;

const channels = new Map<string, Set<(e: LiveEvent) => void>>();

export function subscribe(channel: string, send: (e: LiveEvent) => void): () => void {
  const subscribers = channels.get(channel) ?? new Set<(e: LiveEvent) => void>();
  channels.set(channel, subscribers);
  subscribers.add(send);
  return () => {
    const current = channels.get(channel);
    current?.delete(send);
    if (current?.size === 0) channels.delete(channel);
  };
}

// Called after a write has committed, never inside a transaction. A broken
// subscriber must not stop the others or fail the request that triggered this.
export function publish(channel: string, e: LiveEvent): void {
  for (const send of [...(channels.get(channel) ?? [])]) {
    try {
      send(e);
    } catch {
      // that stream is dead; its own abort handler unsubscribes it
    }
  }
}

export function subscriberCount(channel: string): number {
  return channels.get(channel)?.size ?? 0;
}

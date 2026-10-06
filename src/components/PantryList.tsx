import { useCallback, useReducer, useRef, useState } from "preact/hooks";
import "../styles/pantry.css";
import type { Item, Outcome } from "../lib/items.ts";
import type { LiveEvent } from "../lib/live.ts";
import type { Snapshot } from "../lib/snapshot.ts";
import { ConnectionStatus } from "./ConnectionStatus.tsx";
import {
  type Action,
  type Failure,
  initialState,
  pantryReducer,
  type RetryAction,
  visibleRows,
} from "./pantryState.ts";
import { type Toast, ToastRegion } from "./ToastRegion.tsx";
import { useLiveStream } from "./useLiveStream.ts";

const OUTCOMES = [
  { outcome: "used", label: "Used" },
  { outcome: "binned", label: "Binned" },
] as const;
const NOTE_MS = 2000;

const formBody = (fields: Record<string, string>) => new URLSearchParams(fields).toString();
const POST_JSON = {
  method: "POST",
  headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
} as const;

// A client request id: the server echoes it on the item.added event, so this
// page can tell its own add from a housemate's.
const newRid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`.slice(0, 64);

async function postJson<T>(path: string, fields: Record<string, string> = {}): Promise<T> {
  const res = await fetch(path, { ...POST_JSON, body: formBody(fields) });
  if (res.status === 401) {
    window.location.assign("/");
    throw new Error("signed out");
  }
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

export function PantryList({ initial, addError }: { initial: Snapshot; addError?: string }) {
  const [state, dispatch] = useReducer(pantryReducer, initial.items, initialState);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const counter = useRef(0);
  const meId = initial.me.id;

  const nextId = (prefix: string) => {
    counter.current += 1;
    return `${prefix}${counter.current}`;
  };
  const failed = useCallback((message: string, retry: RetryAction) => {
    dispatch({ type: "failed", failure: { id: nextId("f"), message, retry } });
  }, []);
  const dismissToast = useCallback(
    (id: string) => setToasts((all) => all.filter((t) => t.id !== id)),
    [],
  );

  const add = useCallback(
    async (name: string) => {
      const rid = newRid();
      dispatch({ type: "add.pending", rid, name, at: Date.now() });
      try {
        const { item } = await postJson<{ item: Item }>("/items", { name, rid });
        dispatch({ type: "add.confirmed", rid, item });
      } catch {
        dispatch({ type: "add.rolledBack", rid });
        failed(`Couldn't save “${name}”.`, { kind: "add", name });
      }
    },
    [failed],
  );

  const undo = useCallback(
    async (historyId: string, name: string) => {
      try {
        const { item } = await postJson<{ item: Item }>(`/history/${historyId}/undo`);
        dispatch({ type: "event.restored", item });
      } catch {
        failed(`Couldn't undo “${name}”.`, { kind: "undo", historyId, name });
      }
    },
    [failed],
  );

  const mark = useCallback(
    async (itemId: string, name: string, outcome: "used" | "binned") => {
      dispatch({ type: "remove.pending", itemId });
      try {
        const done = await postJson<{ historyId: string }>(`/items/${itemId}/outcome`, { outcome });
        dispatch({ type: "remove.confirmed", itemId });
        setToasts((all) => [
          ...all,
          {
            id: nextId("t"),
            text: `${name} marked ${outcome}.`,
            actionLabel: "Undo",
            onAction: () => undo(done.historyId, name),
          },
        ]);
      } catch {
        dispatch({ type: "remove.rolledBack", itemId });
        failed(`Couldn't save “${name}”.`, { kind: "outcome", itemId, name, outcome });
      }
    },
    [failed, undo],
  );

  const retry = (failure: Failure) => {
    dispatch({ type: "dismiss", failureId: failure.id });
    const { retry: action } = failure;
    if (action.kind === "add") void add(action.name);
    else if (action.kind === "outcome") void mark(action.itemId, action.name, action.outcome);
    else void undo(action.historyId, action.name);
  };

  const { connected, reconnecting } = useLiveStream({
    onEvent(e: LiveEvent) {
      if (e.type === "item.added") {
        dispatch({ type: "event.added", item: e.item, rid: e.rid });
      } else if (e.type === "item.removed") {
        const mine = e.by.id === meId;
        const action: Action = {
          type: "event.removed",
          itemId: e.itemId,
          outcome: e.outcome as Outcome,
          byName: e.by.name,
          mine,
        };
        dispatch(action);
        if (!mine) {
          window.setTimeout(() => dispatch({ type: "forget", itemId: e.itemId }), NOTE_MS);
        }
      } else if (e.type === "item.restored") {
        dispatch({ type: "event.restored", item: e.item });
      } else if (e.type === "member.removed" && e.member.id === meId) {
        window.location.assign("/");
      }
    },
    onOpen() {
      fetch("/api/pantry", { headers: { Accept: "application/json" } })
        .then((res) => {
          if (res.status === 401) window.location.assign("/");
          else return res.json() as Promise<Snapshot>;
        })
        .then((snapshot) => snapshot && dispatch({ type: "snapshot", items: snapshot.items }))
        .catch(() => {});
    },
    onUnauthorised: () => window.location.assign("/"),
  });

  const rows = visibleRows(state);

  return (
    <div class="pantry-island" data-stream={connected ? "open" : "connecting"}>
      <form
        class="add"
        method="post"
        action="/items"
        onSubmit={(event) => {
          event.preventDefault();
          const field = input.current;
          const name = field?.value.trim() ?? "";
          if (!field || !name) return;
          field.value = "";
          field.focus();
          void add(name);
        }}
      >
        {addError && <p role="alert">{addError}</p>}
        <label for="name">Add an item</label>
        <input
          id="name"
          name="name"
          required
          maxLength={120}
          autoComplete="off"
          // biome-ignore lint/a11y/noAutofocus: an empty pantry puts the cursor in the add field, so the first add needs no click
          autoFocus={initial.items.length === 0}
          ref={input}
        />
      </form>

      {state.failures.map((failure) => (
        <div class="failure" role="alert" key={failure.id}>
          <span>{failure.message}</span>
          <button type="button" onClick={() => retry(failure)}>
            Retry
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "dismiss", failureId: failure.id })}
          >
            Dismiss
          </button>
        </div>
      ))}

      <ConnectionStatus reconnecting={reconnecting} />

      {rows.length === 0 ? (
        <p>Nothing here yet. Add the first thing in your pantry.</p>
      ) : (
        <ul class="pantry">
          {rows.map((row) => (
            <li
              key={row.item.id}
              aria-busy={row.pending ? "true" : undefined}
              class={row.note ? "gone" : undefined}
            >
              <span class="name">{row.item.name}</span>
              {row.note ? (
                <span class="note">{row.note}</span>
              ) : (
                OUTCOMES.map(({ outcome, label }) => (
                  <form
                    key={outcome}
                    method="post"
                    action={`/items/${row.item.id}/outcome`}
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!row.pending) void mark(row.item.id, row.item.name, outcome);
                    }}
                  >
                    <input type="hidden" name="outcome" value={outcome} />
                    <button type="submit" disabled={Boolean(row.pending)}>
                      {label}
                      <span class="sr-only"> {row.item.name}</span>
                    </button>
                  </form>
                ))
              )}
            </li>
          ))}
        </ul>
      )}

      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

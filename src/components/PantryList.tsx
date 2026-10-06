import { useCallback, useReducer, useRef, useState } from "preact/hooks";
import "../styles/pantry.css";
import "../styles/offers.css";
import type { Item, Outcome } from "../lib/items.ts";
import type { LiveEvent } from "../lib/live.ts";
import type { MyOffer } from "../lib/offers.ts";
import type { Snapshot } from "../lib/snapshot.ts";
import { HttpError, postJson } from "./api.ts";
import { ConnectionStatus } from "./ConnectionStatus.tsx";
import { OfferSheet, type SheetMode, type SheetResult } from "./OfferSheet.tsx";
import {
  type Action,
  type Failure,
  initialState,
  pantryReducer,
  type RetryAction,
  shownOffer,
  visibleRows,
} from "./pantryState.ts";
import { type Toast, ToastRegion } from "./ToastRegion.tsx";
import { useLiveStream } from "./useLiveStream.ts";

const OUTCOMES = [
  { outcome: "used", label: "Used" },
  { outcome: "binned", label: "Binned" },
] as const;
const NOTE_MS = 2000;

// A client request id: the server echoes it on the item.added event, so this
// page can tell its own add from a housemate's.
const newRid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`.slice(0, 64);

// The server's own message is worth showing for a refusal (Already offered).
const why = (error: unknown) =>
  error instanceof HttpError &&
  error.status >= 400 &&
  error.status < 500 &&
  !/^\d+$/.test(error.message)
    ? ` ${error.message}`
    : "";

interface Sheet {
  mode: SheetMode;
  itemId: string;
  name: string;
  offerId?: string;
  note: string; // what the field starts with
}

export function PantryList({ initial, addError }: { initial: Snapshot; addError?: string }) {
  const [state, dispatch] = useReducer(pantryReducer, initial, (snapshot) =>
    pantryReducer(initialState(snapshot.items), {
      type: "offers.snapshot",
      open: snapshot.offering.open,
    }),
  );
  const [communities, setCommunities] = useState(initial.offering.communities);
  const [defaultNote, setDefaultNote] = useState(initial.offering.defaultPickupNote);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
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

  const withdraw = useCallback(
    async (offerId: string, itemId: string, name: string) => {
      dispatch({ type: "withdraw.pending", itemId });
      try {
        await postJson(`/offers/${offerId}/withdraw`);
        dispatch({ type: "withdraw.confirmed", itemId });
      } catch (error) {
        dispatch({ type: "withdraw.rolledBack", itemId });
        failed(`Couldn't withdraw “${name}”.${why(error)}`, {
          kind: "withdraw",
          offerId,
          itemId,
          name,
        });
      }
    },
    [failed],
  );

  const openSheet = (next: Sheet, from?: HTMLElement | null) => {
    opener.current = from ?? null;
    setSheet(next);
  };

  const saveNote = useCallback(
    async (offerId: string, itemId: string, name: string, note: string, previous: string) => {
      dispatch({ type: "offer.noted", itemId, note });
      try {
        await postJson(`/offers/${offerId}/note`, { note });
      } catch (error) {
        dispatch({ type: "offer.noted", itemId, note: previous });
        failed(`Couldn't save the note for “${name}”.${why(error)}`, {
          kind: "note",
          offerId,
          itemId,
          name,
          note,
          previous,
        });
      }
    },
    [failed],
  );

  const offer = useCallback(
    async (itemId: string, name: string, fields: { note?: string; communityIds?: string[] }) => {
      dispatch({ type: "offer.pending", itemId });
      try {
        const body: { itemId: string; note?: string; communityIds?: string[] } = { itemId };
        if (fields.note) body.note = fields.note;
        if (fields.communityIds) body.communityIds = fields.communityIds;
        const done = await postJson<{ offer: MyOffer }>("/offers/create", body);
        dispatch({ type: "offer.mine", offer: done.offer });
        // the next sheet starts from the note just posted
        setDefaultNote(done.offer.note);
        const n = done.offer.communityIds.length;
        setToasts((all) => [
          ...all,
          {
            id: nextId("t"),
            text: `${name} offered to ${n} ${n === 1 ? "community" : "communities"}.`,
            actions: [
              { label: "Undo", onAction: () => withdraw(done.offer.id, itemId, name) },
              {
                label: "Edit note",
                onAction: () =>
                  openSheet({
                    mode: "note",
                    itemId,
                    name,
                    offerId: done.offer.id,
                    note: done.offer.note,
                  }),
              },
            ],
          },
        ]);
      } catch (error) {
        dispatch({ type: "offer.rolledBack", itemId });
        failed(`Couldn't offer “${name}”.${why(error)}`, {
          kind: "offer",
          itemId,
          name,
          ...fields,
        });
      }
    },
    [failed, withdraw],
  );

  const closeSheet = (itemId: string) => {
    setSheet(null);
    // back to the button that opened it, or to the row's first button if that is gone
    const from = opener.current;
    const target =
      from?.isConnected && from.closest("li")
        ? from
        : document.querySelector<HTMLElement>(`[data-item-id="${itemId}"] button`);
    target?.focus();
  };

  const submitSheet = (current: Sheet, result: SheetResult) => {
    setSheet(null);
    if (current.mode === "note" && current.offerId) {
      void saveNote(current.offerId, current.itemId, current.name, result.note, current.note);
    } else {
      void offer(current.itemId, current.name, {
        note: result.note,
        communityIds: result.communityIds.length ? result.communityIds : undefined,
      });
    }
  };

  const retry = (failure: Failure) => {
    dispatch({ type: "dismiss", failureId: failure.id });
    const { retry: action } = failure;
    if (action.kind === "add") void add(action.name);
    else if (action.kind === "outcome") void mark(action.itemId, action.name, action.outcome);
    else if (action.kind === "undo") void undo(action.historyId, action.name);
    else if (action.kind === "offer") {
      void offer(action.itemId, action.name, {
        note: action.note,
        communityIds: action.communityIds,
      });
    } else if (action.kind === "withdraw") {
      void withdraw(action.offerId, action.itemId, action.name);
    } else {
      void saveNote(action.offerId, action.itemId, action.name, action.note, action.previous);
    }
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
      } else if (e.type === "item.updated") {
        dispatch({ type: "event.updated", item: e.item });
      } else if (e.type === "offer.mine") {
        dispatch({ type: "offer.mine", offer: e.offer });
      } else if (e.type === "membership.joined") {
        setCommunities((all) =>
          all.some((c) => c.id === e.community.id) ? all : [...all, e.community],
        );
      } else if (e.type === "membership.left") {
        setCommunities((all) => all.filter((c) => c.id !== e.communityId));
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
        .then((snapshot) => {
          if (!snapshot) return;
          dispatch({ type: "snapshot", items: snapshot.items });
          dispatch({ type: "offers.snapshot", open: snapshot.offering.open });
          setCommunities(snapshot.offering.communities);
          setDefaultNote(snapshot.offering.defaultPickupNote);
        })
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

      {rows.length > 0 && communities.length === 0 && (
        <p class="offer-hint">
          <a href="/communities">Join a community to offer food to neighbours</a>
        </p>
      )}

      {rows.length === 0 ? (
        <p>Nothing here yet. Add the first thing in your pantry.</p>
      ) : (
        <ul class="pantry">
          {rows.map((row) => {
            const mine = shownOffer(row);
            const open = Boolean(mine || row.offering);
            const canOffer = communities.length > 0 && !row.pending;
            return (
              <li
                key={row.item.id}
                data-item-id={row.item.id}
                aria-busy={row.pending ? "true" : undefined}
                class={row.note ? "gone" : undefined}
              >
                <span class="name">{row.item.name}</span>
                {row.note ? (
                  <span class="note">{row.note}</span>
                ) : (
                  <>
                    {open && (
                      <span class="offer-state">
                        {mine?.status === "claimed"
                          ? `Claimed by ${mine.claimedBy ?? "a neighbour"}`
                          : "Offered"}
                      </span>
                    )}
                    {canOffer && mine && (
                      <button
                        type="button"
                        onClick={(event) =>
                          openSheet(
                            {
                              mode: "note",
                              itemId: row.item.id,
                              name: row.item.name,
                              offerId: mine.id,
                              note: mine.note,
                            },
                            event.currentTarget,
                          )
                        }
                      >
                        Note
                        <span class="sr-only"> {row.item.name}</span>
                      </button>
                    )}
                    {canOffer && open && (
                      <form
                        method="post"
                        action={`/offers/${mine?.id ?? ""}/withdraw`}
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (mine) void withdraw(mine.id, row.item.id, row.item.name);
                        }}
                      >
                        <button type="submit" disabled={!mine}>
                          Withdraw
                          <span class="sr-only"> {row.item.name}</span>
                        </button>
                      </form>
                    )}
                    {canOffer && !open && (
                      <button
                        type="button"
                        onClick={(event) =>
                          openSheet(
                            {
                              mode: "offer",
                              itemId: row.item.id,
                              name: row.item.name,
                              note: defaultNote ?? "",
                            },
                            event.currentTarget,
                          )
                        }
                      >
                        Offer
                        <span class="sr-only"> {row.item.name}</span>
                      </button>
                    )}
                    {OUTCOMES.map(({ outcome, label }) => (
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
                    ))}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {sheet && (
        <OfferSheet
          mode={sheet.mode}
          itemName={sheet.name}
          communities={communities}
          initialNote={sheet.note}
          onSubmit={(result) => submitSheet(sheet, result)}
          onClose={() => closeSheet(sheet.itemId)}
        />
      )}

      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

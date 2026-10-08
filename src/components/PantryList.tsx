import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "preact/hooks";
import guessTable from "../data/guess-client.json";
import "../styles/pantry.css";
import "../styles/panel.css";
import "../styles/tape.css";
import "../styles/offers.css";
import { type GuessTable, makeGuesser } from "../lib/guess.ts";
import type { Item, Outcome } from "../lib/items.ts";
import type { LiveEvent } from "../lib/live.ts";
import type { MyOffer } from "../lib/offers.ts";
import type { Snapshot } from "../lib/snapshot.ts";
import { HttpError, postJson } from "./api.ts";
import { BucketHeading } from "./BucketHeading.tsx";
import { ConnectionStatus } from "./ConnectionStatus.tsx";
import { ItemPanel } from "./ItemPanel.tsx";
import { ItemRow } from "./ItemRow.tsx";
import { expiryRequest, valueRequest } from "./itemWrites.ts";
import { JumpToBucket } from "./JumpToBucket.tsx";
import { OfferSheet, type SheetMode, type SheetResult } from "./OfferSheet.tsx";
import {
  type Action,
  applyExpiry,
  applyValue,
  type ExpiryWrite,
  type Failure,
  initialState,
  pantryReducer,
  type RetryAction,
  shownOffer,
  type ValueWrite,
  visibleRows,
} from "./pantryState.ts";
import {
  type BucketGroup,
  expiryLabel,
  localToday,
  remoteChange,
  type Splittable,
  saveFailure,
  splittableOf,
  valueWriteBack,
  valueWriteLabel,
} from "./pantryView.ts";
import { stableGroups } from "./stableOrder.ts";
import { type Toast, ToastRegion } from "./ToastRegion.tsx";
import { useLiveStream } from "./useLiveStream.ts";
import { createWriteQueue } from "./writeQueue.ts";

const NOTE_MS = 2000;
// "Jump to" appears above this many items
const JUMP_FROM = 25;
// Remote adds and moves wait while someone is using the list, until this long
// after their last key or tap
const IDLE_MS = 2000;
// buckets move at the viewer's midnight, so look again every minute
const DAY_CHECK_MS = 60_000;

// How long a housemate's change is marked (the underline fades in 1.6 s; the dot
// under reduced motion stays 3 s) and how long its "just changed" line stays
const MARK_MS = 3000;
const CHANGED_LINE_MS = 12_000;

const EXAMPLES = ["milk", "eggs", "spinach"];

const guess = makeGuesser(guessTable as GuessTable);

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
  splittable?: Splittable; // what "Offer some…" may split off
}

interface RemoteChange {
  by: string;
  to: string;
  marked: boolean;
}

export function PantryList({
  initial,
  addError,
  today: serverToday,
}: {
  initial: Snapshot;
  addError?: string;
  // the server's (UTC) date: the first render must match the markup it sent
  today: string;
}) {
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
  const [today, setToday] = useState(serverToday);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState(initial.members);
  const [changes, setChanges] = useState<Record<string, RemoteChange>>({});
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const counter = useRef(0);
  const meId = initial.me.id;
  // my own adds (rid, then the real item id) are never held back
  const ownAdds = useRef(new Set<string>());
  const shown = useRef<BucketGroup[]>([]);
  const idle = useRef<number | undefined>(undefined);
  const focused = useRef<HTMLElement | null>(null);
  // the latest state, for a write's failure path (which runs after the render it began in)
  const latest = useRef(state);
  latest.current = state;
  const queue = useRef(createWriteQueue()).current;
  // the newest write per row and group: an earlier response is stale once a later write exists
  const newest = useRef(new Map<string, number>());
  // the row whose slider a pointer is on: my release wins over an incoming update
  const dragging = useRef<string | null>(null);
  const focusPanel = useRef(false);

  // the viewer's own date, once hydrated and again as it changes
  useEffect(() => {
    const look = () => setToday(localToday());
    look();
    const timer = window.setInterval(look, DAY_CHECK_MS);
    return () => window.clearInterval(timer);
  }, []);

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
      const day = localToday();
      ownAdds.current.add(rid);
      dispatch({ type: "add.pending", rid, name, at: Date.now(), guess: guess(name), today: day });
      try {
        const { item } = await postJson<{ item: Item }>("/items", { name, rid, today: day });
        ownAdds.current.add(item.id);
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

  // One request in flight per row and group; a newer value replaces the one waiting.
  // The row shows the change at once and says "Saving…"; a failure puts it back.
  const write = useCallback(
    async (
      itemId: string,
      group: "value" | "expiry",
      attempted: (item: Item) => Item,
      label: (applied: Item) => string,
      back: (previous: Item) => string,
      send: () => Promise<Item>,
      retryAs: RetryAction,
    ) => {
      const row = latest.current.rows.find((r) => r.item.id === itemId);
      if (!row || row.pending) return;
      const key = `${itemId}:${group}`;
      const token = (newest.current.get(key) ?? 0) + 1;
      newest.current.set(key, token);
      const text = label(attempted(row.item));
      dispatch(
        group === "value"
          ? { type: "value.pending", itemId, write: (retryAs as { change: ValueWrite }).change }
          : { type: "expiry.pending", itemId, write: (retryAs as { change: ExpiryWrite }).change },
      );
      await queue.run(key, async () => {
        try {
          const item = await send();
          if (newest.current.get(key) === token) {
            dispatch({ type: `${group}.confirmed`, itemId, item });
          }
        } catch {
          if (newest.current.get(key) !== token) return;
          const now = latest.current.rows.find((r) => r.item.id === itemId);
          const previous = now ? { ...now.item, ...now.saving?.[group] } : row.item;
          dispatch({ type: `${group}.rolledBack`, itemId });
          failed(saveFailure(text, back(previous)), { ...retryAs, label: text } as RetryAction);
        }
      });
    },
    [failed, queue],
  );

  const writeValue = useCallback(
    (itemId: string, name: string, change: ValueWrite) => {
      const [path, fields] = valueRequest(itemId, change);
      return write(
        itemId,
        "value",
        (item) => applyValue(item, change),
        (applied) => valueWriteLabel(change, applied),
        (previous) => valueWriteBack(change, previous),
        async () => (await postJson<{ item: Item }>(path, fields)).item,
        { kind: "value", itemId, name, change, label: "" },
      );
    },
    [write],
  );

  const writeExpiry = useCallback(
    (itemId: string, name: string, change: ExpiryWrite) => {
      const [path, fields] = expiryRequest(itemId, change);
      return write(
        itemId,
        "expiry",
        (item) => applyExpiry(item, change),
        (applied) => expiryLabel(applied, localToday()),
        (previous) => expiryLabel(previous, localToday()),
        async () => (await postJson<{ item: Item }>(path, fields)).item,
        { kind: "expiry", itemId, name, change, label: "" },
      );
    },
    [write],
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
    async (
      itemId: string,
      name: string,
      fields: { note?: string; communityIds?: string[]; portion?: number },
    ) => {
      // a portion becomes its own item, so the original row is not the one offered
      if (fields.portion === undefined) dispatch({ type: "offer.pending", itemId });
      try {
        const body: { itemId: string; note?: string; communityIds?: string[]; portion?: string } = {
          itemId,
        };
        if (fields.note) body.note = fields.note;
        if (fields.communityIds) body.communityIds = fields.communityIds;
        if (fields.portion !== undefined) body.portion = String(fields.portion);
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
        portion: result.portion,
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
        portion: action.portion,
      });
    } else if (action.kind === "withdraw") {
      void withdraw(action.offerId, action.itemId, action.name);
    } else if (action.kind === "value") {
      void writeValue(action.itemId, action.name, action.change);
    } else if (action.kind === "expiry") {
      void writeExpiry(action.itemId, action.name, action.change);
    } else {
      void saveNote(action.offerId, action.itemId, action.name, action.note, action.previous);
    }
  };

  // a housemate's change: underline the row now, drop the mark, then the line
  const noteChange = (itemId: string, change: RemoteChange) => {
    setChanges((all) => ({ ...all, [itemId]: change }));
    window.setTimeout(
      () =>
        setChanges((all) =>
          all[itemId] ? { ...all, [itemId]: { ...all[itemId], marked: false } } : all,
        ),
      MARK_MS,
    );
    window.setTimeout(
      () =>
        setChanges((all) => {
          const { [itemId]: _gone, ...rest } = all;
          return rest;
        }),
      CHANGED_LINE_MS,
    );
  };

  const { connected, reconnecting } = useLiveStream({
    onEvent(e: LiveEvent) {
      if (e.type === "item.added") {
        if (e.rid && ownAdds.current.has(e.rid)) ownAdds.current.add(e.item.id);
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
        // while my finger is on this row's slider, my release wins
        if (dragging.current === e.item.id) return;
        const before = latest.current.rows.find((r) => r.item.id === e.item.id)?.item;
        const to = before && e.by.id !== meId ? remoteChange(before, e.item, today) : null;
        if (to) noteChange(e.item.id, { by: e.by.name, to, marked: true });
        dispatch({ type: "event.updated", item: e.item });
      } else if (e.type === "member.joined") {
        setMembers((all) => (all.some((m) => m.id === e.member.id) ? all : [...all, e.member]));
      } else if (e.type === "item.merged") {
        dispatch({ type: "event.merged", itemId: e.itemId, item: e.item });
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
          setMembers(snapshot.members);
        })
        .catch(() => {});
    },
    onUnauthorised: () => window.location.assign("/"),
  });

  const rows = visibleRows(state);

  // Hold remote changes back while the list is in use; the groups last drawn are
  // what "where things were" means.
  const { groups } = stableGroups(shown.current, rows, today, busy, ownAdds.current);
  shown.current = groups;

  // Using the list: any key, tap or focus inside it, until it has been quiet for
  // IDLE_MS or focus leaves for somewhere else.
  const touched = () => {
    setBusy(true);
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => setBusy(false), IDLE_MS);
  };
  const left = () => {
    window.clearTimeout(idle.current);
    setBusy(false);
  };
  useEffect(() => () => window.clearTimeout(idle.current), []);

  // A row moved in the DOM can lose focus: put it back on the control it was on.
  useLayoutEffect(() => {
    const el = focused.current;
    if (el?.isConnected && document.activeElement === document.body) {
      el.focus({ preventScroll: true });
    }
  });

  // Opening a row brings it to the middle of the screen; `openItem` is also how
  // the add field's search (phase 05b) opens a match and moves focus inside it.
  const openItem = (itemId: string, intoPanel = false) => {
    focusPanel.current = intoPanel;
    setOpenId(itemId);
  };
  const toggleOpen = (itemId: string) => {
    const row = rows.find((r) => r.item.id === itemId);
    if (!row || row.pending || row.note) return;
    if (openId === itemId) setOpenId(null);
    else openItem(itemId);
  };
  useEffect(() => {
    if (!openId) return;
    const li = document.querySelector<HTMLElement>(`[data-item-id="${openId}"]`);
    li?.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
    if (focusPanel.current) {
      focusPanel.current = false;
      li?.querySelector<HTMLElement>(".panel input, .panel button")?.focus();
    }
  }, [openId]);

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
        <div class="empty">
          <p>
            <strong>Nothing here yet.</strong>
          </p>
          <p>
            Type what's in the fridge and press Enter. Amounts and use-by dates fill themselves in;
            fix them later with a tap.
          </p>
          <div class="try">
            Try:{" "}
            {EXAMPLES.map((example, i) => (
              <span key={example}>
                <form
                  method="post"
                  action="/items"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void add(example);
                  }}
                >
                  <button type="submit" name="name" value={example}>
                    {example}
                  </button>
                </form>
                {i < EXAMPLES.length - 1 ? ", " : ""}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <>
          {rows.length > JUMP_FROM && <JumpToBucket groups={groups} />}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: it only watches activity bubbling up from the real controls */}
          <div
            class="shelf"
            onFocusIn={(event) => {
              focused.current = event.target as HTMLElement;
              touched();
            }}
            onFocusOut={(event) => {
              const next = event.relatedTarget as Node | null;
              if (next && !event.currentTarget.contains(next)) left();
              // a node moved by a re-sort also reports "focus left"; only forget
              // the control when focus has truly gone elsewhere
              window.setTimeout(() => {
                if (
                  !event.currentTarget.contains(document.activeElement) &&
                  document.activeElement !== document.body
                ) {
                  focused.current = null;
                }
              }, 0);
            }}
            onPointerDown={touched}
            onKeyDown={touched}
          >
            {groups.map((group) => (
              <section key={group.bucket} class="bucket" data-bucket={group.bucket}>
                <BucketHeading bucket={group.bucket} count={group.rows.length} />
                <ul class="pantry">
                  {group.rows.map((row) => (
                    <ItemRow
                      key={row.item.id}
                      row={row}
                      today={today}
                      open={openId === row.item.id}
                      canOffer={communities.length > 0 && !row.pending}
                      image={null}
                      changed={changes[row.item.id]?.marked}
                      panel={
                        <ItemPanel
                          item={row.item}
                          saving={row.saving}
                          today={today}
                          members={members}
                          now={Date.now()}
                          changed={
                            changes[row.item.id]
                              ? `${changes[row.item.id].by} just changed this to ${changes[row.item.id].to}`
                              : undefined
                          }
                          onValue={(change) => void writeValue(row.item.id, row.item.name, change)}
                          onExpiry={(change) =>
                            void writeExpiry(row.item.id, row.item.name, change)
                          }
                          onDrag={(down) => {
                            dragging.current = down ? row.item.id : null;
                          }}
                        />
                      }
                      onToggle={() => toggleOpen(row.item.id)}
                      onClose={() => setOpenId(null)}
                      onUsed={() => void mark(row.item.id, row.item.name, "used")}
                      onBinned={() => void mark(row.item.id, row.item.name, "binned")}
                      onOffer={(from) =>
                        openSheet(
                          {
                            mode: "offer",
                            itemId: row.item.id,
                            name: row.item.name,
                            note: defaultNote ?? "",
                            splittable: splittableOf(row.item),
                          },
                          from,
                        )
                      }
                      onNote={(from) => {
                        const mine = shownOffer(row);
                        if (!mine) return;
                        openSheet(
                          {
                            mode: "note",
                            itemId: row.item.id,
                            name: row.item.name,
                            offerId: mine.id,
                            note: mine.note,
                          },
                          from,
                        );
                      }}
                      onWithdraw={() => {
                        const mine = shownOffer(row);
                        if (mine) void withdraw(mine.id, row.item.id, row.item.name);
                      }}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      {sheet && (
        <OfferSheet
          mode={sheet.mode}
          itemName={sheet.name}
          communities={communities}
          initialNote={sheet.note}
          splittable={sheet.splittable}
          onSubmit={(result) => submitSheet(sheet, result)}
          onClose={() => closeSheet(sheet.itemId)}
        />
      )}

      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

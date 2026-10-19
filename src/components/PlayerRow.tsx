import { useEffect, useRef, useState } from "preact/hooks";
import type { Person } from "../net/protocol.ts";

// What a person said about their real life, as the chips under their name.
// "In room" shows only when someone else is in the room too (`together`): alone it means nothing.
export function chipsOf(setup: Person["setup"], together: boolean): string[] {
  if (!setup.done) return [];
  return [
    ...(setup.headphones ? ["headphones"] : []),
    ...(setup.inRoom ? (together ? ["in room"] : []) : ["remote"]),
    ...(setup.earplugs ? ["earplugs"] : []),
    ...(setup.mask ? ["mask"] : []),
    ...(setup.captions ? ["captions"] : []),
  ];
}

export interface RowProps {
  person: Person;
  place: number; // 0-based place in the starting order
  isHost: boolean; // this person is the lobby's host
  isYou: boolean;
  canOrder: boolean; // the viewer is the host: drag, Move up, Move down
  last: boolean;
  together: boolean; // two or more people in the lobby are in the room
  plays: number | null; // "plays N", only when more people are here than seats
  onMove: (dir: -1 | 1) => void;
  onRename: (name: string) => void;
  focusMove: -1 | 1 | null; // this row's Move button to focus after a reorder, so the keyboard keeps its place
  onDragStart: () => void;
  onDrop: () => void;
}

export function PlayerRow(props: RowProps) {
  const { person, place, isHost, isYou, canOrder, last, together, plays, focusMove } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(person.nickname);
  const input = useRef<HTMLInputElement>(null);
  const up = useRef<HTMLButtonElement>(null);
  const down = useRef<HTMLButtonElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);
  useEffect(() => {
    if (focusMove === null) return;
    // at the top or bottom the button that moved it is gone: the other one is next
    const wanted = focusMove === -1 ? up.current : down.current;
    (wanted ?? up.current ?? down.current)?.focus();
  }, [focusMove, place]);

  function save() {
    const name = draft.trim();
    setEditing(false);
    if (name && name !== person.nickname) props.onRename(name);
    queueMicrotask(() => editButton.current?.focus());
  }

  const chips = chipsOf(person.setup, together);
  return (
    <li
      class="player-row"
      draggable={canOrder}
      onDragStart={props.onDragStart}
      onDragOver={(e) => canOrder && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        props.onDrop();
      }}
    >
      <span class="place" aria-hidden="true">
        {place + 1}
      </span>
      {canOrder && (
        <span class="grip" aria-hidden="true">
          ⋮⋮
        </span>
      )}
      <div class="who">
        {editing ? (
          <input
            ref={input}
            class="nick-input"
            aria-label="Your nickname"
            value={draft}
            maxLength={16}
            autoComplete="off"
            onInput={(e) => setDraft(e.currentTarget.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              } else if (e.key === "Escape") {
                setDraft(person.nickname);
                setEditing(false);
              }
            }}
          />
        ) : (
          <span class="nick">{person.nickname}</span>
        )}
        {isYou && <span class="tag">you</span>}
        {isHost && <span class="tag">host</span>}
        {!person.connected && <span class="tag">away</span>}
        <p class="meta">
          {chips.length > 0 && <span class="chips">{chips.join(" · ")}</span>}
          {plays !== null && <span class="plays">plays {plays}</span>}
        </p>
      </div>
      <span class={person.setup.done ? "status done" : "status"}>
        {person.setup.done ? "Set up" : "Setting up"}
      </span>
      <div class="row-actions">
        {isYou && !editing && (
          <button
            ref={editButton}
            type="button"
            class="btn"
            onClick={() => {
              setDraft(person.nickname);
              setEditing(true);
            }}
          >
            Edit
          </button>
        )}
        {canOrder && (
          <>
            <button
              ref={up}
              type="button"
              class="btn icon"
              aria-label={`Move ${person.nickname} up`}
              disabled={place === 0}
              onClick={() => props.onMove(-1)}
            >
              ↑
            </button>
            <button
              ref={down}
              type="button"
              class="btn icon"
              aria-label={`Move ${person.nickname} down`}
              disabled={last}
              onClick={() => props.onMove(1)}
            >
              ↓
            </button>
          </>
        )}
      </div>
    </li>
  );
}

import { useEffect, useRef, useState } from "preact/hooks";
import "../styles/offers.css";

export type SheetMode = "offer" | "note";

export interface SheetResult {
  note: string;
  communityIds: string[];
}

const MAX_NOTE = 280;

// One sheet for two jobs: posting an offer (the pickup note, which starts from
// the last one used and is selected so typing replaces it, plus a "Send to"
// checklist once the household is in two or more communities) and changing an
// offered item's note (the note alone). A native <dialog>, so Esc closes it and
// the page behind is inert; `onClose` runs however it closes, and the parent
// puts focus back where the tap began.
export function OfferSheet({
  mode,
  itemName,
  communities,
  initialNote,
  onSubmit,
  onClose,
}: {
  mode: SheetMode;
  itemName: string;
  communities: { id: string; name: string }[];
  initialNote: string;
  onSubmit(result: SheetResult): void;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const note = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (!el.open) el.showModal();
    note.current?.focus();
    note.current?.select();
    // the parent unmounts the sheet on submit; closing here covers Esc and Cancel
    return () => {
      if (el.open) el.close();
    };
  }, []);

  const title = mode === "note" ? `Change the note for ${itemName}` : `Offer ${itemName}`;
  const picks = mode === "offer" && communities.length >= 2;

  return (
    <dialog class="offer-sheet" ref={dialog} aria-labelledby="offer-sheet-title" onClose={onClose}>
      <form
        method="dialog"
        class="stack"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget as HTMLFormElement);
          const text = String(form.get("note") ?? "").trim();
          if (!text) return;
          const communityIds = form.getAll("communityIds").map(String);
          if (picks && communityIds.length === 0) {
            setProblem("Tick at least one community.");
            return;
          }
          onSubmit({ note: text, communityIds });
        }}
      >
        <h2 id="offer-sheet-title">{title}</h2>
        <div class="field">
          <label for="offer-note">Pickup note</label>
          <input
            id="offer-note"
            name="note"
            ref={note}
            required
            maxLength={MAX_NOTE}
            autoComplete="off"
            value={initialNote}
            placeholder="Where and when to collect"
          />
        </div>
        {picks && (
          <fieldset>
            <legend>Send to</legend>
            {communities.map((community) => (
              <label class="check" key={community.id}>
                <input type="checkbox" name="communityIds" value={community.id} checked />
                {community.name}
              </label>
            ))}
            <p role="alert" class="msg">
              {problem}
            </p>
          </fieldset>
        )}
        <div class="sheet-actions">
          <button type="submit">{mode === "note" ? "Save note" : "Post offer"}</button>
          <button type="button" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}

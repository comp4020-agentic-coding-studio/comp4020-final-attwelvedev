import type { RefObject } from "preact";
import { CALLOUT_FACE, CALLOUT_WORD } from "../client/hud.ts";
import { CALLOUTS, type Callout } from "../game/channels.ts";
import { type Cell, SheetGrid } from "./SheetGrid.tsx";

const CELLS: Cell[] = CALLOUTS.map((c, i) => ({
  key: c,
  name: CALLOUT_WORD[c],
  content: <span class="cell-face">{CALLOUT_FACE[c]}</span>,
  hint: String(i + 1),
}));

export function SaySheet({
  onCallout,
  writing,
  onWrite,
  field,
  onText,
  onFocus,
}: {
  onCallout: (c: Callout) => void;
  writing: boolean;
  onWrite: () => void;
  field: RefObject<HTMLInputElement>;
  onText: (text: string) => void;
  onFocus: (focused: boolean) => void;
}) {
  return (
    <>
      <SheetGrid
        cells={CELLS}
        cols={3}
        label="Callouts"
        wait={0}
        onPick={(i) => {
          const c = CALLOUTS[i];
          if (c) onCallout(c);
        }}
      />
      {writing ? (
        <form
          class="say-text"
          onSubmit={(e) => {
            e.preventDefault();
            const input = field.current;
            if (!input) return;
            onText(input.value);
            input.value = "";
          }}
        >
          <input
            ref={field}
            type="text"
            aria-label="Message"
            maxLength={120}
            autocomplete="off"
            enterkeyhint="send"
            onFocus={() => onFocus(true)}
            onBlur={() => onFocus(false)}
          />
          <button type="submit" class="btn">
            Send
          </button>
        </form>
      ) : (
        <button
          type="button"
          class="btn say-write"
          aria-label="Write a message"
          aria-keyshortcuts="Enter"
          onClick={onWrite}
        >
          <kbd>Enter</kbd> Write a message
        </button>
      )}
    </>
  );
}

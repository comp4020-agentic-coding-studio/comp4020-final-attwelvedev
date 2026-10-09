import type { RefObject } from "preact";
import { CALLOUT_FACE, CALLOUT_WORD } from "../client/hud.ts";
import { CALLOUTS, type Callout } from "../game/channels.ts";
import { type Cell, SheetGrid } from "./SheetGrid.tsx";
import type { Voice } from "./useVoice.ts";

const VOICE_NOTE: Partial<Record<Voice["status"], string>> = {
  blocked: "Microphone blocked: voice is off. Callouts and text still work.",
  "no-encoder":
    "This browser can't do voice (it has no audio encoder): voice is off. Callouts and text still work.",
  insecure:
    "This page isn't secure, so the browser won't share the microphone: voice is off. Callouts and text still work.",
  "host-off": "Voice is off for this lobby",
  starting: "Opening the microphone…",
};

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
  voice,
}: {
  onCallout: (c: Callout) => void;
  writing: boolean;
  onWrite: () => void;
  field: RefObject<HTMLInputElement>;
  onText: (text: string) => void;
  onFocus: (focused: boolean) => void;
  voice: Voice;
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
      {voice.status === "ready" ? (
        <button
          type="button"
          class={voice.talking ? "btn say-talk is-talking" : "btn say-talk"}
          aria-pressed={voice.talking}
          aria-keyshortcuts="V"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            voice.talk(true);
          }}
          // let go of focus as well, or Space and Enter would press this button instead of the game
          onPointerUp={(e) => {
            voice.talk(false);
            e.currentTarget.blur();
          }}
          onPointerCancel={(e) => {
            voice.talk(false);
            e.currentTarget.blur();
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <kbd>V</kbd> Hold to talk
        </button>
      ) : (
        VOICE_NOTE[voice.status] && (
          <p class="say-voice-note" role="status">
            {VOICE_NOTE[voice.status]}
          </p>
        )
      )}
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

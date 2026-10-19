import type { RefObject } from "preact";
import { canSend, type Role } from "../game/types.ts";
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

// Talking outside the wheel: Enter writes a message, V (or the mic button)
// talks. Roles that can't send text or voice see why instead of a dead button.
export function TalkBar({
  role,
  voice,
  writing,
  field,
  onWrite,
  onText,
  onFocus,
  onComms,
  commsDisabled,
}: {
  role: Role;
  voice: Voice;
  writing: boolean;
  field: RefObject<HTMLInputElement>;
  onWrite: () => void;
  onText: (text: string) => void;
  onFocus: (focused: boolean) => void;
  // The Comms button sits with the other talk buttons, for a mouse and keyboard player who
  // would rather click than hold Q. Absent on a phone, whose wheel button does the same.
  onComms?: () => void;
  commsDisabled?: boolean;
}) {
  const text = canSend(role, "text");
  const speaks = canSend(role, "voice");
  return (
    <div class="talk-bar">
      {writing && text && (
        <form
          class="talk-text"
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
      )}
      <div class="talk-row">
        {onComms && (
          <button
            type="button"
            class="btn talk-comms"
            aria-keyshortcuts="Q"
            aria-label="Comms, key Q"
            disabled={commsDisabled}
            onClick={onComms}
          >
            <kbd>Q</kbd> Comms
          </button>
        )}
        {text && !writing && (
          <button
            type="button"
            class="btn talk-write"
            aria-label="Write a message"
            aria-keyshortcuts="Enter"
            onClick={onWrite}
          >
            <kbd>Enter</kbd> Write
          </button>
        )}
        {speaks && voice.status === "ready" && (
          <button
            type="button"
            class={voice.talking ? "btn talk-mic is-talking" : "btn talk-mic"}
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
        )}
        {!speaks && (
          <span class="talk-mic cant" role="status">
            Can't talk
          </span>
        )}
      </div>
      {speaks && voice.status !== "ready" && VOICE_NOTE[voice.status] && (
        <p class="talk-note" role="status">
          {VOICE_NOTE[voice.status]}
        </p>
      )}
    </div>
  );
}

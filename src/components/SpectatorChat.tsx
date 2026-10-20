import { useState } from "preact/hooks";
import { MAX_TEXT } from "../game/channels.ts";

// The newest lines only: the chat is a glance beside the game, so it never needs to scroll, and a
// region that scrolls would have to take the keyboard too.
const SHOWN = 6;

export interface WatchLine {
  id: number;
  nickname: string;
  text: string;
}

// The watchers' room: what spectators and people sitting this room out say to each other, in text
// and by voice. Players never see or hear it (ADR 0015). `micNote` says why there is no mic when
// the browser can't give one; the button is the same one V presses.
export function SpectatorChat({
  lines,
  onSay,
  onTalk,
  talking,
  micNote,
}: {
  lines: WatchLine[];
  onSay: (text: string) => void;
  onTalk?: (on: boolean) => void;
  talking?: boolean;
  micNote?: string | null;
}) {
  const [draft, setDraft] = useState("");
  function submit(event: Event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSay(text);
    setDraft("");
  }
  return (
    <section class="spectator-chat watch-chat" aria-labelledby="watch-chat-title">
      <h2 id="watch-chat-title" class="sr-only">
        Watchers
      </h2>
      <p class="muted watch-note">Players can't see this.</p>
      {lines.length === 0 ? (
        <p class="muted">No messages yet.</p>
      ) : (
        <div class="spectator-chat-log" role="log" aria-live="polite" aria-label="Chat">
          <ul class="spectator-chat-lines watch-lines">
            {lines.slice(-SHOWN).map((l) => (
              <li key={l.id}>
                <b>{l.nickname}</b>: {l.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      <form class="watch-say" onSubmit={submit}>
        <label class="sr-only" for="watch-say-text">
          Say something to the other watchers
        </label>
        <input
          id="watch-say-text"
          value={draft}
          maxLength={MAX_TEXT}
          autoComplete="off"
          enterkeyhint="send"
          onInput={(e) => setDraft(e.currentTarget.value)}
        />
        <button type="submit" class="btn">
          Say
        </button>
      </form>
      {onTalk && !micNote && (
        <button
          type="button"
          class={talking ? "btn talk-mic is-talking" : "btn talk-mic"}
          aria-pressed={talking ?? false}
          aria-keyshortcuts="V"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            onTalk(true);
          }}
          onPointerUp={(e) => {
            onTalk(false);
            e.currentTarget.blur();
          }}
          onPointerCancel={(e) => {
            onTalk(false);
            e.currentTarget.blur();
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <kbd>V</kbd> Hold to talk
        </button>
      )}
      {talking && (
        <p class="mic-live" role="status">
          <span class="mic-dot" aria-hidden="true" /> Mic live
        </p>
      )}
      {micNote && (
        <p class="talk-note" role="status">
          {micNote}
        </p>
      )}
    </section>
  );
}

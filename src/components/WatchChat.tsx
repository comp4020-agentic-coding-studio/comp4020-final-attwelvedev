import { useEffect, useRef, useState } from "preact/hooks";
import { MAX_TEXT } from "../game/channels.ts";

export interface WatchLine {
  id: number;
  nickname: string;
  text: string;
}

// The watchers' room: what spectators and people sitting this room out say to each other. Players
// never see it (ADR 0015). Temporary markup until Task 12 restyles it.
export function WatchChat({ lines, onSay }: { lines: WatchLine[]; onSay: (text: string) => void }) {
  const [draft, setDraft] = useState("");
  const list = useRef<HTMLUListElement>(null);
  // the newest line stays in view
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [lines.length]);
  function submit(event: Event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSay(text);
    setDraft("");
  }
  return (
    <section class="watch-chat" aria-labelledby="watch-chat-title">
      <h2 id="watch-chat-title">Watchers</h2>
      <p class="muted">
        Only spectators and people sitting out can read this. Players can't see this.
      </p>
      {lines.length === 0 ? (
        <p class="muted">No messages yet.</p>
      ) : (
        <ul class="watch-lines" aria-live="polite" ref={list}>
          {lines.map((l) => (
            <li key={l.id}>
              {l.nickname}: {l.text}
            </li>
          ))}
        </ul>
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
          onInput={(e) => setDraft(e.currentTarget.value)}
        />
        <button type="submit" class="btn">
          Say
        </button>
      </form>
    </section>
  );
}

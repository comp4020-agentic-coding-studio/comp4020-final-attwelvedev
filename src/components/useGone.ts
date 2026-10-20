import { useEffect, useState } from "preact/hooks";
import type { GameSocket } from "../client/socket.ts";

const SHOWN_MS = 6000;

export const goneText = (m: { nickname: string; how: "bot" | "seat" | "out" }): string =>
  m.how === "bot"
    ? `${m.nickname} left. A bot took their seat.`
    : m.how === "seat"
      ? `${m.nickname} left. Their seat is empty until the host chooses.`
      : `${m.nickname} left the lobby.`;

// The line a screen says when someone leaves a running game, and what became of their seat. Shared
// by the reveal, the HUD and the watchers' screen, so nobody sees a crew change without being told.
// Several people leaving close together are all said, each for its own few seconds, never one
// replacing another.
export function useGone(socket: GameSocket): string | null {
  const [notes, setNotes] = useState<{ id: number; text: string }[]>([]);
  useEffect(() => {
    let next = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const off = socket.on("gone", (m) => {
      const id = next++;
      setNotes((old) => [...old, { id, text: goneText(m) }].slice(-3));
      const timer = setTimeout(() => {
        timers.delete(timer);
        setNotes((old) => old.filter((n) => n.id !== id));
      }, SHOWN_MS);
      timers.add(timer);
    });
    return () => {
      off();
      for (const timer of timers) clearTimeout(timer);
    };
  }, [socket]);
  return notes.length > 0 ? notes.map((n) => n.text).join(" ") : null;
}

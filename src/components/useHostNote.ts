import { useEffect, useRef, useState } from "preact/hooks";
import { hostChangeText } from "../client/hud.ts";

// Says who the host is when the role passes to someone else, on any screen that can be up when it
// does: the reveal, the game and the watchers' screen. Nothing on the first look.
export function useHostNote(hostName: string | null, host: boolean): string | null {
  const seen = useRef({ name: hostName, you: host });
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    const before = seen.current;
    seen.current = { name: hostName, you: host };
    const text = hostChangeText(before, seen.current);
    if (!text) return;
    setNote(text);
    const timer = setTimeout(() => setNote(null), 6000);
    return () => clearTimeout(timer);
  }, [hostName, host]);
  return note;
}

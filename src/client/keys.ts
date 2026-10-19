import type { Role } from "../game/types.ts";
import { PAGES, type Page } from "./wheel.ts";

export type KeyAction =
  | { type: "wheel" } // Q: open the wheel, while held
  | { type: "page"; page: Page } // 1-4 while the wheel is held
  | { type: "text" } // Enter: open the text field
  | { type: "keys" } // Tab: show the key list while held
  | { type: "talk" } // V: talk (hold, or press to toggle)
  | { type: "close" } // Esc: close or cancel whatever is open
  | null;

export interface KeyEvent {
  key: string;
  code: string;
  shiftKey: boolean;
}

// What a key does to the comms. Sending is by the wheel, never by a number you
// would have to remember: 1-4 only switch pages while the wheel is held. `wheel`
// is true while it is held open; `typing` is true while a text field has focus,
// when the field owns every key but Esc.
export function keyAction(
  _role: Role,
  state: { wheel: boolean; typing: boolean },
  e: KeyEvent,
): KeyAction {
  if (e.key === "Escape") return { type: "close" };
  if (state.typing) return null;
  if (e.key === "Tab") return { type: "keys" };
  const lower = e.key.toLowerCase();
  if (lower === "q") return { type: "wheel" };
  if (lower === "v") return { type: "talk" };
  if (e.key === "Enter") return { type: "text" };
  if (!state.wheel) return null;
  // the physical key, so Shift or another layout does not change which page it is
  const digit = /^Digit([1-4])$/.exec(e.code)?.[1] ?? (/^[1-4]$/.test(e.key) ? e.key : null);
  const page = digit ? PAGES[Number(digit) - 1] : undefined;
  return page ? { type: "page", page } : null;
}

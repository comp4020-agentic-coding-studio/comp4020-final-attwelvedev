import { CALLOUTS, type Callout } from "../game/channels.ts";

export type Sheet = "say" | "sound" | "show";
export type KeyAction =
  | { type: "open"; sheet: Sheet }
  | { type: "close" }
  | { type: "pick"; index: number } // slot in the open sheet, from 0
  | { type: "tab"; tab: "faces" | "stamps" } // F and T inside Show
  | { type: "page" } // 0: the Show hotbar moves between faces 1–6 and 7–12
  | { type: "text" } // Enter in Say: focus the text field
  | { type: "keys" } // Tab: show the key list while held
  | { type: "talk" } // V: push to talk, while held
  | null;

const OPENS: Record<string, Sheet> = { "1": "say", "2": "sound", "3": "show" };

// What a key does to the tray. `open` is the sheet showing (null when none);
// `typing` is true while a text field has focus. Then the field owns every key
// but Esc, so a digit typed into a message never picks a callout.
export function keyAction(open: Sheet | null, key: string, typing: boolean): KeyAction {
  if (key === "Escape") return open ? { type: "close" } : null;
  if (typing) return null;
  if (key === "Tab") return { type: "keys" };
  if (key.toLowerCase() === "v") return { type: "talk" };
  if (open === null) {
    const sheet = OPENS[key];
    return sheet ? { type: "open", sheet } : null;
  }
  if (key === "0") return { type: "page" };
  if (open === "show" && key.toLowerCase() === "f") return { type: "tab", tab: "faces" };
  if (open === "show" && key.toLowerCase() === "t") return { type: "tab", tab: "stamps" };
  if (key === "Enter") return open === "say" ? { type: "text" } : null;
  return /^[1-9]$/.test(key) ? { type: "pick", index: Number(key) - 1 } : null;
}

export const calloutAt = (index: number): Callout | undefined => CALLOUTS[index];

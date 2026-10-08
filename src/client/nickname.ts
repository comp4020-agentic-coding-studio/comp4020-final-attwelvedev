// The nickname is remembered in this browser only; the server never stores it
// past the lobby (ADR 0008). Storage can be blocked, so every access is guarded.
const KEY = "heist.nickname";

export function readNickname(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveNickname(name: string): void {
  try {
    localStorage.setItem(KEY, name);
  } catch {
    // a blocked store just means asking again next time
  }
}

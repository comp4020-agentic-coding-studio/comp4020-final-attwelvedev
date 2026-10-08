import { randomInt } from "node:crypto";

// No I, L or O: they read as 1 and 0 across a room. 23 letters, 4 places.
export const LOBBY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";

export function newLobbyCode(isTaken: (code: string) => boolean): string {
  for (;;) {
    let code = "";
    for (let i = 0; i < 4; i++) code += LOBBY_ALPHABET[randomInt(LOBBY_ALPHABET.length)];
    if (!isTaken(code)) return code;
  }
}

// What a player typed, as a code: null unless it is exactly 4 alphabet letters.
export function normaliseLobbyCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return code.length === 4 && [...code].every((c) => LOBBY_ALPHABET.includes(c)) ? code : null;
}

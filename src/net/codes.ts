import { randomInt } from "node:crypto";
import { LOBBY_ALPHABET, LOBBY_CODE_LENGTH } from "./protocol.ts";

export { LOBBY_ALPHABET };

export function newLobbyCode(isTaken: (code: string) => boolean): string {
  for (;;) {
    let code = "";
    for (let i = 0; i < LOBBY_CODE_LENGTH; i++)
      code += LOBBY_ALPHABET[randomInt(LOBBY_ALPHABET.length)];
    if (!isTaken(code)) return code;
  }
}

// What a player typed, as a code: null unless it is exactly LOBBY_CODE_LENGTH alphabet letters.
export function normaliseLobbyCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return code.length === LOBBY_CODE_LENGTH && [...code].every((c) => LOBBY_ALPHABET.includes(c))
    ? code
    : null;
}

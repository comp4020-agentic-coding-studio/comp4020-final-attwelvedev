import { LOBBY_ALPHABET, LOBBY_CODE_LENGTH } from "../net/protocol.ts";

// What was typed in the code field, kept to the letters a code can have, at most
// a code long: a paste of "ab-cd" becomes ABCD, and I, L, O and digits never land.
export function codeLetters(raw: string): string {
  return [...raw.toUpperCase()]
    .filter((c) => LOBBY_ALPHABET.includes(c))
    .join("")
    .slice(0, LOBBY_CODE_LENGTH);
}

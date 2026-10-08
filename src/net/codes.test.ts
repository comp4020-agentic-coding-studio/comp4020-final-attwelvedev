import { describe, expect, it } from "vitest";
import { LOBBY_ALPHABET, newLobbyCode, normaliseLobbyCode } from "./codes.ts";

describe("newLobbyCode", () => {
  it("is 4 characters from the alphabet, never I, L or O", () => {
    expect(LOBBY_ALPHABET).toHaveLength(23);
    for (let i = 0; i < 500; i++) {
      const code = newLobbyCode(() => false);
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
      expect(code).not.toMatch(/[ILO]/);
    }
  });

  it("tries again until the code is free", () => {
    let calls = 0;
    const taken = () => ++calls <= 5;
    const code = newLobbyCode(taken);
    expect(calls).toBe(6);
    expect(code).toMatch(/^[A-Z]{4}$/);
  });
});

describe("normaliseLobbyCode", () => {
  it("trims and upper-cases", () => {
    expect(normaliseLobbyCode(" kmqz ")).toBe("KMQZ");
  });

  it.each(["", "ABC", "ABCDE", "AB1D", "ABIO", "AB D", "ÅBCD"])("rejects %j", (raw) => {
    expect(normaliseLobbyCode(raw)).toBeNull();
  });
});

import type { LobbySettings } from "../net/protocol.ts";

// Mirrors src/net/lobbies.ts's presetFor and DEFAULT_SETTINGS exactly
// (realLifePreset.test.ts checks the two stay in step). Not imported from
// there: net/lobbies.ts pulls in ./codes.ts for node:crypto, which the
// client bundle never reaches past src/net/protocol.ts for (CLAUDE.md's
// layering rule) — importing it here would leak node:crypto into the
// browser build, as it did before this file existed.
export const DEFAULT_SETTINGS: LobbySettings = {
  inPerson: false,
  maskNoise: false,
  othersSoundOff: false,
  voice: true,
};

export function presetFor(answers: {
  sameRoom: boolean;
  deafHasHeadphones: boolean;
  othersHaveHeadphones: boolean;
}): LobbySettings {
  if (!answers.sameRoom) return { ...DEFAULT_SETTINGS };
  return {
    inPerson: true,
    maskNoise: answers.deafHasHeadphones,
    othersSoundOff: !answers.othersHaveHeadphones,
    voice: false,
  };
}

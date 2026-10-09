import type { LobbySettings } from "../net/protocol.ts";

// The honour-system reminders a real-life table needs, derived from the
// settings alone (no separate "why" is stored, but the practical effect is
// the same either way): shown in the wizard's review step and on every
// player's role-reveal screen, so FR7 reaches the whole team, not just the
// host who ran the wizard.
export function honourLines(settings: LobbySettings): string[] {
  if (!settings.inPerson) return [];
  const lines = ["Can't speak is on your honour: no talking, mouthing or pointing at words."];
  if (!settings.maskNoise) {
    lines.push(
      "Can't hear has no masking noise playing: keep the table quiet near them, or they'll hear what everyone says.",
    );
  }
  return lines;
}

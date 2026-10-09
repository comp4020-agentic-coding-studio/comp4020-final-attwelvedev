// A small blocklist for the public leaderboard: nicknames and team names are
// shown to everyone, unmoderated. Not a profanity filter for chat (there is
// none here); just enough to keep an obvious slur or slur off the board.
const BLOCKED = [
  "fuck",
  "shit",
  "cunt",
  "nigger",
  "nigga",
  "faggot",
  "retard",
  "rape",
  "asshole",
  "bitch",
  "whore",
  "slut",
];

const normalise = (raw: string): string => raw.toLowerCase().replace(/[^a-z0-9]+/g, "");

export function isAllowedName(name: string): boolean {
  const flat = normalise(name);
  return !BLOCKED.some((word) => flat.includes(word));
}

# Sensory heist

Three players each lack one channel: one can't see, one can't hear, one can't speak. The rule behind the game is that a missing sense changes who you have to ask, never whether the team can know, so the puzzles are hard because you have to talk, not because information is missing.

## What good means here

Every event has both a sound and a sight, so a player missing one sense can still learn of it through the other, within earshot and line of sight. A camera's sound tells Can't see it is on, but not where its cone is, so the others must guide them. `src/game/types.ts` defines what each role can send and receive ([ADR 0011](https://github.com/comp4020-agentic-coding-studio/comp4020-final-attwelvedev/blob/main/doc/adr/0011-channels-by-method.md)).

This is how the idea is enforced:

- **Parity:** `src/game/parity.test.ts` has one row per sound the game can make (41 today). Exceptions: the alarm, the clue chime and gear, each with its reason in its row. `CLAUDE.md` binds later sessions to it.
- **Perception:** the server sends each role only what it can perceive, over a WebSocket, since a browser given the map would let Can't see cheat ([ADR 0007](https://github.com/comp4020-agentic-coding-studio/comp4020-final-attwelvedev/blob/main/doc/adr/0007-websocket-game-server-with-per-role-perception.md)); `spec/perception.test.ts` checks the raw messages.
- **Solvability:** perception-only bots clear all nine rooms in every role rotation ([ADR 0018](https://github.com/comp4020-agentic-coding-studio/comp4020-final-attwelvedev/blob/main/doc/adr/0018-perception-only-bots-and-paced-rooms.md)); checked by `spec/rooms.test.ts`.

The brief asks for multi-user, real-time and persistent. Three people join from three browsers, each in a seat of their own ([ADR 0008](https://github.com/comp4020-agentic-coding-studio/comp4020-final-attwelvedev/blob/main/doc/adr/0008-anonymous-device-and-nickname.md)); the WebSocket is the real-time mechanism. Only heist records persist ([ADR 0009](https://github.com/comp4020-agentic-coding-studio/comp4020-final-attwelvedev/blob/main/doc/adr/0009-only-heist-records-persist.md)): team name, nicknames (bots marked), time, loot and date, ranked on the leaderboard. `spec/persistence.test.ts` restarts the app on the same database and checks a record survives; it does not cover Fly's `/data` volume.

**Judged through playtesting:** the tests prove information is sent, not that a person can use it. In [playtest 1](https://github.com/comp4020-agentic-coding-studio/comp4020-final-attwelvedev/blob/main/playtests/2026-10-09-playtest-01.md), players invented a shared language the game never taught (air-horn for "go", car-horn for "down"), but Can't speak had little to do and room 3's dark area was impossible for Can't hear. Leaning on the deficits made the game too hard, so I pivoted to escape-room tasks. [Playtest 2](https://github.com/comp4020-agentic-coding-studio/comp4020-final-attwelvedev/blob/main/playtests/2026-10-14-playtest-02.md) found Can't see "deadweight", so braille gave it information only it can read. [Playtest 3](https://github.com/comp4020-agentic-coding-studio/comp4020-final-attwelvedev/blob/main/playtests/2026-11-08-playtest-03.md) found the side jobs and braille engaging, and Can't speak now dominating the keypad, which is not yet rebalanced.

The look is judged too. `DESIGN.md` records the design language, `CLAUDE.md` sends visual changes through it, and `spec/layout/` checks that layouts hold.

## What I read

The viral "blind, deaf, mute" videos that inspired this have people attempt familiar tasks, like [cooking](https://www.youtube.com/watch?v=5KP1726bIvQ) or [Minecraft](https://www.youtube.com/watch?v=I-XA7KQO9cU), under the same missing senses. My first build did the opposite and was too hard, so I borrowed familiar escape-room tasks.

The [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/full-list/) say [audio information should be replicated in text or visuals](https://gameaccessibilityguidelines.com/ensure-that-all-important-supplementary-information-eg-the-direction-you-are-being-shot-from-conveyed-by-audio-is-replicated-in-text-visuals/); every sound follows that rule. [Ben Kane's GDC 2016 talk](https://gdcvault.com/play/1023113/Designing-Asymmetric-Gameplay-For-Keep) calls *Keep Talking and Nobody Explodes* "a game about communication between players", so I built puzzles that require talking. A student [analysis of *Pico Park*](https://mechanicsofmagic.com/2026/04/16/critical-play-competitive-analysis-122/) notes that with identical players the weakest holds everyone back; braille gives Can't see its own job. [Galantucci (2005)](https://pubmed.ncbi.nlm.nih.gov/21702792/) showed pairs inventing signalling systems through narrow channels; my playtesters did the same with horns and a numbered face wheel.

## What I chose not to build

- Role abilities, because they prescribe strategy ([ADR 0017](https://github.com/comp4020-agentic-coding-studio/comp4020-final-attwelvedev/blob/main/doc/adr/0017-balance-by-presence-stations-and-gear.md)). Braille is the one exception I reversed, for the reason above ([ADR 0023](https://github.com/comp4020-agentic-coding-studio/comp4020-final-attwelvedev/blob/main/doc/adr/0023-braille-plates-only-cant-see-reads.md)); arbitrary capabilities, such as only Can't see pushing crates, stay declined.
- Drawing and GIFs: they bloated the channels and could dilute the humour of the existing ones.

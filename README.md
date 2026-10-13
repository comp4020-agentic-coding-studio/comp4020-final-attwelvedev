# Sensory heist

One player can't see, one can't hear, and one can't speak. They have to communicate well in spite of it to complete the heist together. A redeploy ends games in progress, but heist records persist.

## What good means here

Everyone can perceive everything that happens in a room, at least in a limited way. What Can't see cannot see, they hear, and it is captioned. What Can't hear cannot hear, they see in the same moment. Can't speak sees and hears it all. The players then talk to fill the gaps: a camera switching on makes a noise, but Can't see cannot tell where its cone falls, so the other two must guide them. Nobody is shut out of a fact; they are only made to rely on a teammate.

| Role | Cannot perceive |
| -- | -- |
| Can't see | Map, faces, stamps |
| Can't hear | Voice (and text chat), sounds |
| Can't speak | n/a |

**Enforced.**

- **Parity.** `src/game/parity.test.ts` has one row per sound the game can make (22 today). Each builds a real situation and checks that Can't see receives the sound, Can't hear sees a change in the same tick, and a caption exists. A sound with no row fails the typecheck. The alarm is the one deliberate exception: it silences the other sounds for those who hear. `CLAUDE.md` binds later agent sessions to the rule.
- **Perception.** The server sends each role only what it can perceive ([ADR 0007](doc/adr/0007-websocket-game-server-with-per-role-perception.md)); otherwise dev tools would show the map to Can't see. `spec/perception.test.ts` reads the raw messages.
- **Solvability.** `spec/rooms.test.ts` has three bots, each seeing only its own role's view and talking through the channel router, clear every room in every rotation of roles without being caught. An early room could trap a team behind a door that closed when a player stepped off its plate.

**Judged.** The tests prove information is sent, not that a person can use it. I judged that by playing with friends ([playtest 1](playtests/2026-10-09-playtest-01.md): three people, laptops, no explanation given). It worked where hoped: two players agreed that an air horn meant "go" and a car horn meant "down", a shared language the game never taught. It also failed twice. Can't speak had little to do, and room 3's dark area left Can't hear unable to take part. Neither is fixed yet.

## What I read

The [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/full-list/) say important information conveyed by audio should be repeated in text or visuals, and suggest muting the game to find what you miss. I took that as the design rule for every role. Ben Kane's GDC 2016 talk on [asymmetric design in *Keep Talking and Nobody Explodes*](https://gdcvault.com/play/1023113/Designing-Asymmetric-Gameplay-For-Keep) frames that game as one about communication between players, which is what I wanted to build around. A student [analysis of *Pico Park*](https://mechanicsofmagic.com/2026/04/16/critical-play-competitive-analysis-122/) credits its chaos to identical players sharing a space, and treats miscommunication as part of the design.

## What I chose not to build

I considered special abilities per role, such as only Can't see pushing crates, or only Can't speak seeing hidden codes. It would be funny, but the game would prescribe the strategy. Open problem-solving is what makes communication matter, and *Pico Park* and *Lethal Company* give no roles yet need constant talk.

I also considered drawing, inspired by Gartic Phone, and GIFs. With them the channels felt bloated, and would dilute the humour of the existing ones.

## The pantry, archived

The shared-pantry app is preserved at the git tag [`archive/pantry-2026-10-08`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-attwelvedev/releases/tag/archive%2Fpantry-2026-10-08).

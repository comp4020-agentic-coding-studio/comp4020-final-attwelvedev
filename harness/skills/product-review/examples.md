# Worked examples (COMP4020 Week 11: Product Management)

These are examples from the lecture. Use them to set the level of tone and
specificity, and don't copy their content. Plenty is a co-op browser game
built in riff 8 (dachi pod 1). The Duolingo examples are the lecture's
industry illustrations.

## Pitch, word by word (Plenty)

> "A cosy co-op game where you and your friends build a machine that does
> everything for you, and slowly notice it has eaten the world."

- **cosy:** the first minutes are crowded with keys and hunger
- **co-op:** true in the rules, but never tested with real groups
- **slowly notice:** the point only comes across to groups who play past Earth
- **shareable:** the site blocks embedding, so it can't go on this slide or on itch.io

## Five users, and a choice (Plenty)

- **Mei, weekly co-op group:** "we argued for forty minutes about overclocking the datacentre"
- **Arjun, geography teacher:** "the brown grass beat my slides, but two hours won't fit a lesson"
- **Sam, solo optimiser:** "a factory game that makes you feel bad about the factory"
- **Priya, lapsed gamer:** "the memo told me what to do; I don't know what half the panels mean"
- **Leo, critic:** "it earns its ending; I wish more people got to Mars"

**Built for: Mei.** The shared store, the water priority and the restraint
vote all need a group.

Note the spread: the core user, an adjacent use (teaching), a power user, a
struggling newcomer, a critic. Each quote names a real feature or friction.

## First five minutes (Plenty)

- **twenty-plus keys:** help is behind H, and nobody knows to press it
- **pointer lock:** click to harvest, and the cursor disappears until you find Esc
- **arriving alone:** "2–8 players", but the bots only run from the command line
- **"testing: 5× clock":** the more fun first session is labelled as a debug option

## One feature (Plenty)

> rename the rapid preset to "short game" and make it the default

It's one sentence, it costs almost nothing, and it fixes the first-five
finding ("testing: 5× clock") and the teacher's two-hour problem together.

## Press release (Plenty)

**Plenty lets a group of friends build a machine that eats the world, together**

*A cosy co-op browser game for two to eight players. No account, no download.*

CANBERRA, [launch date]: Plenty is a multiplayer game where you gather, craft
and build until a datacentre does the gathering for you. When the island is
used up, the Plenty Cooperative has another world ready. It has five.

Building games reward growth and hide what it costs. You never have to look
at what your factory used up.

Plenty never stops you and never lectures you. It shows the cost in the land:
the grass browns, the pond shrinks to mud, the birdsong thins, and an archive
records every named place you lost. The ending reads it back to you.

"We wanted players to enjoy building the machine, then notice what it had
consumed," said [name], dachi pod 1.

To start, open the site, start a world and send your friends the five-letter
room code.

"We argued for forty minutes about overclocking the datacentre. Nobody wanted
to be the one who killed a resident," said [player], Canberra.

Plenty is free to play in any desktop browser today.

## FAQ questions (Plenty)

| asked by | question |
| --- | --- |
| customer | How long does a game take? |
| customer | Can I play on my phone? |
| customer | Can I just keep building forever? |
| engineering | One Node process on one Fly machine runs every room. What happens to players when it crashes, or when we deploy? |
| engineering | Will it scale? |
| engineering | How do you know the accounting is right? |
| business | Who is this for? |
| business | The game's point arrives one to three hours in, and every playtest so far is bots. How do we know people will stay long enough to get it? |
| business | What hasn't been validated? |
| business | What was cut? |

## FAQ answers: the shape to copy (Duolingo)

**Engineering:** *"Our Postgres database runs in one US region. Users in
Europe and Australia will wait 80–200 ms on every write. What will we do
about latency?"*

You're right that one database can't serve three continents quickly. Our plan:
- **reads:** put read-only copies in Europe and Australia; about 90% of
  requests are reads, and these will be served locally
- **writes:** keep them in the US for now, and update the screen before the
  write is confirmed so users don't wait
- **later:** store each user's data in their home region; this also helps
  with EU data rules
- **not now:** databases built to span regions (CockroachDB, Spanner);
  moving to one costs too much for launch

**Business:** *"Why add a Family plan priced at less than two Super
subscriptions? Won't paying users just move to it?"*

Some will. We still expect it to pay: free households convert more easily,
shared logins get a reason to upgrade, families cancel less often. We come
out ahead if new payers outweigh downgrades.
- **test:** run it in one market for three months; measure paying learners
  and revenue per household; stop if downgrades outnumber new paying families

The pattern is: concede → plan → **not now** → **test with a stop condition**.

## RICE (Duolingo, then Plenty)

| feature | R | I | C | E | score |
| --- | --- | --- | --- | --- | --- |
| family tier | 4,000 | 2 | 50% | 4 | 1,000 |
| regional read copies | 12,000 | 1 | 80% | 3 | 3,200 |
| dark mode | 20,000 | 0.25 | 100% | 1 | 5,000 |

Dark mode scores highest because it is cheap, reaches many users and is
certain. **RICE favours small, safe changes.**

Plenty, top and bottom of twenty (effort in weeks):

| feature | area | R | I | C | E (wk) | score |
| --- | --- | --- | --- | --- | --- | --- |
| pin the memo as a checklist | UI | 2,000 | 1 | 100% | 0.5 | 4,000 |
| 40-minute short campaign | mechanics | 1,200 | 2 | 80% | 0.5 | 3,840 |
| first-minute guided tutorial | education | 2,000 | 2 | 80% | 1 | 3,200 |
| tooltip on the browning land | education | 2,000 | 1 | 80% | 0.5 | 3,200 |
| solo mode with co-op bots | mechanics | 800 | 2 | 50% | 1 | 800 |
| touch controls | mechanics | 1,500 | 2 | 50% | 3 | 500 |
| sprite art for buildings and avatars | art | 2,000 | 1 | 50% | 4 | 250 |
| voxel terrain and digging | mechanics | 1,000 | 1 | 50% | 8 | 63 |
| weather and fire | elements | 600 | 0.5 | 50% | 3 | 50 |

The first-five-minutes findings show up as the cheap, high-scoring education
and UI fixes at the top. Big new systems sink to the bottom.

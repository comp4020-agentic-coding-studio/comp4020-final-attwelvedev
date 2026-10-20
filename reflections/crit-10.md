# Crit 10 reflection

## What was the breakthrough that moved the work forward?

The breakthrough was accepting that other people have to be part of the feedback loop, because neither the agent nor I can stand in for them. In a multiplayer game, what matters is how it feels to play with other people, and an agent can't simulate that. Everything the agent could check was green: the suite, the bots clearing every room, the parity table.

Playtest 2 had six people from my pod in two lobbies, and it said something none of those checks could. Can't see was "deadweight", receiving instructions with little to do. Comms options were glossed over, the role reveal didn't say who was ready, and the real-life setup was ignored. I would not have found the first by playing alone, because I know what the game is meant to be. Each finding became a row in `playtests/2026-10-14-playtest-02.md` with a change and a check, and together they became the play overhaul: sight that is local to each role, a lead role in every room, and ADRs 0011–0016. That is a much bigger change than I would have made on my own.

## What did this work change about who I want to be as a software developer?

I don't yet know the full answer, but one part is clear: agents can't replace the whole workflow. They are very good at fast implementation, and at turning a finding into a spec so it can't come back. They can't tell me how the experience feels, and I can't either once I know the game too well.

So at least part of who I want to be is a developer who goes and finds people early, writes down what they said, and decides which findings change the design. I haven't yet playtested the play overhaul, so I can't say it fixed what the first two playtests found.

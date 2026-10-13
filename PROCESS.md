# Process overview

A three-player browser co-op heist: one player can't see, one can't hear, one can't speak, and they coordinate through channels each role may use. It is my second app; the first was a shared pantry.

## From the brief to this app

The brief wants an app that is more interesting because other people are using it at the same moment. My pantry answered that weakly: households talked in person and the app stayed out of the way. I stopped half-way through phase 05a, because more polish would not have made it any more about co-presence.

The pivot went through the usual route: a brainstormed spec, four new ADRs and a phased plan, committed before any code moved ([`22bbaef`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-attwelvedev/commit/22bbaef)). The unfinished pantry was committed as it stood and tagged `archive/pantry-2026-10-08` ([`a53b516`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-attwelvedev/commit/a53b516)), so every earlier SHA still resolves. Then I deleted it from `main` ([`463b7b6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-attwelvedev/commit/463b7b6)). The harness carried over, since none of it was about food. The cut was clean: `pnpm check` stayed green and a grep for pantry wording in `src` and `spec` came back empty.

## Stack

Astro on Node with SQLite stayed ([ADR 0001](doc/adr/0001-astro-node-preact-sqlite-stack.md)), because the target is still one 256 MB Fly machine. The real decision was the transport. If the Can't-see browser receives the map and merely doesn't draw it, dev tools expose it. So a `ws` server runs an authoritative headless simulation and sends each client only what its role perceives ([ADR 0007](doc/adr/0007-websocket-game-server-with-per-role-perception.md)). I rejected peer-to-peer, which has no referee, and a game framework, which is heavy for 256 MB and diffs state assuming everyone sees the same thing. Identity is an anonymous device cookie plus a nickname ([ADR 0008](doc/adr/0008-anonymous-device-and-nickname.md)), only heist records persist ([ADR 0009](doc/adr/0009-only-heist-records-persist.md)), and voice is relayed through the server so the deaf rule is enforced there ([ADR 0010](doc/adr/0010-voice-relayed-through-the-server.md)). Because the simulation has no DOM or sockets, bots, the room linter and the specs run it directly.

## Workflow

Work goes brainstorm, plan, execute. Each phase has a TDD plan, and the agent reviews it against the real code first, stopping to ask when they disagree. Mid-phase ideas go to a backlog sorted at the phase boundary. `pnpm check` must be green before each commit, and each commit is one unit of work. Hooks block edits to course-fixed files and deploys from a dirty tree. When I correct the agent I fix the cause, in `CLAUDE.md` or a check, and log it in `PROCESS_LOG.md`.

## Moments that mattered

**Parity became a test that can fail.** In review I noticed plates, crates, the checkpoint and the sequence door made no sound, so Can't see would never learn of them. The obvious fix was to add the sounds. Instead I made the promise the thing to test, and had the agent first write `src/game/parity.test.ts`: one row per sound, typed against the list of sounds so a new sound without a row fails to compile. Each row builds a real situation and checks that Can't see receives the sound, Can't hear sees a change in the same tick, and a caption exists. It went red for ten sounds before any was built, and the rule went into `CLAUDE.md` ([`9459be1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-attwelvedev/commit/9459be1)). It proves the information is sent, not that a person can tell two sounds apart.

**A checkpoint one player could bank for everyone.** One player ran through the dark corridor blind and everyone respawned at the next flag. I changed the rule, not the corridor: a checkpoint sets only when all three are within 1.5 tiles. Four new tests failed first, and a solve test proves the scripted team can still set every flag ([`9459be1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-attwelvedev/commit/9459be1)). The radius is a guess not yet tried on phones.

**Playing it found what a green suite could not.** Task 8 passed 255 tests, then playing it showed a door that stranded a player and a crate that only sometimes moved. Each bug became a failing test first. The crate test failed at all 20 offsets and four directions, passed with the fix, and failed again with it stashed. The reload freeze needed a socket-level test, because a browser test passed with and without the fix, so I deleted it ([`4d86a17`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-attwelvedev/commit/4d86a17)).

**A lane along a camera's own wall.** I could hug a wall and walk past a watching camera. Widening one cone would have left room 3 with the same hole. The reproduction showed cameras saw from tile centre, leaving the wall strip outside the cone. They now see from the wall face, and a test walks every legal line across every camera. It failed on exactly y = 1.4 in both rooms before the fix, matching what I'd seen by hand ([`29c95e1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-attwelvedev/commit/29c95e1)).

**A fresh install would have crashed.** Task 18 demanded a persistence test on a genuinely empty database. It crashed: a pivot migration dropped a table two others still referenced. The agent proposed editing that migration. I refused, because it had already run on the deployed volume, and had it switch foreign keys off only around `migrate()`. A saved run later survived a real redeploy ([`69e35ea`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-attwelvedev/commit/69e35ea)).

**Chasing choppy voice without guessing.** I reported choppy voice. The agent measured each stage on the real relay and my real microphone; the pipeline was clean, and only a Guest Chrome profile fixed the live call. The agent was wrong twice (a 64 kbps suggestion that would have broken the 400-byte frame cap, and a feedback loop I had ruled out), both caught by my reply, not a check. Only a real leak and a lag-notice spec shipped ([`9c48f74`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-attwelvedev/commit/9c48f74)).

**Deferring a redesign.** Headphones belong to a seat, but roles rotate, so the wizard's one-time question goes stale. With a deploy pending I declined a quick patch, because the real fix reopens `presetFor` and `LobbySettings`, and parked it in the backlog with the interfaces named ([`642141a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-attwelvedev/commit/642141a)).

## Where it stands

The first playtest, with two friends on laptops, found that Can't speak had little to do and that the dark area in room 3 was impossible for Can't hear ([`playtests/2026-10-09-playtest-01.md`](playtests/2026-10-09-playtest-01.md), at [`1b34024`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-attwelvedev/commit/1b34024)). Neither is fixed yet. The playtest log lists both with a planned check, so a green suite is not yet evidence that every role can finish every room.

## Takeaway

Checks catch what I thought to test, and playing the game catches the rest. Each time, the fix goes into a rule or a spec, so the agent can't repeat it, and I confirm a check against the known bug before trusting it.

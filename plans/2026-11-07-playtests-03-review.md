# Playtests — Phase 03: the screenshot review (`pnpm playtest:review`), and docs

- **Date:** 2026-11-07
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-07 (option B)
- **Part of:** `plans/2026-11-07-playtests-00-overview.md`. Read it first: §2 (FR9–FR12), §3
  (conventions, the user's go-ahead before spending), §4.4 (cost model).
- **Depends on phases:** 01 (the SDK and the proxy proof), 02 (the run's evidence).

## 1. Summary

Builds `pnpm playtest:review <run>`. It reads a finished regression run's beat evidence offline. For
each role at each beat, it asks the model one question as a first-time player: what can't you read,
what misleads you, what is missing, what would you do next. It writes `review.html`, with each answer
set beside the beat's designed intent. It prints an estimate and needs `--yes`.

The phase then reviews one room for real, sets the estimate's constants from that measurement, and
writes the docs. The feature is complete at the end of it.

## 2. Requirements (this phase)

### 2.1 Functional

FR9, FR10, FR11 (Task 129); FR12 (Task 130); the measured room and docs for all FRs (Task 131).

### 2.2 Non-functional

- NFR1: not in `pnpm check`, no browser.
- NFR3, NFR4: the SDK comes from Task 121. `new Anthropic()` takes no arguments.
- Cost: overview §4.4. The measured run needs the user's go-ahead.

### 2.3 Out of scope for this phase

Agents that play (parked in `specs/backlog.md`). A full nine-room review: that is the user's call after
this phase, with the estimate in front of them.

### 2.4 Assumptions

See overview §2.4.

## 3. Existing code context (verified 2026-11-07)

- `src/game/types.ts`: `ROLE_LABEL = { blind: "Can't see", deaf: "Can't hear", mute: "Can't speak" }`.
- Room files (`rooms/NN-slug.room`) open with one JSON header line block before `---`. It holds
  `"beats":[{"name":"One plate","x":[0,11],"intent":{"blind":"…","deaf":"…","mute":"…"}}, …]` and
  `budgetS`. The game parses these into `Room.beats: Beat[]`
  (`src/game/rooms/format.ts`, `parseRoom(text)`). The review reads `intent` **for the report only**.
- Beats per room: 01:2, 02:3, 03:2, 04:4, 05:3, 06:4, 07:6, 08:5, 09:6, which is 35 in all. Calls per
  heist: 3 roles × (35 beats + 9 room starts) = 132.
- `@anthropic-ai/sdk` 1.6.0 is installed (Task 121). The model id comes from
  `--model ?? process.env.PLAYTEST_MODEL ?? process.env.ANTHROPIC_MODEL`, which is `claude-sonnet-5-5`
  here. Pricing: $2 in, $10 out, $0.20 cache read per MTok. Forced `tool_choice` is a 400 on this
  model, so the structured answer uses `output_config: { format: { type: "json_schema", … } }`.
- `scripts/playtest/report.ts` (Task 128) has the run report's HTML conventions: no script, no external
  assets, escaped text. Reuse its `escapeHtml` and page shell.
- `README.md` headings, in order: "What good means here", "What I read", "What I chose not to build",
  "The pantry, archived". `spec/readme.test.ts` checks that they appear in order on `/readme/`.

### Interfaces from earlier phases (exact)

From Task 121: `@anthropic-ai/sdk` is a devDependency. `src/layering.test.ts` refuses it under `src/`.
`scripts/playtest/probe.ts` showed that the proxy takes images.

From Tasks 125 and 128 (the evidence layout, overview §4.5):

```
review/playtest/<run>/
  prior/<seat>-home.txt                    the home page as text, before joining
  <room-id>/prior/<role>-reveal.txt        that room's reveal as text (+ the sound briefing for blind)
  <room-id>/<role>-<width>-<beat>.png      beat screenshot (beat: "start", "1".."n", "end")
  <room-id>/<role>-<width>-<beat>.txt      perceived text: the ariaSnapshot of the body, then "Captions:" and each caption line, arrows as "from the north-east"
  run.json                                  { rooms: string[]; widths: number[]; seats: { seat: number; width: number }[] }
```

`scripts/playtest/report.ts` exports `escapeHtml(text: string): string` and
`page(title: string, body: string): string`.

## 4. Approach

**Files** (all new):

| File | Job |
| --- | --- |
| `scripts/playtest-review.ts` | CLI: `<run>`, `--room NN`, `--model ID`, `--yes`; estimate; run; report |
| `scripts/playtest/review/collect.ts` | evidence dir to `ReviewItem[]`, pure over a file listing |
| `scripts/playtest/review/ask.ts` | `ReviewItem` to request params (pure), and one call |
| `scripts/playtest/review/cost.ts` | `estimate`, `tally` (pure) |
| `scripts/playtest/review/html.ts` | `renderReview(...)` (pure) |
| `scripts/playtest/review/*.test.ts` | unit tests (`scripts/**/*.test.ts` is in the unit project since Task 125) |

```ts
interface ReviewItem {
  room: string; beat: string; role: Role; width: number;
  screenshot?: string; // path; absent for blind (and never read for blind even if present)
  perceived: string;   // the .txt
  prior: string;       // home + this room's reveal (+ briefing)
}
interface ReviewAnswer {
  findings: { kind: "unreadable" | "misleading" | "missing" | "unclear-next"; what: string; where: string }[];
  next: string;
}
```

**The request** (`ask.ts`):
- `system`: "You are playing a browser game for the first time, with two teammates on their own devices.
  Your role is <ROLE_LABEL>. Your team's goal is to clear each room. Below is what you were shown before
  play. You will be shown your screen at one moment. Say plainly what you cannot read or make out, what
  would mislead you, what you would need that is not there, and what you would do next." It is followed
  by `prior`. It is cached (`cache_control: { type: "ephemeral" }`) and is the same for every beat of a
  seat's room.
- `user`: the screenshot as a base64 PNG image block for the sighted, then `perceived`.
- `max_tokens: 1500`, `output_config: { effort: "low", format: { type: "json_schema", schema } }`, where
  the schema is `ReviewAnswer`'s, with `additionalProperties: false`.
- A `refusal` stop reason or an API error after the SDK's retries is recorded on the item as an
  `error`. The run goes on.
- Calls run 3 at a time.

## 5. Task breakdown

### Task 129: Collect what each role perceived, and ask about it

- **Description.**
  - `collect(listing: string[], read: (path) => string, only?: string): ReviewItem[]`: one item per
    room × beat × role (beats "start" and "1".."n"; not "end"), at the width that seat played, from the layout in this file's §3.
  - `requestFor(item, model): MessageCreateParams`, as described in this file's §4.
  - `askOne(client, item, model): Promise<{ answer?: ReviewAnswer; error?: string; usage }>`.
- **Files touched:** `scripts/playtest/review/{collect,ask}.ts`, `collect.test.ts`, `ask.test.ts`.
- **Tests first (red).**
  - `collect.test.ts`, on a fake listing of room 01:
    - 9 items: 3 roles × start, 1, 2 (each room's "end" is skipped: the cleared card is FR5's)
    - blind items have no `screenshot`
    - `prior` holds the home text and that room's reveal; for blind it also holds the briefing
    - `--room 01` filters
  - `ask.test.ts`:
    - `requestFor(blindItem)` has no image block anywhere
    - a sighted item's image comes before its text
    - the system prompt names only that role's label
    - no part of the request contains any of: `"intent"`, `"RoleView"`, `"entities"`, `"hints"`,
      `"decode"`, `"README"`, the room id, `"budgetS"` (the FR9 tripwire, run over the serialised
      request)
    - the format schema has `additionalProperties: false`
  - Break checks:
    - (a) attach the screenshot for blind
    - (b) put the beat's `intent` into the user text

    Both go red.
- **Implementation (green).** As described.
- **Acceptance criteria.** The tests are green, each shown red first.
- **Depends on:** phases 01, 02.

### Task 130: The CLI, cost guard and `review.html`

- **Description.**
  - `scripts/playtest-review.ts <run> [--room NN] [--model ID] [--yes]` does the following:
    - resolves `<run>` as a folder name under `review/playtest/` or a path
    - prints the items count, the model and `estimate(items, model)`
    - without `--yes`, exits 2 having made no call
    - with `--yes`, runs `askOne` 3 at a time and tallies `usage`
    - writes `review/playtest/<run>/review.html` with
      `renderReview(items, answers, intents, tally)`
  - `intents` is read from the room files' `beats[].intent` for the report alone.
  - The report shows, per room:
    - a table of beats × roles; each cell holds the screenshot thumbnail (or "screen dark"), the
      findings grouped by kind, and "would do next" beside "designed: <intent>"
    - a summary at the top: findings by kind and room, calls, tokens, cost, and errors
  - Add `"playtest:review": "node scripts/playtest-review.ts"` to `package.json`.
- **Files touched:** `scripts/playtest-review.ts`, `scripts/playtest/review/{cost,html}.ts`,
  `cost.test.ts`, `html.test.ts`, `package.json`.
- **Tests first (red).**
  - `cost.test.ts`:
    - `estimate` for room 01's 9 items on `claude-sonnet-5-5` uses overview §4.4's constants and
      matches a hand-computed figure within 1%
    - `tally` prices cache reads apart from input
    - an unknown model gives "unknown price" and still needs `--yes`
  - `html.test.ts`:
    - a blind cell says "screen dark" and has no `<img>`
    - the intent and the next line both appear
    - text is escaped
    - an errored item shows its error
  - A CLI test spawns `node scripts/playtest-review.ts <fixture-run> --room 01` without `--yes`, with
    `ANTHROPIC_BASE_URL` pointed at a closed port. It exits 2 and prints "estimated".
  - Break check: let the run start without `--yes` (red).
- **Acceptance criteria.** The tests are green, shown red first.
- **Depends on:** 129.

### Task 131: One reviewed room, the estimate set from it, and the docs

- **Description.**
  - With the user's go-ahead (quote the printed estimate for room 01, about $0.10; check
    `/comp4020:balance`):
    - run `pnpm playtest --room 01`, then `pnpm playtest:review <run> --room 01 --yes`, on a local
      build
    - record calls, tokens, cost and time in the commit message
    - set `cost.ts`'s token constants from the tally, and update overview §4.4 with the measured
      numbers (an edit in place)
  - Docs:
    - a "Playtests" section in `README.md`, placed before "The pantry, archived", with the other
      headings kept in order. It covers both commands and their flags, that neither is in
      `pnpm check`, what each finds and does not (comms gaps and fun stay with people), that the
      review spends the proxy budget (about $2 a heist) and needs `--yes`, that findings are leads,
      and that `PLAYTEST_AUTOPILOT` must never be set on Fly, where the server refuses to start
    - one paragraph in `spec/README.md` pointing at `scripts/playtest/` and its unit tests
    - the backlog line marked built
    - the phase's corrections logged in `PROCESS_LOG.md`
  - Ask the user to accept ADRs 0027 and 0028. On acceptance, change only their status line, in a
    commit of its own.
- **Files touched:** `scripts/playtest/review/cost.ts`, `cost.test.ts`,
  `plans/2026-11-07-playtests-00-overview.md`, `README.md`, `spec/README.md`, `specs/backlog.md`,
  `PROCESS_LOG.md`, the two ADRs (status only, on acceptance).
- **Tests first (red).**
  - Update `cost.test.ts` so that the estimate for room 01 is within 15% of the measured tally. It goes
    red against the old constants; that is the break check, named in the commit.
  - `spec/readme.test.ts` already guards the README headings. Run `pnpm check` with the app restarted
    on the new build.
- **Acceptance criteria.**
  - The measured review exists.
  - The estimate for room 01 is within 15% of the measured cost.
  - `pnpm check` is green.
  - `/readme/` shows the Playtests section.
- **Human review:**
  - **What:** room 01's `review.html`, and the README section.
  - **Pass:**
    - The findings read as real leads, things a first-time player might trip on, and not noise.
    - "Would do next" against "designed" is readable at a glance.
    - A reader new to the repo can run both commands and knows what each costs and finds.
  - **Who:** the user says so explicitly. The user then decides whether to run a full heist's review.
- **Depends on:** 130.

## 6. Phase Definition of Done

- [x] Tasks 129–131 complete, each committed with `pnpm check` green (129 and 130 in one commit)
- [x] `pnpm test:unit` passes
- [x] `pnpm check` passes against `pnpm start:check`
- [x] Task 131's human review accepted by the user; ADRs 0027 and 0028 accepted (2026-11-11)
- [ ] Tick phase 03 in overview §5, and tick the overview's §6 boxes that are now met, and commit (left open: Task 131's human review above is only queued; unticked by auto fixes 6, Task 264)

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR9, FR10, FR11 | Task 129 |
| FR12 | Task 130 |
| Cost estimate accuracy (overview §4.4) | Task 131 |
| Docs for FR1–FR12 | Task 131 |

## Build notes (overnight run)

- Tasks 129 to 131 built and ticked. Measured room 01 (6 calls, $0.0734); constants set from it
  (`cost.ts`, overview §4.4). Decisions are in `plans/2026-11-07-overnight.md` under pt03.

## 8. Risks / open questions

None.

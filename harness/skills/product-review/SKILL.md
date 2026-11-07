---
name: product-review
description: Reviews a repo as an experienced product manager would — writes the pitch and where the build falls short of it, five user personas and who it is really built for, what makes a new user give up in the first five minutes, a PRFAQ (launch press release plus twenty-plus customer/engineering/business questions), twenty features (plus the repo's unbuilt plans) scored by RICE with Kano types, a MoSCoW split against any deadline, and goals plus the one thing to build next. Saves the review to product/YYYY-MM-DD-<slug>.md and feeds its top ideas into the project's backlog. Never writes application code. Use whenever the user asks for a product review, a PM perspective, a PRFAQ, personas or users, RICE or feature prioritisation, "what should I build next", "what's missing", "where does this fall short", "what would make users give up", goals or metrics for the product, or runs /product-review (optionally with one lens: pitch, users, first-five, prfaq, rice, goals).
---

# Product Review

A product manager is "the person who decides what a team builds and why, and
checks that it works for customers and for the business" (COMP4020 Week 11).
This skill plays that role against the repo in front of it. Building is cheap
now; deciding what to build is not. This skill does the deciding, then hands
off to whatever the repo uses for building (`brainstorm-feature` if present).

**Hard rule:** no application code and no edits to application files. The
only things this skill writes are the review file under `product/` and,
after the challenge round, lines in the project's backlog.

**Ground every claim in evidence. No PM theatre.** Marty Cagan's warning is
that much PM work only *looks* like product management. Every finding cites
something real: a file and line, a spec, a playtest or reflection note, a
screenshot, or a step taken in the running app. Numbers you can't back up
(reach, personas' motives, impact) are labelled as **guesses**, and the
confidence score in RICE goes down to match. A review that could have been
written without reading the repo has failed.

See `examples.md` (next to this file) for the lecture's worked examples. They
set the bar for tone and specificity. The framework notes (Kano, MoSCoW,
value vs. effort, and when not to use a framework) draw on Atlassian's
"6 product prioritization frameworks and how to pick the right one".

## Arguments

- `/product-review`: run every lens in order (the full review).
- `/product-review <lens>`: run one lens only. The lenses are `pitch`, `users`,
  `first-five`, `prfaq`, `rice` and `goals`. If an earlier review exists in
  `product/`, read the latest one first and build on it (e.g. `rice` reuses its
  "built for" persona) rather than starting from nothing.

**Reruns revisit priorities.** Priorities go stale as the product and its
goals change. When an earlier review exists, keep its scoring basis (reach
period, effort unit) so scores stay comparable. Re-score its top items
against what has shipped since, and say what moved and why.

## Phase 1: Read the product (before asking anything)

Build a picture of what the product *is* and what it *claims to be*:

- `README.md`, `CLAUDE.md`, any `DESIGN.md`, the landing page and its copy.
- Specs, plans and ADRs (`specs/`, `plans/`, `doc/adr/` or equivalents),
  especially goals, non-goals and anything marked cut or deferred.
- **Sort the pipeline.** Label every spec and plan **shipped**, **in
  progress**, **planned** (written, not started) or **parked/cut**. Check
  each label against the code and `git log`, not the file's own checkboxes or
  status, because those go stale. Record the table in the review's
  "Pipeline" section. The rest of the review depends on it:
  - the pitch and the first five minutes judge **only what's shipped**,
    because that is what a user meets today
  - planned work is scored alongside new ideas in RICE
  - nothing already planned is proposed as new
- Evidence of real use: playtests, user notes, reflections, crit feedback,
  issues, logs. Note whether testing has been done with **real people or only
  bots/the author**. This is the most important validation gap to surface.
- The code, at the level of user-visible behaviour: routes and pages, the
  main actions a user can take, onboarding and help text, error states.
- Any earlier `product/` reviews, so you don't repeat findings already acted on.
- An existing backlog (see Phase 5) so you don't propose what's already parked.

Use an `Explore` agent for breadth on a large repo. Keep the conclusions, not
the file dumps.

## Phase 2: Intake (one round, at most four questions)

Ask only what the repo didn't answer, all in one message:

1. **Customer:** who do you think this is for? (Skip if the README or spec
   names one. You'll still test that claim in the Users lens.)
2. **Deadlines and constraints:** is there a deadline or milestone coming up,
   and roughly how much time is there? If the user gives one, use it in
   the Goals lens for a MoSCoW split of what fits before it. If not, stay general. Either way
   the user decides what to do. You only give advice.
3. **Known cuts:** anything already decided against or out of scope?
4. **Browser walk:** may I start the app and use it in a browser for the
   first-five-minutes lens? It's slower and costs more, but it's the only way
   to find things like "the cursor disappears until you find Esc". Say how
   you'd start it (from README/CLAUDE.md) so the user can confirm.

If the user wants to skip the intake, proceed on stated assumptions and list
them at the top of the review.

## Phase 3: Run the lenses

Run them in this order, because each feeds the next. Write each into the
review file as you go (use `template.md`), so a long run is never lost.

### 1. Pitch
> "Write a one-sentence description of this product. Then tell me where the
> current project falls short of it."

- Write the sentence the product *wants* to deserve. Make it ambitious but
  honest to the repo's own stated intent.
- Then take the sentence **word by word**. For each load-bearing word, say
  whether the build earns it, with evidence. In the lecture example, *cosy* →
  "the first minutes are crowded with keys and hunger". *co-op* → "true in
  the rules, but never tested with real groups".
- Include distribution/shareability if it matters (can people actually reach,
  embed or share it?).
- Judge the shipped build only. Where a planned item would close a gap, say
  so: "partly: fixed by `plans/<file>` if it ships".

### 2. Users
> "Describe five different people who might use this product. For each, say
> who they are, why they would use it, and give a quote from them about using
> it."

- Make the five genuinely different: core user, an adjacent use (e.g.
  education or work), a power user, a struggling newcomer, a critic or
  sceptic. Quotes should be specific to *this* product's features and
  frictions, not generic praise.
- End with **built for: <name>** and one line on why: which features only
  make sense for that person. This choice drives the rest of the review.
- If the evidence suggests the product is actually built for someone other
  than who the README says, say so.

### 3. First five minutes
> "What would make a new user give up in their first five minutes with this?"

- **With browser walk approved:** start the app as the repo documents, open it
  as a first-time user would (no prior knowledge, phone and desktop width if
  it's a web app), and try to reach the core experience. Use the
  `claude-in-chrome` skill or the repo's own `run` skill. Note every point of
  confusion, dead end, hidden control, jargon or wait. Screenshot the worst
  ones into `product/` and link them. Stop the app afterwards.
- **Without:** walk the code path a new user takes (landing → first action →
  core loop) and say clearly that the findings are inferred, not observed.
- Write each finding as a short label plus the concrete moment. The lecture
  style: "pointer lock: click to harvest, and the cursor disappears until you
  find Esc". Watch for debug-sounding labels on the best path, solo arrival
  in a multiplayer product, and help that nobody knows exists.
- Tag each finding with its **Kano** type. A missing or broken **basic**
  (something users take for granted, like being able to find the controls)
  is what makes people give up. A missing **delighter** isn't. Rank basics
  first.
- If a planned item already addresses a finding, name the plan.

### 4. PRFAQ
> "Read my project and write a PRFAQ for it: a one-page press release for
> launch day, then at least twenty questions customers, engineers and the
> business would ask, with answers."

- **Press release:** follow the template in `template.md` exactly. One page,
  written for the customer, no jargon. If it's dull to read, say so. The
  lecture's test is that a dull press release means the product may not be
  worth building as it stands.
- **FAQ:** at least twenty questions, labelled `customer`, `engineering` or
  `business`, with at least five of each. Answer them like the lecture's
  examples: concede what's true, give the plan, say what is **not** being done
  now and why, and propose a test with a stop condition where the answer is
  uncertain. Always include the hard ones: *Who is this for? What hasn't been
  validated? What was cut? What happens when it crashes or we deploy? Will it
  scale? How do you know it's correct?*

### 5. RICE
> "Review my project and list twenty possible new features across the UI,
> actions, art, elements, mechanics and user education. Score each with RICE
> and sort them by score."

- **Choose the framework out loud, in one line.** RICE is the default. It
  needs some basis for reach (usage logs, playtest counts, the size of a
  class or audience). If there's no basis at all, say so, and use the
  **value vs. effort** matrix instead (do first: high value, low effort;
  do second: high value, high effort; do last: low value, low effort;
  avoid: low value, high effort). Keep the same twenty items and columns
  otherwise. Don't use frameworks that need data the repo doesn't have,
  such as opportunity scoring without real satisfaction ratings, or cost of
  delay without revenue. Faking their inputs is theatre.
- Twenty **new** features, spread across those six areas (adapt the area
  names if the product isn't a game, e.g. UI, workflows, content,
  integrations, core logic, onboarding, but keep at least one per area).
  Draw them from the findings above: every first-five-minutes problem
  should map to a fix here, or to a plan that already covers it.
- **Plus every planned and in-progress item** from the pipeline, scored in
  the same table and marked `planned`. That puts the existing roadmap up
  against the alternatives. Say plainly if a queued plan scores below new
  ideas, or lands in "avoid", and suggest a reorder.
- **Fix the scoring basis before scoring.** RICE drifts when each row is
  judged differently. State the reach period, what counts as one person
  reached, and the effort unit once above the table. Score every row in one
  pass against that.
- Score = (Reach × Impact × Confidence) ÷ Effort.
  - **Reach:** people affected per period. State the period and the basis.
  - **Impact:** 3 huge, 2 high, 1 medium, 0.5 low, 0.25 minimal.
  - **Confidence:** 100% high, 80% medium, 50% low. Use 50% for anything
    resting on guesses.
  - **Effort:** use a unit that fits the project's size (weeks or days for a
    small team, person-months for a company). State it once at the top of
    the table.
- Add a **Kano** column: `basic` (expected, and missing it frustrates
  users), `performance` (more of it means more satisfaction) or `delighter`
  (unexpected, a reason to tell friends).
- Sort by score, highest first.
- **Then correct for RICE's bias.** It favours small, safe changes (in the
  lecture, dark mode beats a family tier). Use Kano to check the ranking in
  two ways:
  - **Basics go first, whatever their score.** A missing basic is a
    must-fix even when it scores low.
  - **Delighters are the usual buried bets.** They score low because
    confidence is low, yet they're often what the pitch promises. Name the
    ones that matter, and say whether each deserves a cheap test (a
    prototype, a five-person playtest) to raise its confidence instead.

### 6. Goals and one feature
> "If I can only add one more thing before the deadline, what should it be,
> and why?"

- **Goals:** one main metric that would show the product working for the
  "built for" persona (observable in this product, e.g. "groups that finish
  room 3", not "engagement"), plus two or three goals for the next milestone.
  For each, say how it would be measured with what the repo has, or what
  logging is missing.
- **One feature:** say it in one sentence first, then why: which pitch gap,
  persona and first-five-minutes finding it fixes, and its RICE row. Prefer
  the change that most closes the gap between the pitch and the build, not
  just the top RICE score. **It may be an existing plan.** Finishing or
  moving up a planned item often beats starting something new, so say so
  when it does.
- **If the user gave a deadline:** sort the RICE items, new and planned,
  with **MoSCoW** against the time left. Must-haves are the items the
  deadline fails without: basics and the one feature. Should-haves and
  could-haves follow. **Won't have (this time)** lists explicit cuts, each
  with a one-line reason. The Must and Should items together must fit the
  time left, with effort shown. Frame the whole split as a suggestion: the
  user decides. The won't-haves also answer the FAQ's "What was cut?".

## Phase 4: Challenge round

Present a short summary in the conversation, not the whole file:

- the pitch and its biggest shortfall
- **built for** and why
- the top three first-five-minutes problems
- the top five RICE items, plus any buried bet and any missing basic
- where the planned work ranks, and any suggested reorder
- the one feature (and the MoSCoW split, if there's a deadline)
- the guesses the review rests on most heavily

Then ask the user to push back: a persona that's wrong, a score that's off,
a cut you missed. Revise the file for anything they change. Their
corrections are the most valuable part of the review, so if the repo keeps a
process or decision log (`CLAUDE.md` will say), record any correction that
changed the outcome there, in that log's format.

Don't treat silence as agreement. If the user moves on without answering,
note "unchallenged" in the file's status line.

## Phase 5: Write to the backlog

After the challenge round, add the agreed top items to the project's backlog
**automatically**:

1. **Find the backlog.** Check whether `CLAUDE.md` or the README names one,
   then look for `specs/backlog.md`, `BACKLOG.md`, `docs/backlog.md` or
   `TODO.md`. Read its header and existing entries, and match its format
   exactly (e.g. `- YYYY-MM-DD — one line: the idea, and what prompted it`).
2. **Add the items:** the one feature, then the top RICE items (up to five).
   Skip anything already parked there, and anything that already has a
   spec or plan. If the review suggests reordering planned work, add one
   line saying so instead. Each line names the idea, its RICE score and
   Kano type, and "from product review `product/<file>`" as what prompted it.
   If there was a MoSCoW split, also park each **won't have** with its
   reason, so the cuts are recorded and not lost.
3. **No backlog?** Don't invent a process the repo doesn't have. Keep the
   items in the review's "Backlog" section and ask, in one line, whether to
   create `BACKLOG.md` with them. Also mention GitHub issues if the repo uses
   `gh`.

Finally, in one line, suggest the next step: run `brainstorm-feature` (or
the repo's equivalent) on the one feature.

## Output file

- Path: `product/YYYY-MM-DD-<slug>.md`. The slug is `review` for a full run,
  or the lens name for a single-lens run. Create `product/` if needed.
- Use `template.md`. Fill every section that was run, and delete sections for
  lenses that weren't.
- Don't commit unless the user asks. If they do, and the repo has a check
  command, run it first.

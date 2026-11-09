# Product review: <product name>

- **Date:** YYYY-MM-DD
- **Lenses run:** pitch, users, first-five, prfaq, rice, goals
- **Commit reviewed:** <short sha>
- **Browser walk:** observed / inferred from code
- **Deadline given:** <date and time left> / none
- **Status:** draft / challenged by user / unchallenged

## Assumptions and evidence

- Sources read: <files, playtests, notes>
- Validation so far: <real users / bots only / author only>
- Assumptions (unconfirmed): <list>

## Pipeline

Checked against the code and `git log`, not the files' own status.

| spec / plan | what it delivers | status | evidence |
| --- | --- | --- | --- |
| `plans/<file>` | | shipped / in progress / planned / parked | <commit, file, or "no code yet"> |

## 1. Pitch

> "<one-sentence description>"

| word | does the build earn it? | evidence |
| --- | --- | --- |
| *<word>* | <yes / partly / no: the concrete gap> | <file:line, note, screenshot> |

## 2. Users

| name | who they are | why they'd use it | quote |
| --- | --- | --- | --- |
| | | | "" |

**Built for:** <name>. <Which features only make sense for them.>

## 3. First five minutes

- **<label>** (basic / performance / delighter): <the concrete moment a newcomer gives up> (<evidence>; addressed by `plans/<file>` if so)

## 4. PRFAQ

### Press release

**<HEADLINE: product name> lets <customer> <do something they couldn't before>**

*<Subheading: one sentence on who it's for and what they get>*

<CITY>, <launch date>: <Summary: the product and its main benefit, in plain language>

<Problem: the problem, described as the customer would describe it>

<Solution: how the product solves it>

"<Quote from the team: why we built it and why now>," said <name, title>.

<Getting started: how to start using it, in one or two steps>

"<Quote from a user: a customer describing how it helped them>," said <customer name, city>.

<Call to action: where to get it, what it costs, when it's available>

### FAQ

| # | asked by | question |
| --- | --- | --- |
| 1 | customer | |

**1. <question>**
<answer: concede what's true → the plan → not now, and why → a test with a stop condition if uncertain>

## 5. RICE

**Framework:** RICE / value vs. effort, because <the data available>.

**Scoring basis:** reach = <what counts as one person reached>, per <period>, based on <source or "guess">. Effort unit: <weeks / days / person-months>. (Kept from <earlier review> if rerun.)

| # | feature | area | source | Kano | R | I | C | E | score |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | | | new / planned | basic / performance / delighter | | | | | |

**Missing basics:** <basics to fix first, whatever their score>

**Buried bets:** <delighters or other high-impact items the score undervalues, and a cheap test for each>

**Planned work:** <where the queued plans rank against the new ideas; any suggested reorder>

**Since last review:** <rerun only: what moved and why>

## 6. Goals and one feature

**Main metric:** <observable, specific to the built-for persona; how it's measured>

**Goals:**
1. <goal>: measured by <…>

**One feature:** <one sentence.>
<Why: the pitch gap, persona and first-five-minutes finding it fixes; its RICE row.>

**MoSCoW before <deadline>:** (only if a deadline was given; a suggestion, the user decides)

| | item | effort | why |
| --- | --- | --- | --- |
| Must | | | |
| Should | | | |
| Could | | | |
| Won't (this time) | | — | <reason it's cut> |

Must and Should total: <effort> of <time left>.

## Challenge round

- <what the user disputed, and what changed>

## Backlog

- <lines added to <backlog path>, or proposed if the repo has none>

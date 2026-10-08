# 6. An offer's pickup note reaches the offering and claiming households only

## Status

superseded by 0007. (Supersedes 0004.)

## Context

ADR 0004 chose Server-Sent Events for live updates and said "Pickup notes are
only ever sent on the claiming household's stream". Reviewing the offering flow
(Task 20, `42655e7`) showed that rule was too tight. A pickup note describes
one item, so an offerer must be able to see and edit the note on each of their
own offers, and the offering household's own pages and streams therefore have to
carry it. The privacy promise that matters is unchanged: no neighbour who isn't
the claimer reads it, and nothing public does.

I weighed keeping 0004's rule and showing the offerer only a placeholder with an
"edit" box that starts empty. That would make editing a note a blind overwrite,
and it protects nothing: the offerer wrote the note.

## Decision

Everything in 0004 stands except its pickup-note sentence, restated here:

- Writes are normal HTTP requests that return the saved result.
- Each open page holds one Server-Sent Events stream, scoped to its household
  and the household's communities.
- After a write commits, the server publishes the change in-process to the
  streams that should see it.
- The client applies its own changes immediately and rolls back with a Retry if
  the write fails. There is no offline queue.
- On reconnect, the client fetches a fresh snapshot instead of replaying missed
  events.
- **A pickup note is sent only to the offering household (its own `offer.mine`,
  `/api/offers` and `/api/pantry`) and to the claiming household (`offer.claim`
  and the claim response).** It never appears on a community channel or in a
  third household's responses, pages or frames. Member names are sent only on
  household streams.

## Consequences

- One long-lived HTTP response per tab is cheap, works through Fly's proxy, and
  the browser reconnects on its own. In-process fan-out still depends on one
  machine.
- `spec/privacy.test.ts` checks both sides: the offerer and claimer see the
  note, and a third household with an open stream never does.
- Offer payloads are built only by `offerEvents`, so the rule lives in one place
  and a new event can't leak a note by accident.
- A future feature that shows a note somewhere new (a photo caption, an export)
  needs a record of its own.

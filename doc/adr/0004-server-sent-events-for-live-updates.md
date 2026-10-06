# 4. Server-Sent Events carry every change to open sessions

## Status

accepted

## Context

The brief requires that a change appears in every other open session showing
it within about a second, with no reload. In this app that means housemates
seeing estimates and outcomes change, and neighbours seeing offers appear and
get taken. All writes are ordinary user actions (tap Used, Claim, drag the
slider), so the browser never needs to stream data *to* the server. There is
one machine, and the app is one Node process (ADR 0001). Markers also test a
slow connection and resuming the next day, and pickup notes must reach only
the claiming household.

I weighed:

- **WebSockets**: two-way, which nothing here needs, and they mean running a
  socket server beside Astro's request handling.
- **Polling fast enough**: the simplest option, but hitting ~1 s means a
  request per second per open tab, mostly returning nothing, on a 256 MB
  machine that also auto-stops when idle.

## Decision

- Writes are normal HTTP requests that return the saved result.
- Each open page holds one **Server-Sent Events** stream, scoped to its
  household and the household's communities.
- After a write commits, the server publishes the change in-process to the
  streams that should see it. Pickup notes are only ever sent on the claiming
  household's stream; member names only on household streams.
- The client applies its own changes immediately and rolls back with a Retry
  if the write fails. There is no offline queue.
- On reconnect, the client fetches a fresh snapshot instead of replaying
  missed events.

## Consequences

- One long-lived HTTP response per tab is cheap, works through Fly's proxy,
  and the browser reconnects on its own.
- In-process fan-out only works because there is one machine; a second
  machine would need a shared pub/sub.
- Scoping streams per household and community makes privacy rules testable:
  a second browser context can assert what it never receives.
- An open stream keeps the machine awake while someone has the app open,
  which is fine for this scale.
- Snapshot-on-reconnect is simpler than event replay, but a reconnect costs a
  full fetch of the pantry and offers.

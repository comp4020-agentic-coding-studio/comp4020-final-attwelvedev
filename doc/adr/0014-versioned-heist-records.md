# 14. Heist records carry a heist version

## Status

accepted

## Context

ADR 0009 persists heist records only. The overhaul replaces the three rooms
with four new ones, so old and new times aren't comparable. Rotating crews
also mean a full heist can involve more than three people.

I weighed wiping the board (loses the few real records) and keeping one board
(meaningless ranks).

## Decision

Every record carries a heist version. The leaderboard shows the current
version; the v1 board stays reachable by a link. Full-heist records name
everyone who played any room; per-room records name the three who played it.
Nothing is deleted.

## Consequences

- One schema migration on `/data`; existing rows become version 1.
- A later room change bumps the version deliberately rather than silently.

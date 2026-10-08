# 3. Everything persists in SQLite and photo files on /data

## Status

superseded by 0009

## Context

Only `/data` survives a restart or redeploy, and the course setup has no
separate database server. The app stores households, members and device
tokens, items with their estimates, a used/binned/given history, communities,
offers and claims, and optional item photos. Claims are first-come, so taking
an offer has to be atomic. Privacy is part of my definition of good: a
user's location must never reach the server, and member names never leave the
household.

I weighed JSON files on the volume (no transactions, so two simultaneous
claims could both succeed) and storing photos as blobs in SQLite (bloats the
database and its backups for data that is deleted often).

## Decision

- One SQLite database file on `/data`, opened by the single app process, in
  WAL mode.
- Photos are files on `/data`, two sizes per photo (480px and a 96px
  thumbnail), already shrunk and stripped of EXIF/GPS in the browser before
  upload.
- **Kept forever:** the household's history rows (item name, outcome, who,
  when). History is text-only.
- **Deleted:** a photo when its item leaves the pantry; a household's items,
  photos and offers when its last member leaves; a member's device tokens on
  removal.
- **Never stored:** a user's location (community areas, drawn by their
  creators, are the only coordinates), photo metadata.
- Claims, collection and withdrawal run in transactions.

## Consequences

- One file holds the whole app's state, so backing it up is copying a file.
- A single writer process is fine for one machine but rules out scaling
  horizontally without a rethink.
- About 34 KB per photo; the 1 GB volume holds roughly 30,000 photos before
  space matters.
- Deleting photos with their items keeps storage bounded but means history
  can't show what something looked like.
- The privacy claims ("location never stored", "no EXIF") can be checked in
  `spec/` against real requests and files.

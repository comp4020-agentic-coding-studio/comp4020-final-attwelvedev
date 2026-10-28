# Overnight run decisions (auto/escape-room)

- 02/10: the plan's phase DoD wants the WIP branch merged into `play-overhaul`; merging is off-limits overnight → marked deferred, because the run works only on `auto/escape-room`. Reversible by merging in the morning.
- 02/10: the label cap's chip-spacing was already on the branch; only the cap and its spec change were added → kept the existing placement, because the plan says "already on the branch". Reversible by editing `LABEL_CAP` in `src/client/labels.ts`.
- 03/review: the tree held a partial Task 11 (format.ts: `t` card, `Y` order) from an earlier session → kept it and built on it, because it matched overview §4.5. Reversible by reverting the Task 11 commit.
- 03/11: how a station is marked as a vault wing that reveals a symbol (the plan names `reveal` only as a view field) → a station key `"reveal": true`, drawn from `rng(seed*1000 + attempt + 500 + i)` on solve, because the vault's `from` alone can't say which wing reveals. Reversible by renaming the key in `stations.ts: revealOn`.
- 03/11: what "a smaller answer" means for a teaching station in the sim → a teaching safe draws one digit and a teaching music box two notes; wires/keypad/switches teaching size is left to the room's own params (three wires, `length: 3`, a 2x3 grid), because those are already set per room. Reversible by adding cases in `drawAnswer`.
- 03/11: digit to key mapping for a radio feeding a keypad slot → digit d is key d (index d-1), matching the keys' drawn 1-based numbers. Reversible in `stations.ts: fixFeeds`.
- 03/11: the order clue `Y` had no defined view shape → an `order` entity carrying `motifs` (the wings' motifs in socket order), sighted only, because overview §4.5 says "a clue in the vault gives their order" and links are by motif. Reversible by changing `perception.ts` and `drawOrder`.
- 03/11: a sign with `text` and no plates was drawn as an empty sequence sign → it draws only as a plaque on the wall (`drawPlaque`). Reversible in `blocks.ts: drawFlat`.
- 03/11: no `Human review:` line on Task 11, but it is visual → screenshots taken and queued anyway, committed without the pending marker. Reversible: n/a.

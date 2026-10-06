# Shared pantry — Phase 03: Communities and offers

- **Date:** 2026-10-06
- **Status:** Outline. Before executing, re-run `plan-feature` Phases 2–4 on
  this file (overview §0).
- **Requirements confirmed by user:** yes — 2026-10-06
- **Part of:** `plans/2026-10-06-shared-pantry-00-overview.md`. It leans on
  §3 and §4.
- **Depends on phases:** 02 (live hub, JSON endpoints, island patterns).

## 1. Summary

Households join communities by link or code, offer pantry items to them with
one tap, and neighbours claim, collect or release offers live. This phase is
the week 10 crit's real-time story: the pod uses it together.

## 2. Requirements (this phase)

### 2.1 Functional

| FR | Part implemented here |
| --- | --- |
| FR22 | Name, creator role, succession. The map circle is Task 17 |
| FR24 | Link and code. Listed discovery is Task 17 |
| FR25, FR26–FR31, FR33 | In full. FR26's "offer some" value reduction lands with measure types in Task 13; until then "offer some" is hidden |
| FR9 | Offers withdrawn when a household is deleted |
| FR32 | Excluding the past-estimate display, which is Task 14 |
| FR18 | Hook only: an offer refers to its item, so a later photo shows automatically |

### 2.2 Non-functional

| NFR | Part implemented here |
| --- | --- |
| NFR-Privacy | Pickup note only on the claiming household's channel and responses; no member names in any community payload. **Enforced in `spec/`** |
| NFR-Effortless | Offer, Claim, Collected and Release are one tap; the first offer opens the note sheet |

### 2.3 Out of scope for this phase

| Deferred | Phase |
| --- | --- |
| Map, area and listed discovery | 06 |
| Offer photos | 05 |
| Visual polish beyond the tokens | 05 |

### 2.4 Assumptions

See overview §2.4.

## 3. Existing code context

To be verified at phase start.

### Interfaces from earlier phases (exact)

Overview §4.2, plus these from phase 02, to be copied verbatim from Tasks 5–6
at phase start:
- `subscribe(channel: string, send: (e: LiveEvent) => void): () => void`
- `publish(channel: string, e: LiveEvent): void`
- The `LiveEvent` union
- `GET /events` channel resolution (extend it with `community:<id>`)
- The JSON variants of the endpoints

## 4. Approach

**Schema:**

| Table | Columns |
| --- | --- |
| `communities` | `id`, `name`, `join_code` (unique), `link_token_hash`, `creator_household_id`, `created_at`, plus nullable `centre_lat`, `centre_lng`, `radius_m` for Task 17 |
| `community_households` | `community_id`, `household_id`, `joined_at`, `display_name` (household name + suffix when clashing) |
| `offers` | `id`, `item_id`, `household_id`, `quantity_note` (null = whole), `status` (`offered`, `claimed`, `collected`, `withdrawn`), `claimed_by_household_id`, `claimed_at`, `created_at` |
| `offer_targets` | `offer_id`, `community_id` |

`households` gains `default_pickup_note`.

**Rules:**
- **Claim** runs in a transaction:
  `UPDATE offers SET status='claimed' … WHERE id=? AND status='offered' AND household_id<>?`.
  Zero rows updated → 409 "Someone claimed this first".
- **Release** sets status back to `offered`.
- **Withdraw** sets status `withdrawn`.
- **Collected** (either side) sets status `collected`, soft-removes the item
  and writes a history row with outcome `given` (FR28).
- **Auto-withdraw:** `recordOutcome` (Task 3) withdraws open offers for the
  item.
- **Leaving a community** withdraws that household's offers there and
  releases its claims there.
- **Creator succession** goes to the earliest `joined_at`.
- **Payload scoping:**
  - `offer.*` events publish to `community:<id>` without the pickup note.
  - The note goes only in the claim response and on the claiming household's
    `household:<id>` channel.
  - The offerer's household channel gets `claimedBy` as the household
    display name.

## 5. Task breakdown

### Task 8: Communities: create by name, join by link or code, leave, remove households, succession

- **Files:**
  - `src/lib/communities.ts` (new)
  - schema + migration
  - `src/pages/communities/*`
  - `spec/communities.test.ts`
- **Tests to write first:**
  - Unit: name suffixing for clashes; succession; leave/remove effects.
  - Spec:
    - Create → join by code from a second household → both listed.
    - The creator removes a household.
    - The creator household leaves → the next household becomes creator.
    - A household can be in two communities.
- **Acceptance:** tests green.
- **Depends on:** Task 7.

### Task 9: Offers and claims domain: offer, claim race, collect as given, release, withdraw, scoped payloads

- **Files:**
  - `src/lib/offers.ts` (new)
  - schema + migration
  - `src/lib/items.ts` (auto-withdraw in `recordOutcome`)
  - endpoints under `src/pages/offers/*`
  - `spec/offers.test.ts`
  - `spec/privacy.test.ts`
- **Tests to write first:**
  - **Claim race:** `Promise.all` of two claims from different households →
    exactly one 200 and one 409.
  - **No self-claim:** claiming your own offer → 403.
  - **Collected:** the item leaves the pantry and history shows "given".
  - **Release:** the offer returns to `offered`.
  - **Auto-withdraw:** Used on an offered item withdraws its offer.
  - **Leaving a community:** withdraws the household's offers and releases
    its claims there.
  - **Pickup note scoping (privacy):** the pickup note never appears in:
    - any community listing response
    - any non-claimer's stream payload
  - **Member names (privacy):** no member name appears in any community
    payload.
- **Acceptance:** tests green; the privacy assertions are named after the
  README claims they enforce.
- **Depends on:** Task 8.

### Task 10: Offers UI: feed island, first-offer sheet, Your offers, desktop rail, live arrivals

- **Files:**
  - `src/components/OffersFeed.tsx`, `OfferSheet.tsx`, `OfferRow.tsx`
  - `src/pages/offers.astro`
  - desktop rail in `index.astro`
  - `spec/layout/offers.test.ts`
- **Tests to write first** (browser, two or three contexts):
  - An offer appears in the neighbour's feed within 1 s.
  - Claim in B → C sees "Taken" within 1 s.
  - The offerer sees "Claimed by <household>".
  - The first offer shows the note sheet; the second offer posts in one tap
    with "Undo · Edit note".
  - The "new offer" pill appears when scrolled.
- **Acceptance:** green at PHONE and DESKTOP; axe clean.
- **Human review:** the user and a pod-mate try offer → claim → collect on
  two phones. **Pass:** it's understandable without explanation and the
  handover info is clear.
- **Depends on:** Task 9.

## 6. Phase Definition of Done

- [ ] Tasks 8–10 complete, each committed with `pnpm check` green
- [ ] Deployed before the week 10 crit, with a multi-browser flow verified on
      fly.dev
- [ ] Task 10 human review accepted
- [ ] Tick phase 03 in overview §5

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR22 (name, roles), FR24 (link/code), FR25 | Task 8 |
| FR26–FR31, FR32 (rules), FR33, FR9 (offers part), NFR-Privacy (offers) | Task 9 |
| FR26/FR27/FR31 UI, FR35 (communities) | Task 10 |

## 8. Risks / open questions

None. Refine at phase start.

# Shared pantry — Phase 06: Discovery, passkeys and polish

- **Date:** 2026-10-06
- **Status:** Outline. Before executing, re-run `plan-feature` Phases 2–4 on
  this file (overview §0).
- **Requirements confirmed by user:** yes — 2026-10-06
- **Part of:** `plans/2026-10-06-shared-pantry-00-overview.md`. It leans on
  §3 and §4. The design source is spec §4.1, for the Find a community screen.
- **Depends on phases:** 03 (communities) and 05 (visual system). Task 18
  (passkeys) needs only Task 5, so it can run early (overview §5.1).

## 1. Summary

The last phase adds four things:
- Communities gain a map area drawn at creation.
- Households can discover listed communities nearest-first. Their location
  is used only in the browser.
- Members can optionally register a passkey.
- A final accessibility and viewport pass across every screen.

The submission deadline is noon on 9 Nov 2026.

## 2. Requirements (this phase)

### 2.1 Functional

| FR | Part implemented here |
| --- | --- |
| FR6 | In full |
| FR22 | Area circle |
| FR23 | In full |
| FR24 | Listed instant join |

### 2.2 Non-functional

| NFR | Part implemented here |
| --- | --- |
| NFR-Privacy | No location in any request. **Enforced in `spec/`** |
| NFR-Resources | Leaflet loaded only on request |
| NFR-A11y, NFR-Viewports | Full pass |

### 2.3 Out of scope for this phase

Everything in spec §2.3.

### 2.4 Assumptions

- See overview §2.4.
- The OSM tile usage policy is acceptable at this scale: tiles are requested
  directly from the browser, and a `User-Agent` and credit are shown.
- The new dependencies need one-line reasons:
  - `leaflet`, client-only and lazy-loaded
  - `@simplewebauthn/server` and `@simplewebauthn/browser`

## 3. Existing code context

To be verified at phase start.

### Interfaces from earlier phases (exact)

Overview §4.2, plus the `communities.ts` signatures from Task 8 and the
nullable `centre_lat`, `centre_lng` and `radius_m` columns. Copy them
verbatim at phase start.

## 4. Approach

- **Listing endpoint:**
  - `GET /api/communities` returns every listed community: name, centre,
    radius and household count.
  - The browser computes distances with haversine and sorts locally.
  - **No request ever carries the user's coordinates.**
  - Creation sends only the community's own circle, which its creator chose.
- **Map:** `CommunityMap.tsx` is lazy-imported on "Show map". The list stays
  the primary, keyboard-accessible view.
- **Passkeys:**
  - Registration and login are at `/passkey/*`.
  - The credential public key is stored in `passkeys`
    (`member_id`, `credential_id`, `public_key`, `counter`).
  - A successful login issues a new device token.

## 5. Task breakdown

### Task 17: Community areas and nearest-first discovery with an optional lazy map

- **Files:**
  - `src/lib/communities.ts`
  - `src/pages/api/communities.ts`
  - `src/pages/communities/find.astro`
  - `src/components/CommunityList.tsx`, `CommunityMap.tsx`,
    `CommunityCreate.tsx`
  - `spec/discovery.test.ts`, `spec/layout/discovery.test.ts`
- **Tests to write first:**
  - The listing response sorted client-side by a mocked geolocation puts the
    nearest first.
  - Without geolocation, the list is sorted A–Z.
  - Name search filters the list.
  - **No location in requests:** a browser test with geolocation granted
    records every request body, URL and header and asserts that the mocked
    coordinates never appear.
  - Leaflet is not requested until "Show map" is pressed.
  - Joining is one tap, with Undo.
- **Human review:** the user creates a community by drawing a circle on a
  phone. **Pass:** it's usable with a thumb.
- **Depends on:** Task 16.

### Task 18: Optional passkey sign-in

- **Files:** `src/lib/passkeys.ts`, `src/pages/passkey/*`, a household
  settings entry, `spec/layout/passkeys.test.ts`.
- **Tests to write first** (Chrome DevTools Protocol virtual authenticator):
  - Register, clear cookies, sign in with the passkey → same member.
  - An unknown credential is rejected.
- **Acceptance:** tests green; the database stores only the public key.
- **Depends on:** Task 5.

### Task 19: Accessibility and viewport pass across every screen

- **Files:** fixes across `src/` as found; `spec/layout/a11y.test.ts`.
- **Tests to write first:**
  - Axe is clean at PHONE and DESKTOP on every route.
  - A keyboard-only script covers the whole demo flow from spec §4 (first
    run → add → adjust → Used → offer → claim, in two contexts).
  - A mid-use resize keeps state and doesn't overflow.
- **Human review:** the user does the markers' ten-minute pass: two sessions,
  both viewports, keyboard only, and coming back the next day. **Pass:** no
  dead ends.
- **Depends on:** Tasks 17 and 18.

## 6. Phase Definition of Done

- [ ] Tasks 17–19 complete, each committed with `pnpm check` green
- [ ] Deployed; the overview §6 feature-level Definition of Done is met
- [ ] All human reviews accepted
- [ ] Tick phase 06 in overview §5

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR22 (area), FR23, FR24 (listed), NFR-Privacy (location), NFR-Resources (map) | Task 17 |
| FR6 | Task 18 |
| NFR-A11y, NFR-Viewports (full) | Task 19 |

## 8. Risks / open questions

None. Refine at phase start.

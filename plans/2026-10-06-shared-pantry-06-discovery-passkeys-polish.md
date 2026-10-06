# Shared pantry — Phase 06: Discovery, passkeys and polish

- **Date:** 2026-10-06
- **Status:** Task 18 is **Approved** (re-planned in full against the code at
  `364c91e` on 2026-10-07). Tasks 17 and 19 are still an **Outline**: before
  executing either, re-run `plan-feature` Phases 2–4 on it (overview §0).
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
  - `@simplewebauthn/server` and `@simplewebauthn/browser`: reasons and the
    memory check are in Task 18

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

- [ ] Done

- **Tier:** Slice, with an ADR (a new dependency pair that shapes identity).
- **Description:** A signed-in member can register a passkey from the
  household page. Later, on any device with no session, they choose "Sign in
  with a passkey" on the first-run or join page, pick the passkey, and are
  signed in as the same member with a **new device token** (the same cookie as
  every other sign-in). Credentials are **discoverable** (`residentKey:
  required`, user handle = the member id), so sign-in asks for no username and
  the page never learns who is signing in before the browser answers. The
  database stores only the credential id, public key, counter and transports.
  A member can list and remove their own passkeys.
- **Existing code this builds on (verified at `364c91e`):**
  - `src/middleware.ts` resolves the `pantry_device` cookie to
    `locals.session`; `src/lib/session.ts` has `DEVICE_COOKIE`,
    `newDeviceToken`, `hashToken`; `src/lib/cookie.ts` has
    `deviceCookieOptions(url, forwardedProto)`.
  - `device_tokens(token_hash, member_id → members cascade, created_at,
    last_seen_at)` is in `schema.ts`. `insertDeviceToken` is **private** to
    `households.ts`; `src/pages/device/[token]/accept.ts` is the pattern for a
    sign-in endpoint (409 when already signed in, set the cookie, 303 `/`).
  - `joinThrottle`, `throttleKey(headers, clientAddress)` and
    `failureThrottle` are in `src/lib/throttle.ts`.
  - The first-run form is the signed-out branch of `src/pages/index.astro`;
    the join page is `src/pages/join/index.astro`.
  - The browser specs drive system Chrome through Playwright
    (`spec/browser.ts`: `launch`, `openPage`, `PHONE`, `DESKTOP`,
    `axeViolations`, `horizontalOverflow`); `spec/people.ts` has
    `startHousehold`. Chrome's WebAuthn virtual authenticator is reached with
    `context.newCDPSession(page)` and `WebAuthn.enable` /
    `WebAuthn.addVirtualAuthenticator`.
- **Dependencies (reasons, per CLAUDE.md):**
  - `@simplewebauthn/server` 14 (about 0.8 MB unpacked, 10 small transitive
    dependencies, Node ≥ 20): attestation and assertion verification is CBOR,
    COSE and signature code that is easy to get subtly wrong by hand.
  - `@simplewebauthn/browser` 14 (0.3 MB, no dependencies): the base64url and
    `navigator.credentials` wrapping, bundled only into the passkey pages'
    scripts.
  - **Memory:** the server package is `await import()`ed inside the passkey
    handlers only, so a process that never sees a passkey request never loads
    it. The task measures RSS (below) because the machine has 256 MB.
  - **ADR 0005** "Passkeys by SimpleWebAuthn, discoverable credentials" is
    written in this task (status `proposed`, accepted by the user at review).
    It records: why not a hand-rolled verifier; why discoverable credentials
    (no username step, nothing identifying leaves the database); that a passkey
    mints a device token rather than becoming a second kind of session, so
    middleware and every endpoint are unchanged; the lazy import and the
    measured memory. ADR 0002 stays as it is (it already says "later, a
    passkey").
- **Design:**
  - **Table** `passkeys`: `credential_id` text pk (base64url) · `member_id` →
    members (cascade, so removing a member or deleting a household drops them)
    · `public_key` blob · `counter` integer · `transports` text (JSON array or
    null) · `created_at` · `last_used_at`. Migration is generated by
    `pnpm db:generate` **after** phase 03 (0003, 0004) is merged; it takes the
    next free number at that moment (see Ordering).
  - **Relying party:** `rpID = context.url.hostname`, `origin =
    context.url.origin`, name "Shared pantry". Behind Fly, Astro already trusts
    `x-forwarded-proto` through `security.allowedDomains`, so `url.origin` is
    `https://…fly.dev` in production and `http://localhost:8080` locally
    (WebAuthn treats localhost as a secure context).
  - **Challenges:** an in-memory map with a 5-minute TTL
    (`src/lib/passkeys.ts`), single-use, keyed by a random id carried in a
    short-lived `httpOnly` `pantry_passkey` cookie (`SameSite=Lax`, `Max-Age`
    300). One Fly machine, so memory is enough; a restart only costs the person
    a retry.
  - **Endpoints** (all JSON; `Accept` is not needed):
    | Method and path | Needs | Success | Failure |
    | --- | --- | --- | --- |
    | `POST /passkey/register/options` | session | 200 options | 401 |
    | `POST /passkey/register/verify` | session | 201 `{ id }` | 400 verification failed · 401 |
    | `POST /passkey/signin/options` | no session | 200 options (empty `allowCredentials`) | 409 already signed in |
    | `POST /passkey/signin/verify` | no session | 200 `{ ok: true }` and the device cookie | 400 unknown credential or bad assertion · 409 already signed in · 429 throttled |
    | `POST /passkey/:id/remove` | session | 303 `/household` (JSON 200) | 404 not this member's |
    Failed sign-ins count toward a new `passkeyThrottle` (10 per 60 s per
    `throttleKey`), the same shape as `joinThrottle`. An unknown credential id
    and a bad signature give the **same** 400 message, so the endpoint
    reveals nothing about which credentials exist.
  - **Device token on sign-in:** `passkeys.ts` inserts the `device_tokens` row
    itself with `newDeviceToken` and `hashToken` (four lines). It does **not**
    edit `households.ts`; tidying that duplicate into one exported helper is a
    follow-up for after phase 03 lands, not part of this task.
  - **Counter:** synced passkeys report 0 forever, so a stored 0 with a new 0
    is accepted; a non-zero counter that goes backwards is rejected (the
    library's rule). `counter` and `last_used_at` update on each sign-in.
  - **Pages:** `src/pages/passkey/signin.astro` (new; one button, a
    `role="status"` region for errors, a link back to `/`; the script imports
    `@simplewebauthn/browser` and posts the two steps). `src/components/
    PasskeyRegister.astro` (new; the "Add a passkey" button, its status
    region, and the list of this member's passkeys with a Remove form). With
    scripts off, both explain that a passkey needs scripts and the device
    cookie flow still works. If `PublicKeyCredential` is undefined the button
    is replaced by "This browser can't use passkeys."
  - **Integration points (the only edits to files phase 03 also edits),** done
    last in the task, after rebasing on phase 03:
    1. `src/pages/index.astro`, signed-out branch: one sentence under the
       existing "Joining someone's household?" paragraph — "Been here before?
       <a href="/passkey/signin">Sign in with a passkey</a>."
    2. `src/pages/household/index.astro`: one section rendering
       `<PasskeyRegister />`, replacing the spec §4.1 wireframe's "Passkey
       sign-in: coming later" line.
    Nothing else in `src/` that phase 03 touches is edited by this task.
- **Files:**
  - New: `doc/adr/0005-passkeys-simplewebauthn.md`, `src/lib/passkeys.ts` +
    `passkeys.test.ts`, `src/pages/passkey/signin.astro`,
    `src/pages/passkey/register/options.ts`, `register/verify.ts`,
    `signin/options.ts`, `signin/verify.ts`, `[id]/remove.ts`,
    `src/components/PasskeyRegister.astro`, `spec/passkeys.test.ts`,
    `spec/layout/passkeys.test.ts`.
  - Edited: `package.json` and `pnpm-lock.yaml` (the two dependencies),
    `src/lib/schema.ts` (the `passkeys` table, appended at the end of the file),
    `drizzle/000N_*` and `drizzle/meta/*` (generated), `src/lib/throttle.ts`
    (`passkeyThrottle`), `src/pages/index.astro`, `src/pages/household/index.astro`.
  - `src/lib/passkeys.ts` exports:
    ```ts
    export interface PasskeyRow { id: string; createdAt: number; lastUsedAt: number | null }
    export function registrationOptions(db: Db, session: Session, rp: Rp): Promise<{ challengeId: string; options: unknown }>;
    export function verifyRegistration(db: Db, session: Session, rp: Rp, challengeId: string, response: unknown, now?: number): Promise<PasskeyRow>;
    export function signinOptions(rp: Rp): Promise<{ challengeId: string; options: unknown }>;
    export function verifySignin(db: Db, rp: Rp, challengeId: string, response: unknown, now?: number): Promise<Session & { deviceToken: string }>;
    export function listPasskeys(db: Db, memberId: string): PasskeyRow[];
    export function removePasskey(db: Db, session: Session, credentialId: string): void;   // NotFoundError if not this member's
    export function takeChallenge(challengeId: string, now?: number): ChallengeEntry | null;   // single use, 5-minute TTL
    export interface Rp { id: string; origin: string; name: string }
    ```
    Errors are `NotFoundError` / `ValidationError` from `errors.ts`; the
    endpoints map them to 404 and 400 and never echo library messages.
- **Tests to write first (red):**
  - Unit `passkeys.test.ts` (in-memory db; no browser): `takeChallenge` is
    single use and gone after 5 minutes (inject `now`); `listPasskeys` shows
    only that member's; `removePasskey` of another member's credential is
    `NotFoundError`; deleting a member (via `removeMember`) deletes their
    passkeys (a plain cascade check); `verifySignin` with an unknown
    credential id and with a wrong challenge id both throw the same
    `ValidationError` message.
  - Spec `spec/passkeys.test.ts` (HTTP, own `fly-client-ip` per client):
    every passkey endpoint without a session (where one is needed) is 401;
    `signin/options` returns 200 with no `allowCredentials` entries and no
    member or household name; `signin/verify` with garbage returns 400 and the
    same body as for an unknown credential; ten failures from one address
    return 429 with `Retry-After`; signing in while already signed in is 409;
    `register/verify` with a replayed or missing challenge is 400.
  - Browser `spec/layout/passkeys.test.ts` (system Chrome, CDP virtual
    authenticator: `protocol: ctap2`, `transport: internal`,
    `hasResidentKey`, `hasUserVerification`, `isUserVerified`,
    `automaticPresenceSimulation`; a 30 s timeout per case):
    - **Register, clear cookies, sign in → same member:** Sam starts a
      household, adds an item, registers a passkey from the household page (the
      list shows one), the context's cookies are cleared, `/` shows the first-run
      form, "Sign in with a passkey" leads to the signed-in pantry with the same
      household name and item, and Sam is still the only member (no new member
      row; `/household` lists the same names).
    - **Unknown credential is rejected:** after Sam registers, the authenticator
      is cleared (`WebAuthn.clearCredentials`) and sign-in shows an error in the
      `role=status` region, sets no cookie and leaves `/` on the first-run form;
      a second authenticator holding a credential for a **removed** passkey
      is rejected the same way.
    - **Remove:** removing the passkey from the household page lists none, and
      the earlier credential no longer signs in.
    - **A new session is a new token:** signing in twice from two contexts
      gives two working sessions; the first stays signed in.
    - **No WebAuthn:** with `PublicKeyCredential` deleted by an init script,
      the household page says "This browser can't use passkeys." and shows no
      button; no console error.
    - **Layout:** `/passkey/signin` and `/household` with a passkey listed have
      no horizontal overflow and `axeViolations` is empty at PHONE and DESKTOP.
- **Implementation (green):** `passkeys.ts` first against the unit tests,
  using `generateRegistrationOptions` / `verifyRegistrationResponse` and
  `generateAuthenticationOptions` / `verifyAuthenticationResponse` from the
  lazily imported server package; `userHandle` is the member id as bytes, and
  `verifySignin` loads the member and household from the credential's
  `member_id` (the assertion's `userHandle` must equal it). Then the endpoints,
  the throttle, the pages, and last the two integration edits.
- **Refactor:** none.
- **Verify beyond the tests:**
  - Record RSS of the built server (`pnpm build && pnpm start`, then
    `ps -o rss=`) at idle before any passkey request and after one register and
    one sign-in; write both numbers in the ADR. Raise it with the user if idle
    RSS changes or if the figure after use is over 150 MB, since Fly has 256 MB.
  - Run the browser spec at least once against the **deployed** app
    (`APP_URL=https://comp4020-final-attwelvedev.fly.dev pnpm exec vitest run
    --project spec spec/layout/passkeys.test.ts`), because the RP ID and origin
    behind Fly's proxy cannot be proven locally.
- **Acceptance:** all of the above green; `pnpm check` green; the `passkeys`
  migration is committed; `grep -r private_key src drizzle` finds nothing and
  the table has no column that holds a secret; ADR 0005 exists as `proposed`
  with both RSS figures.
- **Human review:** none. Passkey UI is a button and a list; the render checks
  are in the spec. The user accepts ADR 0005 when they first read it.
- **Ordering and merge risk (read before starting):**
  - **Start after phase 03 (Tasks 8–10, 20) is committed.** Phase 03 generates
    migrations `0003` and `0004` and edits `schema.ts`, `index.astro` and
    `household/index.astro`. Two sessions generating drizzle migrations at the
    same time collide on the number and on `drizzle/meta/_journal.json`.
  - Phase 04's Task 13 also adds a migration. Whichever of Task 13 and Task 18
    lands second regenerates its migration on top of the first (delete its own
    unmerged `000N` files and the journal entry, run `pnpm db:generate`
    again). Never renumber a committed migration.
  - If Task 18 must run in parallel anyway, do the work in a worktree, commit
    everything except the migration and the two integration edits, and finish
    those three on top of phase 03.
- **Depends on:** Task 5 (done). Practically: phase 03 merged, for the reasons
  above.

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

- **Task 18:** none open. Decided here: discoverable credentials, a passkey
  mints a device token, challenges in memory, ADR 0005, start after phase 03.
- **Tasks 17 and 19:** none yet. Refine at phase start.

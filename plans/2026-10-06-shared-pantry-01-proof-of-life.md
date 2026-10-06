# Shared pantry — Phase 01: Proof of life

- **Date:** 2026-10-06
- **Status:** Approved
- **Requirements confirmed by user:** yes — 2026-10-06
- **Part of:** `plans/2026-10-06-shared-pantry-00-overview.md`. Read it first:
  §2.4 (CI and Fly facts), §3 (commands, layering, tests, deploy rules),
  §4.2–4.4 (types, schema, HTTP contract).
- **Depends on phases:** none.

## 1. Summary

This phase replaces the busybox placeholder with the real stack and ships the
smallest honest version of the app for the week 9 crit ("proof of life"):
- A person opens the site and names their household and themselves.
- They add items by name only.
- They mark items Used or Binned, with a no-JavaScript Undo.
- They see the history.

Data lives in SQLite on `/data`, `/readme/` serves the README in full, and the
app is deployed to `https://comp4020-final-attwelvedev.fly.dev`. No live sync,
invites or styling beyond a minimal Enamelware token base; those come in later
phases.

## 2. Requirements (this phase)

### 2.1 Functional

| FR | Part implemented here |
| --- | --- |
| FR1, FR2, FR4 | In full |
| FR7 | First run is not shown to a device that already has a session |
| FR10 | Server side: name only + Enter adds, via a plain form POST |
| FR14 | Used / Binned record history; Undo via a server-rendered banner; no confirm dialogs |
| FR15 | In full |
| FR21 | Basic list only: newest first, with a trailing Used button and a Binned button |
| FR34 | History page with outcome filter |
| FR38 | DB on `DATABASE_PATH`; restart and redeploy verified |

### 2.2 Non-functional

| NFR | Part implemented here |
| --- | --- |
| NFR-Course | `/` and `/readme/` |
| NFR-Effortless | Add is one field + Enter; outcomes are one tap; no `confirm()` |
| NFR-Viewports | No horizontal overflow at 375 and 1280 |
| NFR-A11y | Baseline: axe clean, labelled fields, keyboard-operable forms |
| NFR-Privacy | Device tokens stored only as hashes |
| NFR-Resources | Slim Node image |

### 2.3 Out of scope for this phase

| Deferred | Phase |
| --- | --- |
| Invites, joining, device links, member removal | 02 (Task 5) |
| Live sync, Preact islands, optimistic UI | 02 (Tasks 6–7) |
| Communities and offers | 03 |
| Measure types, estimates, buckets, FoodKeeper, logging | 04 |
| Full visual design, images, search | 05 |
| Map, passkeys | 06 |

README prose is user-authored (overview §3).

### 2.4 Assumptions

See overview §2.4. Phase-specific: the deploy uses the Fly token in the
user's `mise.local.toml`. The agent never reads that file.

## 3. Existing code context (verified 2026-10-06)

**Repo files and what they mean for this phase:**

| File | Fact | Consequence |
| --- | --- | --- |
| `Dockerfile` | busybox placeholder serving `placeholder/` with `httpd`; README HTML-escaped into `placeholder/readme.html` | Replaced by a Node image |
| `placeholder/index.html`, `placeholder/readme.html` | The placeholder pages | Deleted in Task 1 |
| `package.json` | Scripts: `prepare` (sets `core.hooksPath .githooks`), `typecheck: tsc --noEmit`, `lint: biome check .`, `format: biome check --write .`, `check: pnpm typecheck && pnpm lint && pnpm test`, `check:evidence: node scripts/check-evidence.ts`, `test: vitest run`. devDeps: `@biomejs/biome 2.5.15`, `@types/jsdom ^30`, `@types/node ^24`, `jsdom ^30.1`, `typescript ^6.0.3`, `vitest ^5.0.1`. `engines.pnpm >=11` | Keep `prepare` and `check:evidence` exactly |
| `vitest.config.ts` | `test: { include: ["spec/**/*.test.ts"], globalSetup: ["./spec/global-setup.ts"] }` | Not a fixed file; Task 1 changes it |
| `spec/global-setup.ts` (**fixed**) | Polls `APP_URL ?? "http://localhost:8080"` for up to 60 s, then `project.provide("baseUrl", baseUrl)`. Tests read it with `inject("baseUrl")` | — |
| `spec/invariants.test.ts` (**fixed**) | Checks `/` → 200, and that `/readme/` HTML contains every README ATX heading in order (normalised letters and digits, link targets and inline tags dropped) | Must stay green after every task |
| `tsconfig.json` | Includes only `*.ts`, `spec`, `scripts`. Options: `allowImportingTsExtensions`, `verbatimModuleSyntax`, `moduleResolution: bundler`, `types: ["node"]` | Spec files import with `.ts` extensions |
| `biome.json` | Ignores `!!**/node_modules`, `!!**/dist`, the lockfile, the two fixed spec files, `scripts/check-evidence.ts`, `placeholder`, `harness`. Formatter: 2 spaces, width 100, double quotes | Task 1 removes `!placeholder` and adds `!!**/.astro`, `!drizzle` |
| `pnpm-workspace.yaml` | `allowBuilds: { esbuild: true }` | better-sqlite3 needs `true` too |
| `.gitignore` | Has `node_modules/`, `dist/`; no `.data/` | Task 1 adds `.data/` and `.astro/`. That narrows what's tracked; it doesn't widen it |
| `.dockerignore` | Excludes `.git node_modules dist *.log .env* .envrc mise.local.toml *.pem .claude` | Task 1 adds `.data` and `.astro` |
| `README.md` | Course template: one `# Your app` heading plus a TEMPLATE comment | User replaces the prose (Task 4) |
| `fly.toml` (**fixed**) | `PORT=8080`, internal_port 8080, volume `data` at `/data`, 256 MB | — |
| `harness/claude-settings.json` | `mise exec -- flyctl deploy *` and `git push` **ask**; `guard-deploy.sh` blocks deploy from a dirty tree | — |

**Prior art to copy, adapted** (`../comp4020-crit7-attwelvedev`):
- `Dockerfile`: node:24-slim multi-stage, build-essential for better-sqlite3,
  `pnpm install --frozen-lockfile --prod=false`, `pnpm run build`,
  `pnpm prune --prod`, copies `node_modules`, `dist`, `drizzle`; runs
  `node ./dist/server/entry.mjs`. **Change:** port 8080, and set
  `DATABASE_PATH`.
- `astro.config.ts`: `output: "server"`, `adapter: node({ mode: "standalone" })`,
  `integrations: [preact()]`,
  `security.allowedDomains: [{ hostname: "**.fly.dev", protocol: "https" }]`.
  **Add** `server: { port: 8080 }`.
- `src/lib/db.ts`: `DATABASE_PATH ?? "./.data/app.db"`, `mkdirSync(dirname)`,
  `pragma journal_mode = WAL`, `drizzle(client)`,
  `migrate(db, { migrationsFolder: "./drizzle" })` at import.
- `src/pages/readme.astro`: `import * as readme from "../../README.md"`,
  renders `readme.compiledContent()` with `set:html`.
- `spec/browser.ts`: `launch()`, `openPage(browser, url, viewport)`,
  `horizontalOverflow(page)`, `axeViolations(page)`. **Change:**
  `chromium.launch({ channel: "chrome" })` (overview §2.4).
- `spec/readme.test.ts`: renders README.md with
  `@astrojs/markdown-remark`'s `createMarkdownProcessor` and asserts the
  served page contains the full normalised text.
- `vitest.config.ts`: `projects`, with `unit` (`src/**/*.test.ts`) and `spec`
  (`spec/**/*.test.ts`, `globalSetup`).
- `spec/suite-size.test.ts`: browser test files under 1000 lines.

### Interfaces from earlier phases (exact)

None.

## 4. Approach

- **Server-rendered, no JavaScript yet.** Every action is a plain HTML form
  POST that redirects (303) back to a page. This satisfies the effortless
  rules without islands: the add field submits on Enter, and Used is one
  button. Phase 02 layers islands on the same endpoints. So the forms built
  here are also the progressive-enhancement fallback that spec §4.1 asks for.
- **Undo without JavaScript.** After an outcome, the redirect to
  `/?undo=<historyId>` renders a banner, "Milk marked used. [Undo]", whose
  button POSTs to `/history/:id/undo`. Undo un-removes the item
  (`removed_at = null`) and deletes the history row, in one transaction.
- **Sessions:**
  - `newDeviceToken()` produces 32 random bytes as base64url; the cookie
    holds this raw value.
  - The database stores only `hashToken(token)` (sha256 hex) in
    `device_tokens.token_hash`.
  - `src/middleware.ts` reads `pantry_device`, calls `sessionForToken`,
    updates `last_seen_at` at most once an hour, and sets
    `Astro.locals.session`.
  - A cookie that doesn't resolve leaves the session null and does not crash.
- **Invite code:** generated now (Task 2), so the schema is stable for
  Task 5. Format: `WORD-NN` from a fixed list of 64 kitchen words plus two
  digits, retried on collision. The unguessable link token is Task 5's job.
- **Minimal visual base:** `src/styles/tokens.css` holds the spec §4.1 token
  table (light, dark, and the `data-theme` override) and system fonts.
  `Base.astro` provides `lang="en-AU"`, the viewport meta, a skip link, a
  `<main>`, and a footer link to `/readme/`. The full design comes in
  Task 14. Here it's just "not broken, legible, no overflow".

## 5. Task breakdown

### Task 1: Replace the placeholder with an Astro/Node app serving `/` and `/readme/`

- [x] Done

**Description:** Install the stack and build the Docker image. Serve a stub
`/` (200) and `/readme/` rendering README.md in full. Add test helpers. This
task changes no behaviour beyond what the placeholder already proved, but on
the real stack.

**Files touched:**

| File | Change |
| --- | --- |
| `package.json` | **Deps:** `astro`, `@astrojs/node`, `@astrojs/preact`, `preact`, `better-sqlite3`, `drizzle-orm`. **devDeps:** `@astrojs/check`, `@astrojs/markdown-remark` (match Astro's version), `@types/better-sqlite3`, `drizzle-kit`, `playwright`, `axe-core`. **Scripts:** `dev`, `build`, `start` (`node ./dist/server/entry.mjs`), `typecheck` (`astro check`), `test:unit`, `db:generate` (`drizzle-kit generate`). Keep `prepare`, `lint`, `format`, `check`, `check:evidence`, `test` |
| `pnpm-lock.yaml` | Regenerated |
| `pnpm-workspace.yaml` | Add `better-sqlite3: true` under `allowBuilds` |
| `astro.config.ts` | New (see §3 prior art; port 8080) |
| `tsconfig.json` | Extend `astro/tsconfigs/strict`; include `.astro/types.d.ts`, `src`, `spec`, `scripts`, `*.ts`; exclude `dist`; keep `allowImportingTsExtensions` and `verbatimModuleSyntax`; `jsx: "react-jsx"`, `jsxImportSource: "preact"` |
| `vitest.config.ts` | Two projects: `unit` and `spec` |
| `Dockerfile` | Replaced: Node multi-stage; ENV `HOST=0.0.0.0`, `PORT=8080`, `DATABASE_PATH=/data/app.db`; `EXPOSE 8080`; copies `drizzle/` |
| `.gitignore` | Add `.data/`, `.astro/` |
| `.dockerignore` | Add `.data`, `.astro` |
| `biome.json` | Drop `!placeholder`; add `!!**/.astro`, `!drizzle` |
| `src/layouts/Base.astro` | New |
| `src/styles/tokens.css` | New |
| `src/pages/index.astro` | Stub heading; becomes first run in Task 2 |
| `src/pages/readme.astro` | New; route `/readme/` |
| `spec/http.ts` | New |
| `spec/browser.ts` | New |
| `spec/readme.test.ts` | New |
| `spec/suite-size.test.ts` | New |
| `spec/layout/shell.test.ts` | New |
| `placeholder/` | Deleted |

**`spec/http.ts` exports** (used by every later spec file):
```ts
export interface Client {
  get(path: string): Promise<Response>;                               // follows no redirects
  post(path: string, fields?: Record<string, string>): Promise<Response>; // form-encoded, Origin = baseUrl
  cookie(name: string): string | undefined;
}
export function client(baseUrl: string): Client;   // own cookie jar; redirect: "manual"
export function text(html: string): string;        // jsdom body textContent
```

**`spec/browser.ts` exports:**
```ts
export interface Viewport { width: number; height: number }
export const PHONE: Viewport;    // { width: 375, height: 812 }
export const DESKTOP: Viewport;  // { width: 1280, height: 800 }
export function launch(): Promise<Browser>;   // chromium.launch({ channel: "chrome" })
export function openPage(browser: Browser, url: string, viewport: Viewport): Promise<Page>;
export function horizontalOverflow(page: Page): Promise<number>;
export function axeViolations(page: Page): Promise<string[]>;
```

**Tests first (red):**
1. `spec/readme.test.ts`: `/readme/` returns 200, and its text contains the
   full normalised rendered text of README.md. It fails against the
   placeholder, which serves escaped `<pre>` source with markdown syntax
   intact.
2. `spec/layout/shell.test.ts`: at PHONE and DESKTOP, `/` and `/readme/` have
   `horizontalOverflow === 0` and no axe violations. Contrast rules are
   disabled as in crit 7 until Task 14 sets real colours.
3. `spec/suite-size.test.ts`: every spec file that calls `launch()` is under
   1000 lines.
4. The existing `spec/invariants.test.ts` must still pass.

**Implementation (green):**
- Scaffold the files above. Run `pnpm install`, `pnpm build`, `pnpm start`,
  then `pnpm check`.
- Build the image locally to prove it boots:
  `docker build -t pantry . && docker run --rm -p 8080:8080 --tmpfs /data pantry`,
  then `curl localhost:8080/readme/`.

**Refactor:** none expected.

**Acceptance criteria:**
- `pnpm check` is green with the app started via
  `pnpm build && pnpm start`.
- The Docker image boots with `--tmpfs /data` and serves `/` (200) and
  `/readme/`.
- `placeholder/` is gone.
- `git grep -n busybox` returns nothing outside `harness/` and docs.

**Depends on:** none.

### Task 2: First-run household creation with a hashed device-token session

- [x] Done

**Description:**
- `GET /` with no session shows the first-run form: Household name, Your
  name, and "Start pantry", with Enter submitting.
- `POST /households` creates the household, the member and a device token,
  sets the cookie, and redirects to `/`.
- With a session, `/` shows the household name and an empty pantry
  placeholder ("Nothing here yet…"). The first-run form is never shown to a
  device with a session (FR7).
- Migrations run at boot.

**Files touched:**

| File | Change |
| --- | --- |
| `drizzle.config.ts` | New (`dialect: "sqlite"`, `schema: "./src/lib/schema.ts"`, `out: "./drizzle"`) |
| `drizzle/0000_*.sql` and meta | Generated |
| `src/lib/schema.ts` | `households`, `members`, `device_tokens` per overview §4.3 |
| `src/lib/db.ts` | Exports `Db`, `db`, `openDb` |
| `src/lib/session.ts` | Exports `DEVICE_COOKIE`, `newDeviceToken`, `hashToken` |
| `src/lib/households.ts` | Exports `Household`, `Member`, `Session`, `createHousehold`, `sessionForToken`, `ValidationError` re-export |
| `src/lib/errors.ts` | `ValidationError`, `NotFoundError`. `items.ts` re-exports these, which is what overview §4.2 refers to |
| `src/lib/households.test.ts` | New |
| `src/middleware.ts` | New |
| `src/env.d.ts` | New |
| `src/pages/index.astro` | First run, or pantry shell |
| `src/pages/households.ts` | `POST` handler |
| `spec/household.test.ts` | New |

All exported signatures are exactly as in overview §4.2.

**Tests first (red):**
- **Unit** (`src/lib/households.test.ts`, `openDb(":memory:")`):
  - `createHousehold` trims names. Blank or over-60-char names throw
    `ValidationError`.
  - It returns a token whose `hashToken` is stored and whose raw value is not
    stored anywhere: query `device_tokens`, assert no column equals the raw
    token.
  - `sessionForToken(raw)` returns the same member and household, and returns
    `null` for an unknown token.
  - Invite codes match `/^[A-Z]+-\d{2}$/` and are unique across 200 creations.
- **Spec** (`spec/household.test.ts`):
  - A fresh client `GET /` → 200, and the page contains a form posting to
    `/households` with fields `householdName` and `memberName`.
  - `POST /households {householdName:"Unit 4", memberName:"Sam"}` → 303 to
    `/`, with `Set-Cookie: pantry_device=…; HttpOnly; SameSite=Lax; Path=/`.
  - Following with the cookie, `GET /` shows "Unit 4" and no first-run form.
  - A second, separate client does not see "Unit 4" and gets the first-run
    form.
  - A blank `memberName` → 400, and the page re-renders the form showing the
    error text and keeping "Unit 4" in the household field.
  - A garbage cookie value → `GET /` returns 200 with the first-run form, not
    a 500.

**Implementation (green):**
- Write the schema, generate the migration, then the services, middleware,
  page and endpoint.
- The endpoint sets `Secure` only when `url.protocol === "https:"` or
  `x-forwarded-proto` is `https`.

**Refactor:** keep the endpoint thin; any parsing helper goes in `src/lib`.

**Acceptance criteria:**
- All the tests above pass and `pnpm check` is green.
- Restarting `pnpm start` keeps the session working, because
  `.data/app.db` persists.

**Depends on:** Task 1.

### Task 3: Add items by name, mark Used/Binned with undo, record history

- [ ] Done

**Description:**
- `POST /items` adds an item with only a name. Duplicates are allowed.
- The pantry lists current items, newest first. Each row has the name, a
  trailing **Used** button and a **Binned** button, each a one-field form.
- An outcome soft-removes the item, writes a history row, and redirects to
  `/?undo=<id>`, which shows the Undo banner.
- No `confirm()` and no dialogs.
- The add field is labelled "Add an item", autofocused when the pantry is
  empty, and sits above the list in this phase. The phone bottom bar comes in
  Task 14.

**Files touched:**

| File | Change |
| --- | --- |
| `src/lib/schema.ts` | Add `items` and `history` per overview §4.3 |
| `drizzle/0001_*.sql` | Generated |
| `src/lib/items.ts` | Exports per overview §4.2 |
| `src/lib/items.test.ts` | New |
| `src/pages/index.astro` | Pantry list, add form, undo banner, empty state |
| `src/pages/items/index.ts` | `POST` |
| `src/pages/items/[id]/outcome.ts` | `POST` |
| `src/pages/history/[id]/undo.ts` | `POST` |
| `spec/items.test.ts` | New |
| `spec/layout/pantry.test.ts` | New |

**Tests first (red):**
- **Unit** (`src/lib/items.test.ts`):
  - `addItem` trims names. Blank or over-120-char names throw
    `ValidationError`. Two "Milk" items are both listed.
  - `listPantry` excludes removed items and is newest first.
  - `recordOutcome` sets `removed_at` and returns a `HistoryEntry` with
    `memberName` = the session member's name and `itemName` = the name.
  - A second outcome on the same item throws `NotFoundError`.
  - An item from another household throws `NotFoundError`.
  - `undoOutcome` restores the item to `listPantry` and removes the history
    row. Undo from another household throws `NotFoundError`.
  - `listHistory(db, id, "binned")` filters by outcome and is newest first.
- **Spec** (`spec/items.test.ts`), each test creating its own household:
  - `POST /items {name:"milk"}` → 303, and `GET /` shows "milk".
  - `POST /items {name:"  "}` → 400.
  - Used flow: add, read the item id from the form action in the HTML,
    `POST /items/:id/outcome {outcome:"used"}` → 303 to `/?undo=…`. That page
    no longer lists the item and shows "marked used" with an Undo form.
    POSTing that form → 303, and the item is back.
  - Binned outcome is recorded likewise.
  - `outcome:"eaten"` → 400.
  - Another household's client posting an outcome on this item's id → 404.
  - A POST without a session → 303 to `/`.
- **Spec** (`spec/layout/pantry.test.ts`, browser):
  - With a household created through the UI, type "eggs" and press Enter in
    the add field, keyboard only: the item appears.
  - Click Used: no `dialog` event fires (`page.on("dialog")` counter stays
    0), the row disappears, and the Undo banner appears.
  - No horizontal overflow at PHONE or DESKTOP with 12 items, including one
    with a 120-character name.
  - Axe is clean.

**Implementation (green):** services, endpoints and page markup. Every action
is a `<form method="post">` with a `<button>`, and item ids appear in form
actions.

**Refactor:** if `index.astro` passes about 150 lines, extract
`src/components/PantryRow.astro` and `src/components/UndoBanner.astro`.

**Acceptance criteria:**
- All the tests above pass and `pnpm check` is green.
- Manual check at a phone width: add takes one field + Enter, Used takes one
  tap, Undo works.

**Depends on:** Task 2.

### Task 4: History page, CLAUDE.md invariants, ADR acceptance, README check and the week 9 deploy

- [ ] Done

**Description:**
- `GET /history` lists the outcome record with an outcome filter
  (`?outcome=`), shown as All / Used / Binned links. It shows "Nothing
  recorded yet. Used, binned and given items land here." when empty.
- A simple nav on `Base.astro`: Pantry · History · About (README).
- Fill the TBD invariants in `CLAUDE.md`.
- The user writes the first README draft. The agent ensures `/readme/`
  serves it and the checks pass.
- With the user's go-ahead, flip ADRs 0001 and 0003 to `accepted`, commit,
  and deploy.

**Files touched:**

| File | Change |
| --- | --- |
| `src/pages/history.astro` | New |
| `src/layouts/Base.astro` | Nav |
| `spec/history.test.ts` | New |
| `CLAUDE.md` | "Run it", "Shape of the app" and "Naming and layout" bullets only. Text below. Don't touch the Working method sections |
| `doc/adr/0001-*.md`, `doc/adr/0003-*.md` | `Status: accepted`, only on the user's explicit yes |
| `README.md` | **The user edits it.** The agent changes nothing in it |

**`CLAUDE.md` invariant text to write:**
- **Run it:** `pnpm install && pnpm build && pnpm start` serves on `:8080`
  (DB at `./.data/app.db`; set `DATABASE_PATH` to move it). `pnpm dev` is
  for hot reload.
- **Shape of the app:** a household pantry where adding is one field + Enter
  and every outcome is one tap with Undo, never a confirm dialog. A person is
  a member of one household, identified by a hashed device token (ADR 0002).
  State is SQLite on `/data` (ADR 0003). Live sync is SSE (ADR 0004, from
  phase 02). See `specs/2026-10-06-shared-pantry.md`.
- **Naming and layout:** domain services in `src/lib/` take `db` first and
  never touch requests. Endpoints in `src/pages/` stay thin. Unit tests sit
  beside the code; promises to users get `spec/<area>.test.ts`; browser
  checks get one `spec/layout/<area>.test.ts` per area.

**Tests first (red):**
- `spec/history.test.ts`:
  - After one Used and one Binned, `GET /history` lists both with the member
    name.
  - `?outcome=binned` shows only the binned one.
  - An empty household shows the empty-state text.
  - A no-session request → 303 to `/`.
  - Another household's history is not visible.

**Implementation (green):** the page and nav, then the `CLAUDE.md` bullets.

**Deploy steps:**
1. `pnpm check` green.
2. Commit everything: plans, specs and ADRs included, because the deploy
   hook refuses a dirty tree.
3. With the user's go-ahead:
   `mise exec -- flyctl deploy --remote-only --ha=false -a comp4020-final-attwelvedev`.
4. `curl -s -o /dev/null -w "%{http_code}" https://comp4020-final-attwelvedev.fly.dev/`
   returns 200.
5. Run `APP_URL=https://comp4020-final-attwelvedev.fly.dev pnpm test --project spec`
   against the deployed app.
   - The tests create throwaway households there.
   - Tell the user before running it. It writes test data to the production
     DB, which is acceptable now and must not be done after the showcase
     without asking.
6. **Persistence check (FR38):**
   - Create a household on the deployed site and add "milk".
   - Run `mise exec -- flyctl deploy …` again, or ask the user to restart the
     machine.
   - Reload with the same browser: "milk" is still there.

**Acceptance criteria:**
- The history tests pass and `pnpm check` is green.
- The deployed URL returns 200, and `/readme/` serves the user's README.
- The persistence check passes on the deployed app.
- The `CLAUDE.md` TBDs are replaced.
- ADRs 0001 and 0003 are `accepted`, but only if the user said yes.

**Human review:**
1. The user opens the deployed app on their phone and a desktop browser, and
   walks the first-run → add → Used → Undo → History flow.
   - **Pass:** it works, is legible, and has nothing broken or overflowing.
     It isn't styled yet, and that's expected.
2. The user confirms the README draft is theirs and in their voice.

**Depends on:** Task 3.

## 6. Phase Definition of Done

- [ ] Tasks 1–4 complete; each committed with `pnpm check` green
- [ ] `pnpm test` passes (app running via `pnpm build && pnpm start`)
- [ ] `pnpm check` passes
- [ ] Docker image boots with `--tmpfs /data` and serves `/` and `/readme/`
- [ ] Deployed: `https://comp4020-final-attwelvedev.fly.dev` returns 200;
      the spec suite passes against it; the persistence check passes
- [ ] Task 4's human reviews accepted explicitly by the user
- [ ] Tick phase 01 in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR1, FR2, FR4 | Task 2 |
| FR7 (first-run hidden) | Task 2 |
| FR10 (server side) | Task 3 |
| FR14 (server + no-JS undo) | Task 3 |
| FR15 | Task 3 |
| FR21 (basic list) | Task 3 |
| FR34 | Task 3 (records), Task 4 (page and filter) |
| FR38 | Task 2 (DB path), Task 4 (deploy and restart check) |
| NFR-Course | Task 1 |
| NFR-Effortless (baseline) | Task 3 |
| NFR-Viewports, NFR-A11y (baseline) | Task 1, Task 3 |
| NFR-Privacy (hashed tokens) | Task 2 |
| NFR-Resources (slim image) | Task 1 |

## 8. Risks / open questions

None.

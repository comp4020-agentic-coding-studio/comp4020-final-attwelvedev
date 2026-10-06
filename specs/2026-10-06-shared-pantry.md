# Shared pantry with neighbourhood offers (working name)

- **Date:** 2026-10-06
- **Status:** Approved
- **Approved by user:** yes — 2026-10-06
- **Tier:** Architecture (ADRs 0001–0004 in `doc/adr/`)

## 1. Problem / intent

Food trackers fail because adding items and marking them used is a chore, so
the record goes stale and gets abandoned. Food-sharing apps fail for the same
reason from the other side: every post starts from scratch. Nobody connects
the two.

This app is a shared household pantry where upkeep is close to effortless:
only a name is required, quantities and expiry are rough, labelled
estimates, and the use/bin record builds itself as a side effect of normal
taps. Because the pantry already knows what is about to go to waste, offering
it to neighbours takes one sheet and Post, on data the household already has.

It continues two earlier projects by the same author:
[MyKitchen](https://github.com/attwelveDev/MyKitchen) (Android/Firebase: shared
kitchens, but an 8+ tap add form, a hidden 3-step "use" flow, integer
quantities and no used/wasted split) and
[Pantry](https://github.com/attwelveDev/Pantry) (SwiftUI: a light
one-swipe Consumed/Wasted split, but no persistence, sharing or quantities).
This app keeps MyKitchen's sharing and Pantry's lightness and closes the gaps
both left.

**Position on the brief's co-presence.** Household members talk to each other
in person; an app that mediates that is a gimmick, so the app deliberately
does not (no household claiming, no cooking events, no chat). Co-presence
lives where the app is the *only* channel: between neighbours in a community,
where seeing an offer — and seeing it get taken — live is the point. Inside a
household, real-time means the record stays true while several people touch
the same food. Sources to argue from: Robin Sloan, "An app can be a
home-cooked meal" (2020); Weiser & Brown, calm technology (1995); the two
prior projects above. The user should check this reading with a tutor before
the week 10 crit.

## 2. Requirements

### 2.1 Functional requirements

**People and households**

1. A member is a display name inside a household. There are no accounts or
   passwords.
2. First run asks for a household name and the person's name only, then lands
   in the (empty) pantry.
3. Any member can invite others by link or by code (a short human code such
   as `KETTLE-42`, with the link carrying an additional unguessable token).
   Joining asks only for a display name.
4. The browser remembers a member via an `httpOnly` device cookie holding an
   unguessable random token, stored only as a hash on the server.
5. A member can add another device by showing a "sign in as me" link/QR from
   a signed-in device.
6. (Week 12) A member can optionally register a passkey, which survives
   cleared cookies and syncs across devices in an ecosystem.
7. One household per device; no switcher.
8. Any member can leave; any member can remove another member. A removed
   member's devices are signed out immediately.
9. When the last member leaves, the household is deleted with its items and
   photos, and its open offers are withdrawn.

**Items**

10. Only a name is required. Add = type a name, press Enter; everything else
    is defaulted and appears immediately (optimistically).
11. The measure type is guessed from the name and can be changed in one tap:
    - **Fill** (milk, flour, oil): slider snapping to Full / ¾ / ½ / ¼ /
      Nearly out. An exact amount (number + g, kg, ml, L or count) replaces
      the stop display until the slider is moved again.
    - **Count** (eggs, apples): − / + stepper.
    - **Have** (spices, condiments): no control; the row shows "have".
      Running out *is* marking it Used.
    - Unknown foods default to Have.
12. Every value is an estimate, shown with who set it and how long ago
    ("Sam's estimate, 2 h ago"). The latest write wins, per value. Anyone can
    correct it in one tap.
13. Expiry is a bucket: Use soon / This week / This month / Long-lasting /
    Unknown. It is stored as an estimated date, so the bucket moves on its own
    as time passes. Defaults come from USDA FoodKeeper matched by name. An
    optional exact date overrides the estimate. Buckets are computed in the
    viewer's local time zone; dates are stored as calendar dates.
14. Outcomes: **Used**, **Binned**, **Given**. Each is one tap with an Undo
    toast — never a confirm dialog — and adds a row to the household history,
    which is kept forever. Given happens only via a collected offer.
15. Duplicates are allowed (two cartons of milk); they are told apart by
    value, bucket and photo. No auto-suffix.

**Images**

16. Every item has an image, resolved in order: the item's photo → icon
    matched by name → category icon (dairy, produce, grains, tins, meat,
    frozen, condiments, drinks, snacks, other) → letter tile. Never blank.
17. A photo is optional, added from the open item panel or the offer sheet
    (camera or library). It is downscaled and re-encoded in the browser
    (480px longest side, ~30 KB WebP, JPEG fallback, plus a 96px thumbnail),
    which strips EXIF/GPS. It is never prompted for after an add.
18. An item's photo carries over to its offer and is deleted when the item
    leaves the pantry. History is text-only.
19. A failed upload falls back to the icon with "Photo didn't upload. Retry /
    Discard"; the photo is lost on reload.

**Search**

20. Typing in the add field opens a match tray of pantry items (prefix, then
    word-start, then substring; ties by soonest expiry; matched characters
    underlined). Tap a match, or ↓ then Enter, opens it in place. **Plain
    Enter always adds a new item.** An exact name match shows "You already
    have Milk. Enter adds another" without blocking. "Show all N matches"
    filters the main list.

**Main pantry view**

21. A single list grouped under sticky bucket headings, soonest first
    (Past estimate at the top, Unknown at the end). Each row shows image,
    name (max 2 lines), value glyph, a shelf-life tape, and a trailing
    **Used** button (one tap, phone and desktop). Tapping a row opens quick
    adjustments in place (no edit page). Desktop rows also show Binned and
    Offer; on phone these are in the open panel. A "Jump to" control appears
    above 25 items. Past-estimate items get no notifications or nudges.

**Communities**

22. A community is a named group with a rough map area (a circle drawn on the
    map at creation). The creator can remove households. If the creator's
    household leaves, the role passes to the earliest-joined household.
23. Discovery: "Use my location" sorts communities nearest-first, as a list
    (primary, keyboard-accessible) and on an optional map (loaded only when
    asked). Location is used only in the browser and is never sent to our
    server. Without location, the list is A–Z. Search is by community name
    only.
24. Joining a listed community is instant (with Undo). Communities can also be
    joined by link or code. A household can belong to several communities.
25. Communities only ever see household names, never member names. Clashing
    household names within a community get a suffix ("Unit 4 · 2").

**Offers**

26. Offer opens a sheet and posts from it: the whole item by default, to all
    of the household's communities by default (untick to narrow). "Offer some…" is secondary for
    count and fill items; the remainder stays in the pantry with a reduced
    value.
27. A pickup note is required and belongs to each offer, because notes change
    from item to item. Every offer opens the sheet with the note field filled
    with the last note used and selected, so it can be kept or overwritten
    before posting; a toast "Undo · Edit note" follows. The household sees
    each open offer's note and can view and edit it from the item's row.
28. Lifecycle: offered → claimed → collected (item leaves the pantry as Given)
    or released / withdrawn (back to the pantry, no longer offered).
29. Claims are first-come and decided by the server in a transaction; the
    loser sees "Someone claimed this first", not an error. A household cannot
    claim its own offer.
30. The pickup note is revealed only to the claiming household (all its
    members) and to the offering household that wrote it. The offerer sees "Claimed by Unit 9, 5 min ago".
31. Either side can tap Collected. There is no claim expiry; the offerer can
    Release manually.
32. Marking an offered item Used or Binned, or deleting it, withdraws its open
    offer automatically. Editing its values updates the live offer. An offer
    whose item passes its estimate stays up, showing "past estimate".
33. When a household leaves or is removed from a community, its open offers
    there are withdrawn and its claims there are released.

**History**

34. A list of Used / Binned / Given rows, filterable by outcome, showing item,
    outcome, who (inside the household) and when. Given rows say "to a
    neighbour".

**Live updates and persistence**

35. Every change reaches every other open session showing it within about one
    second, with no reload (Server-Sent Events; ADR 0004).
36. Your own changes show instantly and are reconciled by the server; a failed
    write rolls back with an inline "Couldn't save … Retry". No offline queue.
37. On reconnect, the page fetches a fresh snapshot rather than replaying
    events. A text "Reconnecting…" status appears only after 3 s disconnected.
38. All data survives restarts and redeploys (SQLite and photo files on
    `/data`; ADR 0003).

### 2.2 Non-functional requirements

- **"Effortless" (enforced in `spec/`):** add = one field + Enter; Used,
  Binned, Claim, Collected, Release, Join = one tap each (offering takes the
  sheet and Post); no confirm dialogs anywhere.
- **Accessibility:** fully keyboard-operable (skip link; `/` focuses the add
  field; roving focus with ↑/↓ in the list; Enter/Space opens, Esc closes and
  returns focus; U/B/O act on the focused row; ARIA 1.2 combobox for the add
  field; visible "Keyboard" help line in the footer). No information carried
  by colour alone. WCAG AA contrast. `prefers-reduced-motion` respected.
  Screen-reader announcements for live changes, throttled to one per 5 s.
- **Viewports:** phone (~375px) and desktop (~1280px), including a mid-use
  resize.
- **Privacy (enforced where testable):** the server never receives or stores a
  user's location; uploaded photos carry no EXIF/GPS; member names never leave
  the household; pickup notes are sent only to the claiming and offering households; logs
  never contain locations, pickup notes or photos.
- **Resources:** fits a 256 MB shared-cpu machine; JS limited to a few Preact
  islands; icons are separately cached static files loaded lazily; Leaflet is
  loaded only on request; one ~40 KB self-hosted font.
- **Abuse (accepted risk at capstone scale):** unguessable invite tokens and
  basic per-device throttling only; no photo reporting — community creators
  can remove households, and the README states photos are for the offered
  item only.
- **Course-fixed:** answers at `/`; README published at `/readme/`;
  server-side logging (week 11; what is logged is decided then).

### 2.3 Out of scope

Each to be named in the README's "what I chose not to build":

- Household claiming ("I'm using this tonight") and cooking events / saved
  dishes — household members talk in person.
- Chat or messaging of any kind — the pickup note replaces it.
- Barcode scanning, voice entry, Open Food Facts lookups, stock or AI images.
- Gamification: points, streaks, levels.
- Shopping lists (including leaving "out" items in the pantry).
- Location-radius matching and storing user locations; suburb geocoding.
- Email of any kind; password accounts.
- Notifications about expiry.
- Offline write queueing / offline-first sync.
- Photo reporting / moderation workflow.
- Multiple households per device.

### 2.4 Assumptions (confirmed)

| Assumption | How confirmed |
| --- | --- |
| The app is a web app on one 256 MB Fly machine with `/data` as the only persistent storage and no separate database server | Read `fly.toml`, `Dockerfile`, `CLAUDE.md` |
| Prior projects are a basis for lessons and framing, not code to port (they are Java/Android and Swift/iOS) | Survey of both repos; user framing |
| FoodKeeper's US storage times are close enough for Australian use | User chose FoodKeeper over a hand-made list or MyKitchen's CSV |
| **FoodKeeper licence is public domain (USDA work)** | **Not yet verified — check during planning before bundling** |
| Name matching to icon / category / measure type / bucket is "good enough, correctable in one tap" | User accepted; not proven — measure in use |
| OpenMoji's CC BY-SA licence on bundled icons is acceptable in a public repo, with a footer credit | User accepted resolutions |
| Showing a map fetches OSM tiles, revealing the viewed area to the tile server; copy therefore says "never sent to *our* server" | Raised in design review; user accepted |
| Markers test as a newly invited member in two sessions and resume the next day in the same browser — covered by the cookie + device-link layers without passkeys | Final-project brief |

## 3. Existing context

- **Repo:** `comp4020-final-attwelvedev` contains only the course harness and a
  busybox placeholder (`placeholder/`, `Dockerfile`). No application code, no
  design system, no `doc/adr/` yet.
- **Fixed constraints** (`fly.toml`, hooks block edits): one shared-cpu-1x
  machine, 256 MB; one 1 GB volume at `/data`; HTTP on `0.0.0.0:$PORT` (8080)
  behind Fly's TLS proxy; machine auto-stops when idle (cold starts must stay
  fast).
- **Checks:** `spec/invariants.test.ts` requires `/` → 200 and `/readme/`
  containing every README heading in order, against the running app.
  `pnpm check` = `tsc --noEmit` + Biome + vitest. All other `spec/` checks are
  ours.
- **Toolchain:** Node 24.21, pnpm 11.9 (`mise.toml`), TypeScript 6, vitest 5,
  Biome 2.5, jsdom.
- **Prior stack the author knows:** `comp4020-crit7-attwelvedev` used Astro 7
  with `@astrojs/node`, `@astrojs/preact`, `better-sqlite3`, `drizzle-orm`,
  Playwright and axe-core.
- **Working method** (`CLAUDE.md`): ADRs in `doc/adr/` (Nygard format);
  corrections land in `CLAUDE.md` or `spec/` and are logged in
  `PROCESS_LOG.md`; `README.md` (400–600 words) must agree with `CLAUDE.md`
  rules and `spec/` checks.
- **Reusable data from prior projects:** none trusted. MyKitchen's
  `assets/item_list.csv` (3,001 rows) has implausible shelf lives; its 2022
  Coles CSV could supply names and categories only.
- **Schedule:** today (2026-10-06) is week 9; crits are week 9 (proof of
  life), week 10 (real-time, pod uses it together), week 11 (server-side
  logging); due Mon 9 Nov 2026 noon.

## 4. Design

**Structure:** communities → households → members, plus items (owned by a
household), offers (an item offered to one or more communities), claims, and
history rows.

**Stack (ADR 0001):** Astro with server rendering on Node (`@astrojs/node`),
Preact islands for interactive parts (pantry list, offers feed, toasts,
connection status, map, add combobox). better-sqlite3 + Drizzle. Considered: a
full SPA (more phone JS, `/readme/` handled separately, no reuse of known
setup).

**Identity (ADR 0002):** a member owns one or more device tokens (random,
stored hashed, sent as an `httpOnly` cookie). Device links and, later, passkeys create further tokens or
credentials for the same member. Communities see household names only.
Considered: email magic links (needs a mail service, secret, and stores email
addresses) and password accounts (friction).

**Persistence (ADR 0003):** one SQLite file on `/data`; photos as files on
`/data` (480px + 96px versions). History rows kept forever; photos deleted
when their item leaves the pantry; location never stored. Considered: JSON
files (no transactions; claims need one).

**Live updates (ADR 0004):** writes are ordinary HTTP requests; each open page
holds one SSE stream scoped to its household and its communities; the server
fans out in-process (safe: one machine). Pickup notes are only ever sent on
the claiming and offering households' streams. On reconnect, a fresh snapshot. Considered:
WebSockets (two-way not needed; extra server beside Astro) and fast polling
(wasteful for ~1 s latency).

**Offer lifecycle:**

```
            Offer (sheet+Post)         Claim (first wins)          Collected (either side)
 in pantry ───────────────▶ offered ─────────────────▶ claimed ─────────────────────────▶ given
     ▲                        │  ▲                        │                          (leaves pantry,
     │   Withdraw / item      │  │       Release          │                           history row)
     └─── Used/Binned/deleted ┘  └────────────────────────┘
          or household leaves community
```

**Shelf-life / icon guessing:** server-side, from FoodKeeper plus a keyword
table, stored on the item (`iconKey`, category, measure type, default
bucket). The client ships a compact guess table (~5–8 KB gzipped) so
optimistic rows look right instantly; the server's answer reconciles.

**Phasing (by crit):**

| Crit | Ships |
| --- | --- |
| Week 9 (now) | Deployed stack; one household; add by name; Used / Binned; persisted; first README draft |
| Week 10 | Live sync (SSE); invites; communities by link/code; offers, claims, pickup notes, collected |
| Week 11 | Server-side logging; measure types and estimates polish; shelf-life tape view; images |
| Week 12 → 9 Nov | Map discovery and community creation by circle; passkeys; FoodKeeper tuning |

### 4.1 UI design

Produced by a `frontend-design` first-pass proposal over two rounds; the user
accepted the direction and the changes listed in §5. There was no existing
design system, so all visual language is new.

**Direction — "Enamelware".** White enamel kitchenware with a navy rolled rim:
common, cheap, communal kitchen objects. Light theme = white enamel; dark
theme = the navy rim as the surface (a reversal, not grey). The navy rim only
ever means *open / yours / active* (open panel, your claimed offer, focus
ring). Food colours are reserved for state. List lines, not cards; no
shadows on content except the floating toast; no gradients.

**Tokens**

| token | light | dark | role |
|---|---|---|---|
| `--bg` | `#F4F7F8` | `#13233F` | page |
| `--surface` | `#FFFFFF` | `#1B2E50` | open panel, sheets, toast |
| `--rim` | `#1E3D72` | `#A8C2EC` | brand, primary fill, open/active rim, focus |
| `--ink` | `#17243A` | `#EEF2F7` | text |
| `--ink-muted` | `#566377` | `#A6B3C6` | attribution, meta, icons |
| `--line` | `#D3DBE3` | `#2D4268` | separators, dish rim |
| `--tape-fresh` | `#4A76B0` | `#7FA6DE` | long-lasting / this month |
| `--soon` | bar `#C27400`, text `#8C5200` | `#F2A63B` | this week / use soon (marmalade) |
| `--past` | `#8E2453` | `#E58AB0` | past estimate, rollback errors (beetroot) |
| `--basil` | `#36704A` | `#86C99C` | offers, claim, neighbours |
| `--unknown` | `#9AA5B3` | `#5E7090` | unknown bucket |

Text ≥ 4.5:1, bars ≥ 3:1. **Type:** Atkinson Hyperlegible Next, one
self-hosted variable woff2 (~40 KB, Latin subset, `font-display: swap`,
`system-ui` fallback with `size-adjust`); scale 13/16/19/23/28; item names
17–19/600; sentence case; tabular figures; no middle-dot meta strings
("Sam's estimate, 2 h ago"). **Spacing:** 4px base; tap targets ≥ 44px;
rows 56px (64px wrapped). **Radius:** rows 0, buttons/chips 10, open panel
14, sheets 20 top. **Motion:** only in response to action — panel 160ms,
row collapse 200ms, remote-change underline fades over 1.6s; ageing never
animates; reduced motion → no slides, static dot for 3 s.

**Shelf-life tape (signature).** A 4px bar on each row's bottom edge whose
length is the share of shelf life left (capped at 30 days = full). Sorted
soonest-first, the bars form a slope. Bucket is carried four ways:

| bucket | length | pattern | colour |
|---|---|---|---|
| Long-lasting / This month | full / long | solid | fresh blue |
| This week | medium | dashed | marmalade |
| Use soon | short | diagonal hatch | marmalade |
| Past estimate | stub | torn zigzag end | beetroot |
| Unknown | full | dotted, faint | grey |

…plus the sticky heading and row text. Exact dates show as "by Fri 9 Oct".
The tape is `aria-hidden`; row names read e.g. "Spinach, quarter left, use
soon". **Value glyph:** Fill = small jar at 5 levels + "½" (or "~400 g");
Count = tabular number; Have = "have".

**Images.** Every image sits in a 44px (desktop 48px) circular "enamel dish"
(`--bg` fill, 1.5px `--line` rim; never `--rim`). Icons are OpenMoji
line-only SVGs recoloured to `currentColor` in `--ink-muted` — full-colour
emoji were rejected because red/brown food colours would read as expiry
state and drown out the tape. Photos stay full colour, centre-cropped. Row
images are decorative (`alt=""`); offer photos have descriptive alt. Icons are
per-file static assets, `loading="lazy"`, immutably cached; footer credits
OpenMoji (CC BY-SA 4.0).

Image states: icon / category / letter tile / photo; uploading (local preview
at 60% + ring, "Uploading photo…"); failed (falls back to icon, "Photo didn't
upload. Retry / Discard"); photo URL fails later (icon, silently); loading
(dish background, no layout shift).

**Layout.** Phone: top band (household + connection status), bottom add bar in
thumb reach above a tab bar (Pantry, Offers, History, Household); the tab bar
hides while the add field is focused. Desktop: top bar with tabs; Pantry is a
720px list plus a 360px "Offers in your communities" rail.

**Pantry — phone, populated, one row open**

```
┌──────────────────────────────────────┐
│ Unit 4                               │
├──────────────────────────────────────┤
│ Past estimate (1)                    │
│ (🌿) Coriander       have   [ Used ] │
│ ━╳ past estimate                     │
│ Use soon (2)                         │
│ (📷) Pumpkin, half   ◔ ¼    [ Used ] │
│ ╱╱╱╱╱                                │
│┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓│
│┃ (🥛) Milk           ◑ ½    [ Used ]┃│
│┃ ╱╱╱╱╱╱╱╱                           ┃│
│┃ ┌──────┐ Add a photo (optional)    ┃│
│┃ │ (🥛) │                           ┃│
│┃ └──────┘                           ┃│
│┃ Full   ¾    ½    ¼   Nearly out    ┃│
│┃ ●─────●────[●]────●─────●          ┃│
│┃ Exact amount [ e.g. 400 g       ]  ┃│
│┃ Sam's estimate, 2 h ago            ┃│
│┃ Measured by (Fill) (Count) (Have)  ┃│
│┃ Use by (Use soon●)(This week)      ┃│
│┃   (This month)(Long-lasting)(?)    ┃│
│┃   [ Set date ]                     ┃│
│┃ [ Binned ]  [ Offer ]  Offer some… ┃│
│┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛│
│ This week (1)                        │
│ (🥚) Eggs              6    [ Used ] │
│ ╍╍╍╍╍╍╍╍╍╍╍╍╍╍                       │
│ Long-lasting (1)                     │
│ (Z) Za'atar          have   [ Used ] │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
├──────────────────────────────────────┤
│ [ Add or find an item…          Add ]│
│  Pantry   Offers   History   Household│
└──────────────────────────────────────┘
```

Count panel: `[ − ] 6 [ + ]` (48px buttons). Have items: no measure control.
Many items: sticky headings + "Jump to ▾" above 25 items; long names wrap to 2
lines then ellipsis (full name in panel). Used fires only if the pointer moved
< 10px (scroll-tap guard), with a 12px gap before the button.

**Pantry — phone, empty / loading / error / reconnecting**

```
│  Nothing here yet.                   │   empty: add field focused;
│  Type what's in the fridge and press │   "Try:" items are one-tap adds
│  Enter. Amounts and use-by dates     │
│  fill themselves in; fix them later  │
│  with a tap.                         │
│  Try: milk, eggs, spinach            │

│ Use soon                             │   loading: server-rendered shell;
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒                 ▒▒     │   skeletons only if hydration is
│ ▒▒▒▒▒                                │   slow; add works as a plain POST

│ (🥛) Milk                    ◑  ½    │   error: value snaps back,
│ ┃ Couldn't save ¼. Back to ½.  Retry │   beetroot edge + text; toast if
                                           off-screen

│ Unit 4          ◌ Reconnecting…      │   after 3 s disconnected;
│ Others' changes may be a few seconds │   offline variant: "Offline.
│ behind. Your taps still save.        │   Changes you make will be undone
                                           if they can't save."
```

**Pantry — desktop (1280)**

```
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│ Unit 4     Pantry  Offers  History  Household                                     Sam ▾      │
├──────────────────────────────────────────────────────────┬────────────────────────────────────┤
│ [ Add or find an item, then press Enter             / ]  │ Offers in your communities         │
│ Use soon (2)                                             │ ┌────────┐ Pumpkin, half           │
│ (📷) Pumpkin, half          ◔ ¼    [Used] Binned  Offer  │ │ photo  │ ╱╱╱ Use soon            │
│ ╱╱╱╱╱                                                    │ │ 64px   │ from Unit 9, 20 min ago │
│┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓│ └────────┘            [ Claim ]  │
│┃ (🥛) Milk                   ◑ ½    [Used] Binned Offer ┃│ ────────────────────────────────── │
│┃ ┌──────┐ Full ●───●──[●]──●───● Nearly out [~400 g ]  ┃│  (🍋)    Lemons, 4                 │
│┃ │ (🥛) │ Sam's estimate, 2 h ago (Fill)(Count)(Have)  ┃│          ╍╍╍ This week             │
│┃ └──────┘ Use by (Use soon●)(This week)(Month)(Long)(?)┃│          from Unit 2, 1 h ago      │
│┃ Add a photo   Offer some…                             ┃│                       [ Claim ]   │
│┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛│ Your offers                        │
│ This week (1)                                            │ Rice, ½ bag                        │
│ (🥚) Eggs                     6    [Used] Binned  Offer  │ Claimed by Unit 9, 5 min ago       │
│ ╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍                                     │ [ Collected ]  [ Release ]         │
└──────────────────────────────────────────────────────────┴────────────────────────────────────┘
```

Desktop empty/loading/error/offline follow the phone versions; reconnecting
text sits at the right of the top bar; empty rail: "No offers in your
communities right now".

**Add field as search (combobox)** — phone tray above the field, max 4 rows;
desktop dropdown 480px below the field. No option is active on open, so Enter
always adds. ↓/↑ move via `aria-activedescendant`; Enter on an active option
opens the item; first Esc closes the tray, second clears; Tab leaves.

```
│ 2 in your pantry                     │   (phone; list behind dimmed 40%)
│ (🥛) Milk          ½   This week     │
│ (🥛) Milk, oat     ¾   This month    │
│ Enter adds a new "mil"               │
├──────────────────────────────────────┤
│ [ mil▌                        Add ]  │

│ (🥛) Milk          ½   This week     │   exact match
│ You already have Milk. Enter adds    │
│ another (e.g. a second carton).      │

│ Enter adds "Za'atar"                 │   no match
```

Opening a match: tray closes, field clears, list scrolls to the item, its
panel opens, focus moves into it. Live region (debounced 400ms): "2 matches.
Down arrow to choose one, Enter adds a new item."

**Offer sheet (every offer)**

```
┌──────────────────────────────────────┐
│ ▔▔▔▔                                 │
│ Offer Pumpkin, half to neighbours    │
│ ┌──────┐ Neighbours see this photo.  │
│ │photo │ [ Change photo ]            │
│ └──────┘                             │
│ Whole item (¼)        Offer some…    │
│ Pickup note (only the household that │
│ claims it sees this)                 │
│ [ Leave on Unit 4 doorstep after 5 ] │
│ Next offer starts from this note.    │
│ Send to                              │
│ [✓] Heathcote St Neighbours          │
│ [✓] Lyneham Flats   +3 more ▾        │
│ [        Post offer          ]       │
└──────────────────────────────────────┘
```

Without a photo: icon dish + "[ Add a photo ] Optional; neighbours like to
see it." Posting closes the sheet; toast "Spinach
offered to 5 communities. Undo · Edit note"; the row shows "Offered" with a
basil edge and a Note button.

**Offers feed (phone)**

```
│ Offers                               │
│ (All 5) (Heathcote St) (Lyneham F…) →│  community filter chips
├──────────────────────────────────────┤
│ ┌────────┐ Pumpkin, half             │
│ │ photo  │ ╱╱╱ Use soon              │
│ │        │ from Unit 9, 20 min ago   │
│ └────────┘                 [ Claim ] │
│──────────────────────────────────────│
│   (🍋)     Lemons, 4                 │
│            ╍╍╍ This week             │
│            from Unit 2, 1 h ago      │
│                            [ Claim ] │
│──────────────────────────────────────│
│┃┌────────┐ Bread, sourdough  Claimed┃│  claimed by my household: rim,
│┃│ photo  │ from Unit 4 · 2, 1 h ago ┃│  pickup note revealed
│┃└────────┘ Pickup: box by letterbox ┃│
│┃ [ Collected ]  [ Release ]         ┃│
│──────────────────────────────────────│
│ Sourdough loaf, half                 │  taken live: struck through,
│ Taken                                │  photo 50%, collapses after 5 s
```

New offers while scrolled: `[ 1 new offer ↑ ]` pill (no jump). Empty: "No
offers in your communities right now…" + Find more communities; no
communities: "Join a community to see and share offers" + Find nearby / Enter
code. Loading: three skeleton rows. Lost race: "Someone claimed this first."
Network error: "Couldn't claim. Retry". Overflow: names wrap 2 lines; chips
scroll, "All 12 ▾" opens a checklist; multi-community offers de-duplicated.
Tapping a photo opens a 480px viewer dialog. Desktop: 720px column + 240px
community checklist.

**Find a community (phone; desktop = 480px list + map)**

```
│ Communities                          │
│ [ Use my location ]                  │
│ Your location is never sent to our   │
│ server.                              │
│ [ Search communities by name      ]  │
│ [ Have a code? ]       [ Show map ]  │
├──────────────────────────────────────┤
│ Heathcote St Neighbours     Joined ✓ │
│ 120 m, 14 households                 │
│ Lyneham Flats              [ Join ]  │
│ 400 m, 31 households                 │
```

Community creation (name + drawn circle) is not wireframed; design it when
the map lands (week 12).

**First run / join (phone)**

```
│  Keep your pantry honest             │
│  without the chore.                  │
│  Household name                      │
│  [ Unit 4                          ] │
│  Your name (only your household      │
│  sees it)                            │
│  [ Sam                             ] │
│  [        Start pantry             ] │
│  Joining someone's household?        │
│  Open their invite link, or          │
│  [ Enter an invite code ]            │
```

Invite link variant: "Join Unit 4", one field, "Join Unit 4" button. Desktop:
420px column at the left third.

**History and household settings**

```
│ History                (All)(Used)(Binned)(Given) │
│ This week                                         │
│ Milk          Used     Sam, Tue                   │
│ Spinach       Binned   Alex, Mon                  │
│ Lemons, 2     Given    to a neighbour, Mon        │

│ Unit 4                              [ Rename ] │
│ Invite someone in your household               │
│ [ Copy invite link ]   Code: KETTLE-42         │
│ Add another of your devices  [ Show QR code ]  │
│ Members: Sam (this device)  Alex  Priya        │
│ Communities: Heathcote St Neighbours [ Leave ] │
│ Last pickup note  [ Edit ]                     │
│ Passkey sign-in: coming later                  │
```

History empty: "Nothing recorded yet. Used, binned and given items land here."

**Live-change signalling.** Remote value change: in-place update, 2px
rim-coloured underline fading over 1.6 s, attribution updates. If that item is
open: "Alex just changed this to ¼"; mid-drag, my release wins; focus never
moves. Remote adds/removals don't re-sort while I'm interacting (wait for 2 s
idle or focus leaving the list); removed rows show "Used by Alex" struck
through for 2 s.

**Components (all new):** AppShell/TopBand/TabBar, ConnectionStatus,
AddCombobox (+MatchTray), PantryList (roving focus), BucketHeading +
JumpToBucket, ItemRow, RowUsedButton, ItemImage, ShelfLifeTape, MeasureGlyph,
ItemPanel, FillSlider, CountStepper, MeasureTypeSwitch, ExpiryPicker,
EstimateAttribution, OutcomeActions, PhotoPicker (+processor), PhotoViewer,
ToastRegion/UndoToast/ErrorToast, RemoteChangeMark, LiveAnnouncer, OfferSheet,
OfferRow/OfferStatus, OfferImageColumn, PickupNoteReveal, CommunityFilter,
NewItemsPill, CommunityList/LocationNotice/CommunitySearch, CommunityMap
(lazy), CommunityCreate, InviteCodeEntry, FirstRunForm/JoinHouseholdForm,
HistoryList, InvitePanel/DeviceQR/MemberList, SkeletonRows, EmptyState,
IconCredit.

**User changes to the design proposal:** none to the direction. The user
added item images (icon → category → letter, optional photos) and search, and
chose list-with-thumbnails over a tile grid, the match tray over filtering the
main list, and a trailing Used button on every row.

## 5. Probes raised and resolved

| # | Type | What was raised | Resolution |
| --- | --- | --- | --- |
| 1 | contradiction | The brief asks for co-presence; households are mostly asynchronous | Several co-presence features proposed (put-away sessions, sweeps, cook-together, presence markers, dibs); user rejected them as app-in-the-middle gimmicks. Project rethought: co-presence moves to neighbourhood communities, where the app is the only channel |
| 2 | gap | Scope (12 features) vs ~5 weeks and "features without reason earn nothing" | Cut household claiming and cooking events; community layer added; phased by crit |
| 3 | ambiguity | "Easy" isn't testable | Add = one field + Enter; outcomes/offer/claim = one tap, Undo not confirm; enforced in `spec/` |
| 4 | contradiction | User's own "households talk in person" argument vs household claiming and cooking events | Both cut; named in README out-of-scope |
| 5 | assumption | Prior projects as code basis | They're Android/iOS; this must be web — lessons and framing only |
| 6 | gap | Who counts as a person | Name + device cookie; device link; optional passkey (wk 12). Email rejected (service, secret, personal data) |
| 7 | gap | Street formation | Location-discovered communities with a map, invite link/code always available; location never leaves the browser; radius matching rejected |
| 8 | gap | Handover risks becoming chat | Pickup note + Collected; no messaging |
| 9 | gap | Pickup note privacy | Revealed only to the claiming household (and its writer, the offering household) |
| 10 | gap | Multiple communities per household | Allowed; offers default to all, untick to narrow |
| 11 | gap | Offerer identity to strangers | Household name only; suffix on clashes |
| 12 | gap | Shelf-life data source | USDA FoodKeeper (MyKitchen CSV unreliable); licence to verify |
| 13 | ambiguity | Do buckets move over time? | Yes — stored as estimated date |
| 14 | gap | Partial offers | Whole by default; "Offer some" for count/fill; remainder stays reduced |
| 15 | gap | Claimed but never collected | Offerer releases manually; no timers |
| 16 | gap | Week 9 crit is this week | Phasing table; week 9 = proof of life |
| 17 | gap | Stack and real-time transport | Astro/Node + Preact, SQLite on `/data`, SSE (ADRs 0001–0004) |
| 18 | gap | Measure type selection, fill stops, concurrency | Guess from name; 5 stops + exact override; latest-wins per value; server-decided first claim |
| 19 | gap | Member removal, creator succession, offers on leaving | Any member removes; earliest-joined household inherits; offers withdrawn |
| 20 | contradiction | Phone "open row then Used" = 2 taps vs one-tap rule | Trailing Used button on every row |
| 21 | contradiction | Required pickup note vs one-tap Offer | Offer takes a sheet, note prefilled with the last one used (changed 2026-10-07 after the user's review; was a remembered default after the first offer) |
| 22 | ambiguity | Present item set to "out" | Out = Used; no lingering out items (would become a shopping list) |
| 23 | gap | Community search by suburb needs a geocoder | Search by name only |
| 24 | ambiguity | "Location stays in browser" vs OSM tile requests | Copy: "never sent to our server"; map lazy-loaded |
| 25 | gap | Offerer must know who claimed | Sees claimer's household name |
| 26 | gap | Items hard to skim | Images: icon → category → letter; optional photos (EXIF stripped) |
| 27 | gap | Finding items in a long pantry | Add field doubles as search via a match tray; Enter always adds |
| 28 | ambiguity | Full-colour vs monochrome icons | Monochrome line icons; colour reserved for state; photos stay colour |
| 29 | gap | Photo lifetime, moderation, failed uploads, duplicate names | Photo follows item to offer, deleted when item leaves; no reporting (creator removal); discard on failure; value/bucket/photo distinguish duplicates |
| 30 | ambiguity | "Offers near you" label; "claimer" vs household | "Offers in your communities"; claiming household sees the note |
| 31 | gap | Item changed while offered; offer past estimate; self-claim; removals; last member; abuse; time zones; logging | Resolutions in FR 8–9, 13, 29, 32–33 and NFRs; accepted by user |

## 6. Handoff notes for planning

- **Do not re-litigate:** the co-presence position (#1, #4), the cut list
  (§2.3), the stack and transport, identity without email, communities with
  location in-browser only, one-tap rules, the Enamelware direction.
- **Week 9 is now.** The first plan should be a thin proof-of-life slice:
  replace the busybox placeholder with the Astro/Node app, SQLite on `/data`,
  one household (first run), add by name, Used/Binned, history row, README
  served at `/readme/`, deployed. Keep `spec/invariants.test.ts` green
  throughout. Write ADRs 0001 and 0003 to `accepted` when that lands.
- **Week 10** carries the most risk: SSE fan-out scoped per household and
  community, reconnect snapshot, claim transaction, pickup-note scoping. Test
  with two browser contexts (Playwright) — this is also what markers do.
- **Verify before bundling:** the FoodKeeper licence; OpenMoji attribution
  wording.
- **Testable claims to turn into `spec/` checks early:** one-field add; one-tap
  outcomes with no confirm dialog; change visible in a second session within
  ~1 s; photo upload has no EXIF; location never in any request body; pickup
  note absent from non-claimer payloads; member names absent from community
  payloads; keyboard-only flow; axe-core clean at both viewports.
- **README/CLAUDE.md/spec agreement** is marked: each enforced claim above
  should appear in all three.
- **Accepted risks:** markers reading co-presence literally (mitigate: tutor
  check before week 10); name-matching quality; no moderation; OSM tile
  privacy caveat; cold starts after auto-stop.
- Ask a tutor at the week 9 crit whether the co-presence reading is
  defensible.

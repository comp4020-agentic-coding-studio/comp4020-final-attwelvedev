# Shared pantry — Phase 05: The visual pantry, images and search

- **Date:** 2026-10-06
- **Status:** Outline. Before executing, re-run `plan-feature` Phases 2–4 on
  this file (overview §0).
- **Requirements confirmed by user:** yes — 2026-10-06
- **Part of:** `plans/2026-10-06-shared-pantry-00-overview.md`. It leans on
  §3 and §4. The design source is spec §4.1, which holds the wireframes,
  tokens and states.
- **Depends on phases:** 04 (measure, estimate, bucket data). It also uses
  the island patterns from 02.

## 1. Summary

The pantry becomes the Enamelware design from spec §4.1:
- grouped buckets with the shelf-life tape
- an in-place item panel with slider, stepper, measure switch and expiry
  picker
- a trailing Used button and desktop row actions
- the full keyboard model
- item images (icon, then category, then letter, with optional photos)
- the add field doubling as a search combobox

## 2. Requirements (this phase)

### 2.1 Functional

| FR | Part implemented here |
| --- | --- |
| FR11, FR12, FR13 | Controls and display |
| FR16–FR21 | In full |
| FR32 | Past-estimate display on offers |

### 2.2 Non-functional

| NFR | Part implemented here |
| --- | --- |
| NFR-A11y | Roving focus, U/B/O keys, combobox, colour independence, reduced motion, throttled announcements |
| NFR-Viewports | Phone and desktop |
| NFR-Privacy | Photos carry no EXIF. **Enforced in `spec/`** |
| NFR-Resources | One ~40 KB font; icons are lazy per-file assets; thumbnails in rows |

### 2.3 Out of scope for this phase

Map and community creation UI (phase 06).

### 2.4 Assumptions

See overview §2.4. OpenMoji is CC BY-SA 4.0, with the credit in the footer;
re-verify at phase start.

## 3. Existing code context

To be verified at phase start.

### Interfaces from earlier phases (exact)

Overview §4.2, plus these, copied verbatim from phases 02–04 at phase start:
- `PantryList` props and events
- `guess()`
- `bucketFor()`
- the item value, measure and expiry endpoints

## 4. Approach

The visual design follows spec §4.1 exactly.

**Fonts and icons:**
- Atkinson Hyperlegible Next is self-hosted at `public/fonts/`.
- The OpenMoji line SVG subset is copied into `public/icons/<key>.svg` by
  `scripts/build-icons.ts`, recoloured to `currentColor`.

**Photos:**
- **Client processing:** `createImageBitmap`, then a canvas at 480px and at
  96px, then `toBlob("image/webp", 0.7)` with a JPEG fallback.
- **Upload:** `POST /items/:id/photo` as multipart, with each size capped at
  100 KB.
- **Storage:** `/data/photos/<id>-480.webp` and `<id>-96.webp`, served by
  `GET /photos/:file` with immutable caching. The `/data` path comes from
  `dirname(DATABASE_PATH)`.
- **Deletion:** files are deleted when the item is soft-removed and the undo
  window passes, or when an offer is collected.

**Search:** pure ranking lives in `src/lib/match.ts`, and the combobox is
`AddCombobox.tsx`.

## 5. Task breakdown

### Task 14: The Enamelware pantry view: buckets, shelf-life tape, item panel, keyboard model

- **Files:**
  - `src/styles/tokens.css`, `src/styles/global.css`
  - `src/components/PantryList.tsx`, `ItemRow.tsx`, `ItemPanel.tsx`,
    `FillSlider.tsx`, `CountStepper.tsx`, `MeasureTypeSwitch.tsx`,
    `ExpiryPicker.tsx`, `ShelfLifeTape.tsx`, `BucketHeading.tsx`,
    `JumpToBucket.tsx`
  - the phone bottom bar and tab bar in `Base.astro`
  - `spec/layout/pantry-visual.test.ts`
- **Tests to write first** (browser):
  - Rows group under bucket headings in order.
  - The tape width tracks the remaining fraction, and its pattern class
    differs per bucket (a colour-independence proxy).
  - ↑/↓ moves between rows, Enter opens the panel, Esc returns focus.
  - U on a focused row marks it used.
  - The slider snaps to 5 stops with the arrow keys.
  - The Used button is one tap at PHONE.
  - Axe is clean, including contrast, now that the colours are real.
  - No overflow at 80 items.
  - Reduced motion disables the transitions.
- **Human review:** the user compares the deployed screens against the spec
  §4.1 wireframes on a phone and a desktop. **Pass:** it matches the agreed
  direction and reads as Enamelware, not generic.
- **Depends on:** Task 13.

### Task 15: Item images: icon set, category fallback, letter tile, optional photos

- **Files:**
  - `scripts/build-icons.ts`, `public/icons/*`
  - `src/components/ItemImage.tsx`, `PhotoPicker.tsx`, `PhotoViewer.tsx`
  - `src/lib/photos.ts`
  - photo endpoints
  - offers integration
  - `spec/photos.test.ts`, `spec/layout/images.test.ts`
- **Tests to write first:**
  - The resolution order: photo, then icon, then category, then letter,
    never empty.
  - An uploaded photo saved on the server has no EXIF segment (parse the
    bytes; the test uploads a JPEG with GPS EXIF through the browser
    processing path).
  - Files over 100 KB → 413.
  - Photo files are deleted when the item leaves the pantry.
  - An offer shows the item's photo.
  - A failed upload falls back to the icon with Retry and Discard.
- **Acceptance:** tests green; a typical pantry fetches only the icons it
  uses (network log in the browser test).
- **Depends on:** Task 14.

### Task 16: Add field as search combobox with match tray

- **Files:** `src/lib/match.ts` (+ test), `src/components/AddCombobox.tsx`,
  `spec/layout/search.test.ts`.
- **Tests to write first:**
  - Ranking puts prefix matches before word-start before substring, with
    ties broken by soonest expiry.
  - Enter with no active option adds a new item.
  - ↓ then Enter opens the match's panel.
  - An exact match shows the duplicate hint.
  - "Show all N matches" filters the list.
  - The ARIA combobox roles and `aria-activedescendant` are correct.
- **Acceptance:** tests green at PHONE and DESKTOP.
- **Depends on:** Task 14.

## 6. Phase Definition of Done

- [ ] Tasks 14–16 complete, each committed with `pnpm check` green
- [ ] Deployed; Task 14 human review accepted
- [ ] Tick phase 05 in overview §5

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR11–FR13 (UI), FR21, FR32 (display), NFR-A11y, NFR-Viewports, NFR-Resources (font) | Task 14 |
| FR16–FR19, NFR-Privacy (EXIF), NFR-Resources (icons) | Task 15 |
| FR20 | Task 16 |

## 8. Risks / open questions

None. Refine at phase start.

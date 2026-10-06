# Shared pantry — Phase 05b: Item images, photos and search

- **Date:** 2026-10-06 (re-planned against the code at `68f0191` on 2026-10-07)
- **Status:** Approved
- **Requirements confirmed by user:** yes — 2026-10-06; layout and the photo
  sweep (files deleted by a sweep an hour after their item leaves, so Undo keeps
  its photo) confirmed 2026-10-07
- **Part of:** `plans/2026-10-06-shared-pantry-00-overview.md`. It leans on §3
  and §4.2. The design source is spec §4.1 ("Images", "Add field as search",
  "Offer sheet", "Offers feed").
- **Depends on phases:** 05a (the row's `image` slot, the panel's `photoSlot`,
  `onOpenItem`, `pantryView.ts`), 04 (`guess-client.json` icon keys), 03 (offers).

## 1. Summary

When this phase ends every item has an image (photo → icon → category icon →
letter tile, never blank), a household can add an optional photo that is
re-encoded in the browser and checked again on the server, neighbours see the
photo on offers, photo files are cleaned up, and the add field doubles as a
search combobox with a match tray.

## 2. Requirements (this phase)

### 2.1 Functional

| FR | Part implemented here |
| --- | --- |
| FR16 | The resolution chain and the dish |
| FR17 | Photo from the panel and the offer sheet; client re-encode; the server refusal of metadata |
| FR18 | Photo carried to the offer; deleted after the item leaves (within the hour, see §4) |
| FR19 | Failed upload: icon fallback, "Photo didn't upload. Retry / Discard" |
| FR20 | In full |
| FR9 | Photo files of a deleted household, via the sweep |

### 2.2 Non-functional

| NFR | Part implemented here |
| --- | --- |
| NFR-Privacy | No EXIF/GPS in any stored photo, **enforced twice**: browser re-encode and server refusal; photo key sent only on household and offer payloads |
| NFR-Resources | Icons are separate hashed static files, fetched only when used; thumbnails in rows; 100 KB cap per size |
| NFR-A11y | ARIA 1.2 combobox, row images decorative, offer photos have alt, live match count |
| NFR-Viewports | Phone tray above the field, desktop dropdown, both checked |

### 2.3 Out of scope for this phase

Photo reporting or moderation (spec §2.2, accepted risk); photos in History
(text-only, FR18); a "Received" photo for claimed items (claimer-pantry slice
has none); the map (phase 06).

### 2.4 Assumptions

See overview §2.4, plus:
- OpenMoji graphics are CC BY-SA 4.0, attribution wording from the project's
  README, checked 2026-10-07: "All emojis designed by OpenMoji – the open-source
  emoji and icon project. License: CC BY-SA 4.0". The line-art set is
  `black/svg/<HEX>.svg` in `hfg-gmuend/openmoji`; the codepoints in §4 were
  confirmed present that day.
- An icon is shown with a CSS **mask** (`mask-image: url(icon.svg)` over a
  `--ink-muted` background), not an `<img>`. An SVG used as an image cannot
  inherit `currentColor`, and a mask recolours per theme for free. It is still a
  separate static file, fetched only when a row that uses it renders. (Spec
  wording said `loading="lazy"` images; the intent is the same.)

## 3. Existing code context (verified 2026-10-07 at `68f0191`)

- **`src/lib/items.ts`**: `Item` (see 05a §3) has no photo field; `toItem(row)`,
  `insertItem(tx, { householdId, createdBy, name, today, at? })` builds the
  row literal (all columns listed), `ItemUpdate { item: Item; offerChanges:
  OfferChange[] }`.
- **`src/lib/schema.ts`**: `items` table has `portionOf`; latest migration is
  `drizzle/0007_military_mordo.sql` (journal in `drizzle/meta`). `pnpm db:generate`
  makes the next one (`0008`).
- **`src/lib/offers.ts`**: `OfferValue { category; iconKey; measure; fillStop;
  count; exactAmount; exactUnit; estimatedExpiry; exactExpiry }` (no setter);
  `PublicOffer { id; itemName; fromName; communityIds; createdAt; value }`,
  `ClaimedOffer { …; value }`, `MyOffer`. Offer-some splits with
  `{ ...item, id, ...part, ...stamp, portionOf: item.id }` (line ~378), so a
  new item column copies to the portion by itself. `valueChangesFor(tx, itemId):
  OfferChange[]` is how a value write reaches a live offer.
- **`src/lib/testItem.ts`**: `testItem(overrides?: Partial<Item>): Item` and
  `testValue(overrides?: Partial<OfferValue>): OfferValue` build complete
  values; unit tests use them, so both gain the new field.
- **`src/lib/db.ts`**: `openDb(path)`; the app's `db` opens
  `process.env.DATABASE_PATH ?? "./.data/app.db"`. Photos live in
  `join(dirname(DATABASE_PATH), "photos")` (the Dockerfile sets
  `DATABASE_PATH=/data/app.db`, so `/data/photos`).
- **`src/lib/http.ts`**: `wantsJson`, `json(body, status?)`, `failure(asJson,
  status, message)`, `withSession(context, run)` (maps `ValidationError` 400,
  `NotFoundError` 404, `ConflictError` 409). **`src/lib/errors.ts`** has those
  classes.
- **`src/lib/requestLog.ts`**: `ACTIONS: Record<string,string>` keyed `"METHOD
  /route/[param]"` (a test fails for a POST endpoint without one);
  `isLogged(route)` skips `/stats`, `/stats.json` and `/_astro*`.
- **`src/components/OfferRow.tsx`**: `IncomingOfferRow({ row, now, onClaim })`,
  `MyOfferRow({ offer, now, onTap })`, `ClaimedOfferRow({ offer, now, onTap })`
  render `<li class="offer">` with `.offer-body`; none shows an image.
  `MyOffer` has `itemId` but no value; the pantry row has the item.
- **`src/components/OfferSheet.tsx`** (after 05a Task 24): props gain nothing
  here except a `photoSlot?: ComponentChildren` this phase adds.
- **`src/components/PantryList.tsx`** (after 05a): owns `openId`, `today`,
  `members`, the add form, `onOpenItem`.
- **`src/data/guess-client.json`**: the sixteen `iconKey` values are `milk, egg,
  cumin, bread, olive-oil, juice, yoghurt, mince, tin, frozen, biscuit, chips,
  spinach, lemon, vegemite, tofu`. Categories: `dairy, produce, grains, tins,
  meat, frozen, condiments, drinks, snacks, other`. 05a's FOODKEEPER pattern for
  a committed raw source is `scripts/data/` + `scripts/build-*.ts` writing a
  committed output.
- **Test setup:** as 05a §3. Slow browser checks go one file per task:
  `spec/layout/images.test.ts` (Task 15), `spec/layout/photos.test.ts` (Task 26),
  `spec/layout/search.test.ts` (Task 16); `spec/photos.test.ts` is HTTP-only.

### Interfaces from earlier phases (exact)

From 05a (copied from its tasks):

```ts
// src/components/pantryView.ts
export const BUCKET_LABEL: Record<Bucket, string>;
export function valueText(item: Item): string;
export function effectiveDate(item: Item): string | null;
export function localToday(now?: Date): string;
// src/components/ItemRow.tsx
export function ItemRow(props: { /* … */ image: ComponentChildren | null }): JSX.Element;
// src/components/ItemPanel.tsx
export function ItemPanel(props: { /* … */ photoSlot?: ComponentChildren }): JSX.Element;
// PantryList → children
type OpenItem = (itemId: string) => void;
// src/components/pantryState.ts
export interface Row { item: Item; pending?: { rid: string }; hidden?: boolean; note?: string;
  offer?: RowOffer; offering?: true; withdrawing?: true; saving?: { value?: Patch; expiry?: Patch } }
export type Action = /* …existing actions… */ ; // gains `photo.*` here
export function pantryReducer(state: PantryState, action: Action): PantryState;
```

and overview §4.2 plus 05a §3's `Item`, `Snapshot`, `LiveEvent` listings.

## 4. Approach

**Image resolution** (`src/components/itemImage.ts`, pure):

```ts
export type ImageSource =
  | { kind: "photo"; photoKey: string }
  | { kind: "icon"; name: string }          // an iconKey with a file
  | { kind: "category"; name: Category }
  | { kind: "letter"; letter: string };
export function imageFor(input: {
  name: string; iconKey: string | null; category: Category; photoKey: string | null;
}, hasIcon: (key: string) => boolean): ImageSource;
// photo if photoKey; else icon if iconKey and hasIcon(iconKey); else a category
// icon if the category is not "other"; else the first letter of the name
// (uppercased, \p{L}), or "?" if there is none.
```

**Icon files.** Source SVGs are committed in `scripts/data/openmoji/<HEX>.svg`
(downloaded once from `black/svg/`, never in `node_modules`), and
`scripts/build-icons.ts` copies them to `src/assets/icons/<name>.svg` by this map
(all codepoints verified present 2026-10-07). Output is committed and never
hand-edited (CLAUDE.md "Generated files"). Imported with
`import.meta.glob("../assets/icons/*.svg", { query: "?url", import: "default",
eager: true })`, so they are hashed, per-file and immutably cached under
`/_astro/`.

| name | HEX | name | HEX |
| --- | --- | --- | --- |
| `milk` | 1F95B | `category-dairy` | 1F9C0 |
| `egg` | 1F95A | `category-produce` | 1F955 |
| `cumin` | 1F9C2 | `category-grains` | 1F33E |
| `bread` | 1F35E | `category-tins` | 1F96B |
| `olive-oil` | 1FAD2 | `category-meat` | 1F356 |
| `juice` | 1F9C3 | `category-frozen` | 1F9CA |
| `yoghurt` | 1F963 | `category-condiments` | 1F9C2 |
| `mince` | 1F969 | `category-drinks` | 1F964 |
| `tin` | 1F96B | `category-snacks` | 1F36B |
| `frozen` | 1F9CA | `category-other` | 1F37D |
| `biscuit` | 1F36A | | |
| `chips` | 1F35F | | |
| `spinach` | 1F96C | | |
| `lemon` | 1F34B | | |
| `vegemite` | 1FAD9 | | |
| `tofu` | 1F9C8 | | |

A `LICENSE.md` beside the icons names OpenMoji, CC BY-SA 4.0, source URL and date.
The footer credit (Task 15) is the wording in §2.4.

**Photos.** Re-encoding happens in the browser (`photoProcess.ts`):
`createImageBitmap(file, { imageOrientation: "from-image" })`, a canvas at 480
and at 96 px on the longest side (never upscaled), `toBlob("image/webp", 0.7)`
with a JPEG fallback when the browser can't encode WebP, stepping quality down
(0.7 → 0.5 → 0.35) until each size is ≤ 100 KB. A canvas carries no metadata,
so EXIF/GPS never leaves the device. The server **does not trust that**
(`photos.ts`, below): it accepts only WebP or JPEG, each part ≤ 100 KB, and
refuses a file that carries an EXIF or XMP block.

- **Key.** `items.photo_key` (migration `0008`, nullable text) holds
  `<22 random base64url chars>.<webp|jpg>`. It is a capability: the files are
  `/data/photos/<stem>-480.<ext>` and `<stem>-96.<ext>`, served by
  `GET /photos/<stem>-<480|96>.<ext>` with no session check and `cache-control:
  public, max-age=31536000, immutable`. Replacing a photo mints a new key.
  Neighbours learn the key only from an offer's `value.photoKey`, so the privacy
  line is the same as for every other offer field.
- **Lifetime (FR18).** A sweep deletes a photo file only when **both** hold: its
  modification time is older than one hour (so an upload in flight is safe), and
  no item that is live or left the pantry within the hour has that key. The sweep
  runs at boot and every 10 minutes (an unref'd timer). Consequences: Undo keeps
  the photo; a portion shares its original's key and the sweep sees that; a
  collected or deleted item, a deleted household and a replaced photo are all
  cleaned up by the same rule, up to ~70 minutes later. This refines FR18
  ("when the item leaves the pantry") and FR9; it is recorded in **ADR 0007**
  (new, `proposed`; ADR 0003 is accepted and is never edited).
- **Offers.** `OfferValue` gains `photoKey: string | null`; neighbours' rows and
  the claimer's rows show the photo (96 px file at 64 px) or the icon dish.

**Search** (`src/lib/match.ts`, pure, no node imports):

```ts
export interface Match { item: Item; rank: 0 | 1 | 2; ranges: [number, number][] }
// rank 0 prefix of the name, 1 prefix of a later word, 2 substring; matched
// ranges are [start, end) offsets in item.name for underlining.
export function rankMatches(items: Item[], query: string): Match[];
// ties: sooner effectiveDate first (no date last), then name A–Z; empty query → []
export function exactMatch(items: Item[], query: string): Item | null;
// case-insensitive, trimmed, equal to an item's whole name
```

## 5. Task breakdown

### Task 15: Item images: icon files, the resolution chain, letter tile

- [ ] Not started

- **Description:** Every pantry row shows an image in its dish: the icon for the
  item's icon key, else its category's icon, else a letter tile. Only icons
  actually used on the page are fetched. The footer credits OpenMoji.
- **Files:**
  - `scripts/build-icons.ts` (new), `scripts/data/openmoji/*.svg` (23 source
    files, one per distinct HEX), `src/assets/icons/*.svg` (generated),
    `src/assets/icons/LICENSE.md`
  - `src/components/itemImage.ts` + `itemImage.test.ts`, `icons.ts` (new:
    `export const ICON_URLS: Record<string, string>` from the glob and
    `export const hasIcon = (key: string) => key in ICON_URLS`)
  - `src/components/ItemImage.tsx` (new): `ItemImage({ item, photoKey?: string | null,
    size?: "row" | "offer" })`; the pantry row passes it as `ItemRow`'s `image`
  - `src/components/icons.test.ts` (new, unit, reads files with `node:fs`)
  - `src/styles/dish.css` (new)
  - `src/layouts/Base.astro`: footer credit
  - `spec/layout/images.test.ts` (new)
- **Tests to write first (red):**
  - `itemImage.test.ts`: a photo key wins over everything; an icon key with a
    file gives `icon`; an icon key **without** a file falls to the category; category
    `other` with no icon gives `letter`; letter is the uppercased first letter
    (`"za'atar"` → `Z`, `"éclair"` → `É`, `"123"` → `?`).
  - `icons.test.ts`: every `iconKey` in `src/data/guess-client.json` and every
    `category-<name>` for the ten categories has a file in `src/assets/icons/`
    (the contract with Task 12's table: renaming a key breaks this test); each file
    is valid-looking SVG (starts with `<svg`), ≤ 6 000 bytes, has no `<script`, no
    `href=` to a remote URL; the generated files equal what `build-icons.ts` produces
    from `scripts/data/openmoji` (so no hand edits).
  - `spec/layout/images.test.ts` (browser): items created over HTTP — `milk`
    (icon), `tofu` is an icon too, `rice` (category `grains`), `mystery` (letter) —
    show, in the row dish: `milk` a mask whose `mask-image` URL ends in a hashed
    `.svg`; `rice` the grains icon; `mystery` a tile reading `M`. The dish is a
    44 px circle (48 px at DESKTOP) with a 1.5 px `--line` border and **never** a
    `--rim` colour; images are `aria-hidden` (axe clean); no row's height changes
    when the icon loads (measure before and after `networkidle`). Network log: on
    a pantry of milk, egg, rice and mystery the page requests **only** the `milk`,
    `egg` and `category-grains` icon files (assert the set of `/_astro/*.svg`
    requests). The footer contains the OpenMoji credit with a link to
    `https://openmoji.org/` and "CC BY-SA 4.0". Axe clean in light and dark at both
    viewports, with contrast.
- **Implementation (green):** unit files, then the script (download the 23 source
  SVGs once with `curl` into `scripts/data/openmoji/`, commit them; the script
  only copies and checks), then the component and CSS (`mask-image` over
  `background: var(--ink-muted)`, `mask-size: 60%`, `mask-position: center`, no repeat).
- **Refactor:** none.
- **Acceptance:**
  - [ ] Tests above pass; every existing browser spec passes
  - [ ] Icons total under 80 KB on disk (`du` of `src/assets/icons`)
  - [ ] `pnpm check` green
- **Human review:** the user looks at the icons in the local build with a dozen
  mixed items, light and dark. **Pass:** the monochrome set reads clearly, is
  not mistaken for state colour, and the credit wording is acceptable; explicit yes.
- **Depends on:** none in this phase (needs 05a).
- **Corrections log:** *(empty at plan time)*

### Task 26: Optional photos: processing, upload, storage, sweep, offers

- [ ] Not started

- **Description:** From the open panel or the offer sheet a member can add a
  photo (camera or library). The browser shrinks it; the server stores it and
  refuses anything carrying metadata. The photo shows in the row, follows the
  item to its offer and shows to neighbours; a failed upload says so and offers
  Retry or Discard. Files are cleaned up by the sweep.
- **Files:**
  - `src/lib/schema.ts` + `drizzle/0008_*.sql` (generated): `items.photoKey`
    `text("photo_key")`
  - `src/lib/items.ts`: `Item` gains `photoKey: string | null`; `toItem` and
    `insertItem` (null) updated; `src/lib/testItem.ts`: `photoKey: null`; the
    `add.pending` item in `pantryState.ts` gets `photoKey: null`
  - `src/lib/photos.ts` + `photos.test.ts` (new, signatures below);
    `src/lib/errors.ts` + `src/lib/http.ts`: `PayloadTooLargeError`, and
    `statusOf` maps it to 413
  - `src/lib/offers.ts`: `OfferValue` gains `photoKey: string | null`, set in `offerColumns`
    (`items.photoKey`) and `offerValueOf`; `testValue` gains `photoKey: null`; `src/lib/offerEvents.test.ts`
    cases that list `OfferValue` keys gain it
  - `src/pages/items/[id]/photo.ts`, `src/pages/items/[id]/photo/remove.ts`,
    `src/pages/photos/[file].ts` (new, thin)
  - `src/lib/requestLog.ts`: `ACTIONS` gains `"POST /items/[id]/photo"` →
    `"item.photo"`, `"POST /items/[id]/photo/remove"` → `"item.photo-remove"`;
    `isLogged` also skips routes starting `/photos/`
  - `src/lib/photoSweep.ts` (new) started once from `src/middleware.ts`'s module
    scope (import side effect guarded so tests don't start it); `doc/adr/0007-photo-files-swept-after-an-hour.md`
    (new, `proposed`); `CLAUDE.md` (one bullet: photo bytes enter only through
    `photos.ts`, which refuses metadata; the key is a capability and travels only on
    household and offer payloads)
  - `src/components/photoProcess.ts` + `photoProcess.test.ts`, `PhotoPicker.tsx`,
    `PhotoViewer.tsx` (new); `ItemPanel`'s `photoSlot` and `OfferSheet`'s new
    `photoSlot` get the picker; `ItemImage` gains the photo branch
  - `src/components/OfferRow.tsx`, `OffersFeed.tsx`: a 64 px image column
  - `src/components/pantryState.ts`: row field `photo?: { status: "uploading" |
    "failed"; preview: string }`; actions `photo.pending | photo.failed |
    photo.confirmed | photo.discarded`
  - `spec/photos.test.ts` (HTTP), `spec/layout/photos.test.ts` (browser),
    `spec/privacy.test.ts` (extend)
- **Interfaces:**

  ```ts
  // src/lib/photos.ts
  export const MAX_PHOTO_BYTES = 100_000;
  export const photoDir = (): string; // join(dirname(DATABASE_PATH ?? "./.data/app.db"), "photos")
  export function photoFileName(photoKey: string, size: 480 | 96): string; // "<stem>-480.webp"
  export function checkPhoto(bytes: Uint8Array): "webp" | "jpg";
  // throws ValidationError when: not WebP (RIFF…WEBP) or JPEG (FFD8FF); over MAX_PHOTO_BYTES
  // (a different `PayloadTooLargeError`, 413); a JPEG APP1 segment starting "Exif\0\0" or
  // "http://ns.adobe.com/xap"; a WebP chunk with FourCC "EXIF" or "XMP "
  export function savePhoto(
    db: Db, session: Session, itemId: string,
    files: { large: Uint8Array; small: Uint8Array }, dir?: string,
  ): ItemUpdate; // NotFoundError for another household's or a removed item; mints a key; offerChanges from valueChangesFor
  export function removePhoto(db: Db, session: Session, itemId: string): ItemUpdate;
  export function sweepPhotos(db: Db, dir: string, now?: number, graceMs?: number): number; // files deleted
  // src/lib/errors.ts gains: export class PayloadTooLargeError extends Error {}  (withSession maps it to 413)

  // src/components/photoProcess.ts
  export function fitWithin(width: number, height: number, longest: number): { width: number; height: number }; // never upscales
  export function processPhoto(file: Blob): Promise<{ large: Blob; small: Blob; type: "image/webp" | "image/jpeg" }>;
  ```

  Endpoints: `POST /items/:id/photo` — `multipart/form-data` with file parts
  `large` and `small`; refuse with 413 when `Content-Length` > 250 000 **before**
  reading the body; 400 for a bad type or metadata; 404 for another household's,
  removed or unknown item; 200 `{ item }`; publishes `item.updated` (household)
  and the offer events from `offerChanges`. `POST /items/:id/photo/remove` — 200
  `{ item }` with `photoKey: null`. `GET /photos/:file` — `file` must match
  `^[A-Za-z0-9_-]{22}-(480|96)\.(webp|jpg)$`, else 404; 200 with the right
  `content-type`, `x-content-type-options: nosniff`, the immutable cache header;
  404 when the file is gone.
- **Tests to write first (red):**
  - `photos.test.ts` (unit, in-memory db, a temp dir): `checkPhoto` accepts a
    minimal WebP and a minimal JPEG (built in the test as byte arrays), refuses a
    GIF, an oversize file (413 class), a JPEG with an APP1 `Exif` segment, a JPEG
    with XMP, a WebP with an `EXIF` chunk and one with `XMP `; `savePhoto` writes
    both files, sets `photoKey` with the right extension and returns the item;
    another household's item and a removed item are `NotFoundError` and write
    nothing; replacing mints a different key and the old files remain until the
    sweep; `removePhoto` clears the key; with an open offer, `savePhoto` returns
    an `offerChanges` entry of kind `valued` whose `value.photoKey` is the new key.
    **Sweep** (inject `now`, set mtimes with `utimes`): a file older than the grace
    whose key no item references is deleted; the same file referenced by a live
    item is kept; referenced by an item removed 30 min ago is kept, removed 2 h ago
    is deleted; a fresh unreferenced file (mtime now) is kept; a portion and its
    original sharing a key keep the file while either is live; an item row deleted
    by cascade leaves its file to be deleted; returns the count; ignores files that
    don't match the name pattern.
  - `photoProcess.test.ts`: `fitWithin(4000, 3000, 480)` is 480×360; `(300, 200,
    480)` unchanged; `(3000, 4000, 96)` is 72×96.
  - `pantryState.test.ts` (extend): `photo.pending` marks the row uploading with a
    preview; `photo.confirmed` with an item clears it and takes the key;
    `photo.failed` keeps the preview and `failed` status; `photo.discarded` clears
    it; an `event.updated` carrying a `photoKey` shows it.
  - `spec/photos.test.ts` (HTTP): upload of a valid tiny WebP to your item → 200,
    the item has a `photoKey`, `GET /photos/<file>` returns the same bytes with the
    immutable header and no cookie needed; 413 for a 120 000-byte part and for a
    `Content-Length` of 300 000 (no body read); 400 for a JPEG with EXIF GPS; 404
    for another household's item; with an offer open in a shared community the
    neighbour's `/api/offers` row has `value.photoKey` and **no** `itemId`; a
    household not in the community cannot see the key; **privacy sweep:** the
    uploader's own `/api/pantry` has the key, the offer payload to a neighbour
    contains no `valueSetBy`, `createdBy` or member name (extend the existing
    `privacy.test.ts` sweep with the new field).
  - `spec/layout/photos.test.ts` (browser): the **EXIF-through-the-browser-path**
    check — in the page, draw a canvas to a JPEG blob, splice an APP1 `Exif`
    segment with GPS-looking bytes after the SOI in Node, set it on the panel's
    file input; after the upload completes, fetch `GET /photos/<stem>-480.*` and
    assert the stored bytes contain no `Exif` and no `FFE1` marker, and decode to
    ≤ 480 px on the longest side; (b) the row shows the photo (full colour, an
    `<img>` with `alt=""`) and a closed-panel row keeps its height; (c) uploading
    state: with the route delayed, the dish shows the preview at 60 % opacity and
    "Uploading photo…"; (d) a failing upload (route aborted) shows the icon and
    "Photo didn't upload." with Retry (works) and Discard (clears); after reload
    the photo is gone; (e) offering an item with a photo: the neighbour's feed row
    has an `<img>` whose `src` is `/photos/…-96.…` and whose `alt` names the item;
    tapping it opens a viewer dialog with the 480 image; Esc closes; (f) the offer
    sheet shows the photo and "Change photo", or "Add a photo" and "Optional;
    neighbours like to see it."; (g) discarding a photo falls back to the icon;
    (h) axe clean with the panel, viewer and sheet open, both viewports.
- **Implementation (green):** schema and migration first (`pnpm db:generate`;
  take a copy of `.data/app.db` before the first run, as in phase 04's note), then
  `photos.ts`, the endpoints, the sweep, then the client. Parse multipart with
  `request.formData()` after the length check. Write files to a temp name and
  `rename`, then update the row; on a DB failure delete the files. `ItemImage`'s
  photo branch is an `<img src="/photos/<stem>-96.<ext>" alt="" loading="lazy">` in
  the dish (`object-fit: cover`); offer rows use the same with an `alt` of
  `Photo of <item name>`. The picker is `<input type="file" accept="image/*">`
  (no `capture`, so phones offer camera and library); it is never shown after an
  add, only inside the panel and sheet.
- **Refactor:** none.
- **Acceptance:**
  - [ ] Tests above pass; every existing spec passes; migration `0008` applies
        over a copy of the existing volume file (`migrations.test.ts` extended with a
        pre-existing row)
  - [ ] No endpoint or log line carries a photo, key or body (`log.test.ts`
        privacy cases still pass; a new case asserts `/items/[id]/photo` logs only
        the action)
  - [ ] ADR 0007 written as `proposed`; CLAUDE.md bullet added
  - [ ] `pnpm check` green
- **Human review:** the user adds a photo from a real phone (camera and library)
  to the local build over the LAN, offers the item, and views it from a second
  household. **Pass:** the flow feels optional and quick, the photo is small and
  sharp enough, and the user flips ADR 0007 to `accepted` or says what to change.
- **Depends on:** Task 15, Task 24 (05a).
- **Corrections log:** *(empty at plan time)*

### Task 16: The add field as a search combobox with a match tray

- [ ] Not started

- **Description:** Typing in the add field opens a tray of matching pantry
  items. Plain Enter always adds a new item; ↓ then Enter opens a match's panel in
  place; an exact name match says so without blocking; "Show all N matches"
  filters the list.
- **Files:**
  - `src/lib/match.ts` + `match.test.ts` (new, §4)
  - `src/components/AddCombobox.tsx`, `MatchTray.tsx` (new); `PantryList.tsx`
    replaces its inline add form with `AddCombobox` and gains `filter` state and
    `onOpenItem`
  - `src/styles/search.css` (new)
  - `spec/layout/search.test.ts` (new)
- **Interfaces:**

  ```ts
  // src/components/AddCombobox.tsx
  export function AddCombobox(props: {
    rows: Row[];                       // the visible rows, for matching
    today: string;
    autoFocus: boolean;                // true for an empty pantry
    addError?: string;
    onAdd: (name: string) => void;     // today's `add`
    onOpenItem: (itemId: string) => void;
    onShowAll: (query: string) => void;
  }): JSX.Element;
  ```

  The form stays `<form method="post" action="/items">` with `<label
  for="name">Add an item</label>` and `<input id="name" name="name">` (existing
  specs use `getByLabel("Add an item")`); the placeholder is `Add or find an
  item…`.
- **Tests to write first (red):**
  - `match.test.ts`: rank 0/1/2 for `mil` against `Milk`, `Oat milk`, `Almond
    milk`... (`Milk` 0, `Oat milk` 1, `Buttermilk` 2); ranges for underlining
    (`mil` in `Milk` is `[0,3]`; case-insensitive); ties by soonest effective date,
    no date last, then name; empty and whitespace queries give `[]`; `exactMatch`
    is case-insensitive and trimmed, and `Milk` does not exactly match `Milk, oat`.
  - `spec/layout/search.test.ts` (browser, PHONE and DESKTOP): (a) typing `mil`
    opens a tray listing matches in rank order with matched letters underlined
    (a `<u>` or `text-decoration` span), the header `2 in your pantry`, and **no**
    option active (`aria-activedescendant` empty), so Enter adds `mil` as a new item
    and the tray closes; (b) ↓ activates the first match (`aria-activedescendant`
    names it), ↓ again the second, ↑ back; Enter on an active match opens that item's
    panel in place, clears the field, closes the tray, and focus is inside the
    panel; no add request is made; (c) first Esc closes the tray and keeps the text,
    second clears it; Tab leaves with the tray closed; (d) typing exactly `Milk`
    shows "You already have Milk. Enter adds another (e.g. a second carton)." and
    Enter adds a second Milk; (e) with 6 matches the tray shows 4 and a "Show all 6
    matches" control that filters the main list to those 6 with a visible "Showing 6
    of N. Clear" line; Clear restores; (f) ARIA: the input has `role="combobox"`,
    `aria-expanded`, `aria-controls` to a `role="listbox"` of `role="option"`s,
    `aria-autocomplete="list"`; the live region (debounced 400 ms) says "2 matches.
    Down arrow to choose one, Enter adds a new item."; (g) at PHONE the tray sits
    above the field and the list behind is dimmed; at DESKTOP it is a 480 px
    dropdown below the field; neither causes horizontal overflow; (h) axe clean with
    the tray open, light and dark.
- **Implementation (green):** `match.ts` first. The tray reads `rows` through the
  existing `visibleRows`; matching ignores held-back rows (05a's `stableOrder`
  output is what `PantryList` passes). `onOpenItem` is 05a's handle. Debounce the
  live region only, never the tray. The filter state lives in `PantryList`; while it
  is set the groups are computed from the matching rows only.
- **Refactor:** delete the old inline add form.
- **Acceptance:**
  - [ ] Tests above pass at both viewports; every existing browser spec passes
        (`getByLabel("Add an item")` still resolves, the empty pantry still focuses it)
  - [ ] `pnpm check` green
- **Human review:** the user searches a pantry of ~30 items on phone and desktop
  in the local build. **Pass:** the tray feels like help, never like a barrier
  to adding; explicit yes.
- **Depends on:** Task 15 (rows show images; the tray reuses `ItemImage`), Task 24 (05a).
- **Corrections log:** *(empty at plan time)*

## 6. Phase Definition of Done

- [ ] Tasks 15, 26, 16 complete, each committed with `pnpm check` green
- [ ] `pnpm build && pnpm start &` then `pnpm test` passes (app running)
- [ ] Human review accepted by the user for Tasks 15, 26 and 16; ADR 0007
      accepted (or revised) in Task 26's commit
- [ ] After the deploy: migration `0008` applied over the volume (`flyctl logs`
      shows no migration error), a photo uploaded on the live app is served from
      `/photos/…` and survives `flyctl machine restart`, and `APP_URL=https://comp4020-final-attwelvedev.fly.dev
      pnpm vitest run --project spec spec/photos.test.ts` is green
- [ ] README: the user adds the OpenMoji credit and the photo and search claims
      (agent only points out what is now enforced in `spec/`)
- [ ] Tick phase 05b in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR16 | Task 15 |
| FR17 (client re-encode, server refusal) | Task 26 |
| FR18 (lifetime, offer carry-over) | Task 26 (sweep, `OfferValue.photoKey`) |
| FR19 | Task 26 |
| FR20 | Task 16 |
| FR9 (photo files of a deleted household) | Task 26 (sweep) |
| NFR-Privacy (EXIF, key scope) | Task 26 |
| NFR-Resources (icons, thumbnails) | Task 15, Task 26 |
| NFR-A11y (combobox, alt, announcements) | Task 16, Task 26 |
| NFR-Viewports | Tasks 15, 26, 16 |

## 8. Risks / open questions

None. Notes the executor must not lose:

- **A new `Item` or `OfferValue` field breaks every literal.** Search for object
  literals of both (`rg "valueSetAt: null"` and `rg "exactExpiry: null"`) and add
  `photoKey: null`; `pnpm typecheck` finds the rest.
- **Migrations run on the live volume at boot:** `0008` adds one nullable column.
  Copy `.data/app.db` before the first local run.
- **The sweep must never run in unit tests of other modules:** it is started from
  `middleware.ts`, not from `db.ts`.
- **`/photos/` is a public capability URL** by design (spec §4: neighbours see the
  photo); do not add the key to any payload other than the household's items and
  offer values.
- **Mask icons need a same-origin URL:** if `import.meta.glob` URLs are not hashed
  under `/_astro/` in `astro build`, stop and check `astro.config.ts` before
  adding anything to `public/`.
- **Do not edit ADR 0003** (accepted); ADR 0007 supersedes only the "deleted when
  the item leaves" timing.

# FoodKeeper data

The guesser behind `src/lib/guess.ts` is built from the USDA FSIS FoodKeeper
data.

- **Source:** `http://www.fsis.usda.gov/shared/data/EN/foodkeeper.json`
  (`FMA-Data-v128.xlsx`, data version 108). The Data.gov record is
  `https://catalog.data.gov/dataset/fsis-foodkeeper-data`.
- **Retrieved:** 2026-10-07, with a real (headed) Chrome: the site answers
  plain `curl` with 403 Access Denied. Saved as
  `scripts/data/foodkeeper-en.json` (632 KB, sha256
  `037df0d301126acd8a48824506f04d49d8be1a1144b81fa69e4170228dc2e91a`).
- **Licence:** CC0 1.0 (public domain dedication). The Data.gov record's
  licence field is `https://creativecommons.org/publicdomain/zero/1.0/`, checked
  2026-10-07, with no attribution or other condition.

## What the build reads

The file is `{ fileName, sheets: [{ name, data }] }`; each `data` row is an
array of one-key objects. Only these sheets and columns are read, all in
`buildTable` (`src/lib/foodkeeperTable.ts`):

| Sheet | Columns |
| --- | --- |
| `Category` | `ID`, `Category_Name` |
| `Product` | `Category_ID`, `Name`, and for each of `Pantry`, `Refrigerate`, `Freeze`: `<place>_Min`, `<place>_Max`, `<place>_Metric`, plus the same three under the `DOP_` prefix (from date of purchase) |

`Metric` values that become days: `Days`, `Weeks` (x7), `Months` (x30), `Year`
and `Years` (x365); `Hours` becomes one day. `Indefinitely`, `Not Recommended`,
`When Ripe`, `Package use-by date` and a missing value give no shelf life.
`Keywords` is not read: it holds modifiers such as "ground" and "dried" that
would make "ground cinnamon" a beef.

## Rebuilding

`node scripts/build-foodkeeper.ts` writes `foodkeeper.json` and
`guess-client.json` here, from the raw file and `keyword-overrides.json`.
Running it again on the same inputs writes identical files.
`node scripts/guess-sample.ts` prints a spread of guesses to read.

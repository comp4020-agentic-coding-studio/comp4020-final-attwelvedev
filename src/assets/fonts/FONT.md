Archivo (variable, wght 100–900 and wdth 62–125 in the source), SIL OFL 1.1, from Omnibus-Type/Archivo, fetched 2026-10-08.
Trimmed to wght 400–900 and wdth 62–125 and subset by `scripts/build-font.ts` to U+0020–007E, U+2013–2014, U+2018–201D, U+2026, U+2212, with only the `tnum` feature: 40,764 bytes. `spec/font.test.ts` caps it at 45,000.
Latin-1 is deliberately left out (it takes the file to ~66 KB), so an accented nickname falls back to the system font. Arrows and the tick come from the system too.

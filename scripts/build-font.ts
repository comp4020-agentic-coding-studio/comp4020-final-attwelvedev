#!/usr/bin/env node
// Subsets Archivo (variable, wght + wdth) to ASCII and writes the self-hosted woff2.
//   node scripts/build-font.ts <path to Archivo[wdth,wght].ttf>
// Needs fonttools and brotli (`pip install fonttools brotli`): build-time tools
// that run once, not dependencies. The output is committed; download the TTF
// to a temp directory, never into the repo.
import { execFileSync } from "node:child_process";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const input = process.argv[2];
if (!input) {
  console.error("usage: node scripts/build-font.ts <Archivo[wdth,wght].ttf>");
  process.exit(1);
}

const output = new URL("../src/assets/fonts/archivo-ascii.woff2", import.meta.url).pathname;

// Basic Latin, dashes, quotes, ellipsis and the minus sign. Latin-1 is left to
// the system font: it more than doubles the file (accents are composites that
// each carry their own variation data) and spec/font.test.ts caps it at 45 KB.
const UNICODES = ["U+0020-007E", "U+2013-2014", "U+2018-201D", "U+2026", "U+2212"].join(",");

try {
  // Weights below 400 and widths outside 62-125 are never used; trimming the
  // axes is most of the saving. Both axes stay variable.
  const trimmed = join(mkdtempSync(join(tmpdir(), "archivo-")), "trimmed.ttf");
  execFileSync(
    "python3",
    ["-m", "fontTools.varLib.instancer", input, "wght=400:900", "wdth=62:125", "-o", trimmed],
    { stdio: "inherit" },
  );
  // tnum only: timers and codes line up. Kerning costs ~3 KB and is not worth it.
  execFileSync(
    "pyftsubset",
    [
      trimmed,
      `--unicodes=${UNICODES}`,
      "--flavor=woff2",
      `--output-file=${output}`,
      "--layout-features=tnum",
      "--no-hinting",
    ],
    { stdio: "inherit" },
  );
} catch (error) {
  console.error("font build failed: is fonttools installed, with brotli?", error);
  process.exit(1);
}

console.log(`${output}: ${statSync(output).size} bytes`);

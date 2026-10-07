#!/usr/bin/env node
// Subsets Atkinson Hyperlegible Next to Latin and writes the self-hosted woff2.
//   node scripts/build-font.ts <path to AtkinsonHyperlegibleNext[wght].ttf>
// Needs fonttools and brotli (`pip install fonttools brotli`): build-time tools
// that run once, not dependencies. The output is committed; download the TTF
// to a temp directory, never into the repo.
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";

const input = process.argv[2];
if (!input) {
  console.error("usage: node scripts/build-font.ts <AtkinsonHyperlegibleNext[wght].ttf>");
  process.exit(1);
}

const output = new URL(
  "../src/assets/fonts/atkinson-hyperlegible-next-latin.woff2",
  import.meta.url,
).pathname;

// Basic Latin, Latin-1 (¼ ½ ¾ live here), dashes, quotes, ellipsis, tick, the
// minus sign for the stepper and the arrows the footer help line uses.
const UNICODES = [
  "U+0020-007E",
  "U+00A0-00FF",
  "U+2013-2014",
  "U+2018-201D",
  "U+2026",
  "U+2190-2193",
  "U+2212",
  "U+2713",
].join(",");

try {
  execFileSync(
    "pyftsubset",
    [
      input,
      `--unicodes=${UNICODES}`,
      "--flavor=woff2",
      `--output-file=${output}`,
      "--layout-features=*",
      "--no-hinting",
    ],
    { stdio: "inherit" },
  );
} catch (error) {
  console.error("pyftsubset failed: is fonttools installed, with brotli?", error);
  process.exit(1);
}

console.log(`${output}: ${statSync(output).size} bytes`);

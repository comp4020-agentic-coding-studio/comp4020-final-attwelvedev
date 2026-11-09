// Regenerates public/favicon-32.png from public/favicon.svg: loads the SVG in headless Chromium
// (the playwright already in devDependencies; the machine has no rsvg-convert or ImageMagick) and
// writes a 32 px screenshot with a transparent background. Run: node scripts/favicon-png.ts
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const svg = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 32, height: 32 }, deviceScaleFactor: 1 });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:32px;height:32px}</style>${svg}`,
  );
  const png = await page.screenshot({
    omitBackground: true,
    clip: { x: 0, y: 0, width: 32, height: 32 },
  });
  writeFileSync(new URL("../public/favicon-32.png", import.meta.url), png);
  console.log(`favicon-32.png: ${png.length} bytes`);
} finally {
  await browser.close();
}

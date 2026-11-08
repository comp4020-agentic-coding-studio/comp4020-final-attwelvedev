// The proxy gate for the screenshot review (ADR 0028): does the model endpoint
// take an image? One screenshot of the home page at 1280 x 800, then five
// sequential calls that each carry it. Prints each reply, its usage and latency;
// exits non-zero on any API error.
//
//   node scripts/playtest/probe.ts        (the app running at APP_URL)
//
// The SDK reads ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL
// from the environment; no key lives in the repo.
import Anthropic from "@anthropic-ai/sdk";
import { DESKTOP, launch, openPage } from "../../spec/browser.ts";

const CALLS = 5;
const baseUrl = process.env.APP_URL ?? "http://localhost:8080";
const model = process.env.PLAYTEST_MODEL ?? process.env.ANTHROPIC_MODEL;
if (!model) {
  console.error("Set PLAYTEST_MODEL or ANTHROPIC_MODEL.");
  process.exit(1);
}

const browser = await launch();
let png: Buffer;
try {
  const page = await openPage(browser, baseUrl, DESKTOP);
  png = await page.screenshot();
} finally {
  await browser.close();
}

const client = new Anthropic();
for (let i = 1; i <= CALLS; i++) {
  const started = Date.now();
  try {
    const reply = await client.messages.create({
      model,
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: png.toString("base64") },
            },
            { type: "text", text: "In one line, what is the page's main heading?" },
          ],
        },
      ],
    });
    const text = reply.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    console.log(
      `${i}/${CALLS} ${Date.now() - started} ms  in=${reply.usage.input_tokens} out=${reply.usage.output_tokens}  ${text.trim()}`,
    );
  } catch (error) {
    console.error(`${i}/${CALLS} failed after ${Date.now() - started} ms:`, error);
    process.exit(1);
  }
}

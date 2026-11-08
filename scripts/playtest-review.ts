// The screenshot review of a finished `pnpm playtest` run (ADR 0028). Offline: no browser.
//
//   pnpm playtest:review <run> [--room NN] [--model ID] [--yes]
//
// Without --yes it prints the estimate and exits 2 having made no call. The SDK reads
// ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL from the environment.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { parseRoom } from "../src/game/rooms/format.ts";
import { askOne } from "./playtest/review/ask.ts";
import { collect } from "./playtest/review/collect.ts";
import { estimate, tally } from "./playtest/review/cost.ts";
import { type Answered, type Intents, renderReview } from "./playtest/review/html.ts";

const CONCURRENCY = 3;

interface Flags {
  run: string;
  room?: string;
  model?: string;
  yes: boolean;
}

function parseFlags(argv: string[]): Flags {
  const out: Flags = { run: "", yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === "--yes") out.yes = true;
    else if (a === "--room") out.room = argv[++i];
    else if (a === "--model") out.model = argv[++i];
    else if (a.startsWith("--")) throw new Error(`unknown flag ${a}`);
    else out.run = a;
  }
  return out;
}

function listFiles(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory()
      ? listFiles(join(dir, d.name), base)
      : [relative(base, join(dir, d.name)).split("\\").join("/")],
  );
}

// Beat 1..n by position; "start" has none. Read for the report only, never sent to the model.
function intentsOf(rooms: string[]): Intents {
  const out: Intents = {};
  for (const id of rooms) {
    const file = join("rooms", `${id}.room`);
    if (!existsSync(file)) continue;
    const room = parseRoom(readFileSync(file, "utf8"));
    out[id] = Object.fromEntries(room.beats.map((b, i) => [String(i + 1), b.intent]));
  }
  return out;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (!flags.run) {
    console.error("usage: pnpm playtest:review <run> [--room NN] [--model ID] [--yes]");
    process.exit(1);
  }
  const dir = existsSync(flags.run) ? resolve(flags.run) : resolve("review", "playtest", flags.run);
  if (!existsSync(join(dir, "run.json"))) {
    console.error(`no run.json in ${dir}`);
    process.exit(1);
  }
  const model = flags.model ?? process.env.PLAYTEST_MODEL ?? process.env.ANTHROPIC_MODEL;
  if (!model) {
    console.error("Set --model, PLAYTEST_MODEL or ANTHROPIC_MODEL.");
    process.exit(1);
  }
  const items = collect(listFiles(dir), (p) => readFileSync(join(dir, p), "utf8"), flags.room);
  const est = estimate(items, model);
  console.log(`${items.length} items, model ${model}, estimated: ${est.text}`);
  if (!flags.yes) {
    console.log("No call made. Add --yes to spend it.");
    process.exit(2);
  }

  const client = new Anthropic();
  const answered: Answered[] = [];
  const usages: Awaited<ReturnType<typeof askOne>>["usage"][] = [];
  let next = 0;
  let errors = 0;
  const started = Date.now();
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) {
      const item = items[i] as (typeof items)[number];
      // the item's screenshot path is relative to the run; the request reads it from there
      const abs = item.screenshot ? { screenshot: join(dir, item.screenshot) } : {};
      const r = await askOne(client, { ...item, ...abs }, model);
      usages.push(r.usage);
      if (r.error) errors++;
      answered[i] = { item, answer: r.answer, error: r.error };
      process.stdout.write(`\r${usages.length}/${items.length}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const t = tally(usages, model, errors);
  const rooms = [...new Set(items.map((i) => i.room))];
  writeFileSync(join(dir, "review.html"), renderReview(answered, intentsOf(rooms), t));
  const cost = t.usd === null ? "unknown" : `$${t.usd.toFixed(4)}`;
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(
    `\n${t.calls} calls, ${t.errors} errors, ${t.input} in, ${t.cacheRead} cached, ${t.cacheWrite} written, ${t.output} out, cost ${cost}, ${secs} s`,
  );
  console.log(`wrote ${join(dir, "review.html")}`);
}

await main();

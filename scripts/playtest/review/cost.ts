import type { Usage } from "./ask.ts";
import type { ReviewItem } from "./collect.ts";

// $ per million tokens. Cache writes cost 1.25 x input.
export const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
};

// Per-call token constants (overview §4.4), set from the measured room in Task 131.
export const TOKENS = {
  prefix: 1500, // the cached system prefix: role and prior knowledge
  image1280: 1400, // w x h / 750
  image375: 400,
  text: 1500, // the perceived text
  output: 500, // including thinking at effort low
};

export interface Estimate {
  calls: number;
  usd: number | null; // null: unknown price
  text: string;
}

export function estimate(items: ReviewItem[], model: string): Estimate {
  const price = PRICES[model];
  if (!price) {
    return {
      calls: items.length,
      usd: null,
      text: `${items.length} calls, unknown price for ${model}`,
    };
  }
  let usd = 0;
  for (const item of items) {
    const image =
      item.role === "blind" ? 0 : item.width >= 1000 ? TOKENS.image1280 : TOKENS.image375;
    usd +=
      (TOKENS.prefix * price.cacheRead +
        (image + TOKENS.text) * price.input +
        TOKENS.output * price.output) /
      1e6;
  }
  return {
    calls: items.length,
    usd,
    text: `${items.length} calls, about $${usd.toFixed(3)} on ${model}`,
  };
}

export interface Tally {
  calls: number;
  errors: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  usd: number | null;
}

export function tally(usages: Usage[], model: string, errors = 0): Tally {
  const sum = { calls: usages.length, errors, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  for (const u of usages) {
    sum.input += u.input;
    sum.output += u.output;
    sum.cacheRead += u.cacheRead;
    sum.cacheWrite += u.cacheWrite;
  }
  const price = PRICES[model];
  const usd = price
    ? (sum.input * price.input +
        sum.output * price.output +
        sum.cacheRead * price.cacheRead +
        sum.cacheWrite * price.input * 1.25) /
      1e6
    : null;
  return { ...sum, usd };
}

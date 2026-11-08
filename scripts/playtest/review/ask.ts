import { readFileSync } from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";
import { ROLE_LABEL } from "../../../src/game/types.ts";
import type { ReviewItem } from "./collect.ts";

export interface ReviewAnswer {
  findings: {
    kind: "unreadable" | "misleading" | "missing" | "unclear-next";
    what: string;
    where: string;
  }[];
  next: string;
}

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["unreadable", "misleading", "missing", "unclear-next"] },
          what: { type: "string" },
          where: { type: "string" },
        },
        required: ["kind", "what", "where"],
        additionalProperties: false,
      },
    },
    next: { type: "string" },
  },
  required: ["findings", "next"],
  additionalProperties: false,
};

export const MAX_TOKENS = 1500;

// The request for one beat (FR9 to FR11). Only what that player perceived goes in: never the beat's
// intent, the view, the room's id or its design data.
export function requestFor(
  item: ReviewItem,
  model: string,
  readPng: (path: string) => Buffer = readFileSync,
): MessageCreateParamsNonStreaming {
  const system = `You are playing a browser game for the first time, with two teammates on their own devices. Your role is ${ROLE_LABEL[item.role]}. Your team's goal is to clear each room. Below is what you were shown before play. You will be shown your screen at one moment. Say plainly what you cannot read or make out, what would mislead you, what you would need that is not there, and what you would do next.\n\n${item.prior}`;
  const content: Anthropic.ContentBlockParam[] = [];
  if (item.role !== "blind" && item.screenshot) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: readPng(item.screenshot).toString("base64"),
      },
    });
  }
  content.push({ type: "text", text: item.perceived });
  return {
    model,
    max_tokens: MAX_TOKENS,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
  } as MessageCreateParamsNonStreaming;
}

export async function askOne(
  client: Anthropic,
  item: ReviewItem,
  model: string,
): Promise<{ answer?: ReviewAnswer; error?: string; usage: Usage }> {
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  try {
    const reply = await client.messages.create(requestFor(item, model));
    usage.input = reply.usage.input_tokens;
    usage.output = reply.usage.output_tokens;
    usage.cacheRead = reply.usage.cache_read_input_tokens ?? 0;
    usage.cacheWrite = reply.usage.cache_creation_input_tokens ?? 0;
    if (reply.stop_reason === "refusal") return { error: "the model refused", usage };
    const text = reply.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return { error: "no text in the reply", usage };
    return { answer: JSON.parse(text.text) as ReviewAnswer, usage };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), usage };
  }
}

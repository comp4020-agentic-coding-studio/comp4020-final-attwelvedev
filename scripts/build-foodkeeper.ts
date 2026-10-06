#!/usr/bin/env node
// Builds src/data/foodkeeper.json (the server's table) and
// src/data/guess-client.json (the same, shrunk for the browser) from the raw
// USDA FoodKeeper file and the hand-written overrides. Re-running it on the
// same inputs writes byte-identical files.
import { readFileSync, writeFileSync } from "node:fs";
import { buildTable, type Overrides, shrink } from "../src/lib/foodkeeperTable.ts";

const CLIENT_BUDGET_GZIP_BYTES = 8 * 1024;

const raw: unknown = JSON.parse(readFileSync("scripts/data/foodkeeper-en.json", "utf-8"));
const overrides: Overrides = JSON.parse(readFileSync("src/data/keyword-overrides.json", "utf-8"));

const table = buildTable(raw, overrides);
const client = shrink(table, CLIENT_BUDGET_GZIP_BYTES);

writeFileSync("src/data/foodkeeper.json", `${JSON.stringify(table)}\n`);
writeFileSync("src/data/guess-client.json", `${JSON.stringify(client)}\n`);
console.log(
  `foodkeeper.json: ${table.length} entries; guess-client.json: ${client.length} entries`,
);

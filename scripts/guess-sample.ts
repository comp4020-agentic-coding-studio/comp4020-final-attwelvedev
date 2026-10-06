#!/usr/bin/env node
// Prints what the guesser says for a spread of grocery names, for a person to
// read: only a handful should look wrong, and none should have a dangerous
// shelf life (raw meat measured in months).
import { readFileSync } from "node:fs";
import { type GuessTable, makeGuesser } from "../src/lib/guess.ts";

const SAMPLE = [
  "milk",
  "skim milk",
  "eggs",
  "bananas",
  "apples",
  "bread",
  "flour",
  "rice",
  "olive oil",
  "cumin",
  "ground cinnamon",
  "soy sauce",
  "tomato sauce",
  "tinned tomatoes",
  "baked beans",
  "chicken breast",
  "mince",
  "cheddar cheese",
  "yoghurt",
  "butter",
  "frozen peas",
  "ice cream",
  "orange juice",
  "coffee",
  "tea bags",
  "biscuits",
  "chips",
  "pasta",
  "spinach",
  "carrots",
  "onions",
  "potatoes",
  "lemon",
  "lentils",
  "honey",
  "jam",
  "vegemite",
  "tofu",
  "mystery thing",
];

const table: GuessTable = JSON.parse(readFileSync("src/data/foodkeeper.json", "utf-8"));
const guess = makeGuesser(table);

const shelf = (days: number | null): string => {
  if (days === null) return "no shelf life";
  if (days >= 365) return `${(days / 365).toFixed(1)} y`;
  if (days >= 60) return `${Math.round(days / 30)} mo`;
  return `${days} d`;
};

for (const name of SAMPLE) {
  const g = guess(name);
  console.log(
    `${name.padEnd(18)} ${g.category.padEnd(11)} ${g.measure.padEnd(6)} ${shelf(g.shelfDays).padEnd(13)} ${g.iconKey ?? "-"}`,
  );
}

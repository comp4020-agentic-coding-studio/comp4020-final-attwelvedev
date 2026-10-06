import { randomInt } from "node:crypto";

// Kitchen words for invite codes like KETTLE-42: easy to say aloud.
const WORDS = [
  "APRON",
  "BASIL",
  "BASKET",
  "BOWL",
  "BREAD",
  "BROTH",
  "BUTTER",
  "CARROT",
  "CELERY",
  "CHIVES",
  "CLOVE",
  "COLANDER",
  "CUMIN",
  "CUP",
  "CURRY",
  "DILL",
  "DISH",
  "DOUGH",
  "EGGS",
  "FENNEL",
  "FLOUR",
  "FORK",
  "GARLIC",
  "GINGER",
  "GRATER",
  "HONEY",
  "JAR",
  "JAM",
  "KALE",
  "KETTLE",
  "KNIFE",
  "LADLE",
  "LEMON",
  "LENTIL",
  "MAPLE",
  "MINT",
  "MUFFIN",
  "MUG",
  "NOODLE",
  "NUTMEG",
  "OATS",
  "OLIVE",
  "ONION",
  "OVEN",
  "PASTA",
  "PEPPER",
  "PLATE",
  "PORRIDGE",
  "RADISH",
  "RICE",
  "SAGE",
  "SALT",
  "SAUCE",
  "SPATULA",
  "SPOON",
  "STEW",
  "SUGAR",
  "TEAPOT",
  "THYME",
  "TOAST",
  "TONGS",
  "WHISK",
  "YEAST",
  "ZESTER",
];

// Draws WORD-NN codes until `isTaken` says one is free.
export function newCode(isTaken: (code: string) => boolean): string {
  for (;;) {
    const code = `${WORDS[randomInt(WORDS.length)]}-${String(randomInt(100)).padStart(2, "0")}`;
    if (!isTaken(code)) return code;
  }
}

// "kettle-42", " KETTLE 42 " and "KETTLE-42" are the same code.
export function normaliseCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, "-");
}

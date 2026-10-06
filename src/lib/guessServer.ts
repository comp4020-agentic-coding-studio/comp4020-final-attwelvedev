import foodkeeperTable from "../data/foodkeeper.json";
import { type Guess, type GuessTable, makeGuesser } from "./guess.ts";

// The full table, for the server. The client gets the smaller guess-client.json.
export const guessItem: (name: string) => Guess = makeGuesser(foodkeeperTable as GuessTable);

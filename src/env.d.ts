declare namespace App {
  interface Locals {
    session: import("./lib/households").Session | null;
    // set by POST /households when it re-renders the first-run form
    firstRunError?: { message: string; householdName: string; memberName: string };
    // set by POST /items when it re-renders the pantry
    addError?: string;
  }
}

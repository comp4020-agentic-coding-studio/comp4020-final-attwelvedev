declare namespace App {
  interface Locals {
    session: import("./lib/households").Session | null;
    // set by POST /households when it re-renders the first-run form
    firstRunError?: { message: string; householdName: string; memberName: string };
    // set by POST /items when it re-renders the pantry
    addError?: string;
    // set by the join endpoints when they re-render the join page
    joinError?: { message: string; status: number; code?: string; memberName?: string };
    // set by POST /household/invite-link and /household/device-link so the page
    // can show the raw token once; only its hash is stored
    newInviteLink?: { token: string; expiresAt: number };
    newDeviceLink?: { token: string; expiresAt: number };
  }
}

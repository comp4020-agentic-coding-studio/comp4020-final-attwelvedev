# Shared Pantry

For people who lose track of the food they buy and end up wasting it.

## The problem
Sometimes the people in a household do not know what the others have bought.
Sometimes, even we ourselves struggle to remember what we bought.
If that is the case, how do people remember other details, like how much of an item is left, or when everything expires?
This leads to the next problem: food spoils because we forgot about it, ultimately leading to wasted food.
There are existing apps that help track inventory, but the main problem is that there is simply too much data entry, which becomes an effort to maintain in the long term.
These apps are also disjoint from other apps that tackle food waste, such as apps that let users offer food to others.
If logging is nearly effortless, people will do it, given the clear benefits.

## What it does today
- Make a household with just a name. There are no accounts and no passwords.
- Add an item: type a name and press Enter.
- Mark an item Used or Binned in one tap, with Undo and no confirm dialog.
- A history of what happened to everything.
- *to be continued*

## How to try it
- Live at https://comp4020-final-attwelvedev.fly.dev
- Name a household and yourself, add a couple of items, mark one Used, undo it, mark another Binned, then open History.

## What I chose to make effortless (and why)
- One field + Enter to add. Asking for quantity and expiry every time becomes an effort, so the app will try to fill in as much as it can for the user.
- One tap per outcome, never a confirm dialog. Undo is easy to action and less intrusive than confirming.
- Device cookie instead of login, to reduce onboarding friction and make the app more accessible.

## How it's built
- Astro + Preact + SQLite on Fly's /data volume. This worked well for previous assessments and is simple and satisfactory for the scope of this project.
- Server-rendered forms first, so it works without JavaScript.
- Rules in `CLAUDE.md`: only `/data` persists; adding a dependency needs a reason; domain logic in `src/lib/` takes the database first and never touches requests, and endpoints stay thin; every correction becomes a rule or a check; one commit per task, only once `pnpm check` is green.
- Checks in `spec/`, run against the live app: `/` answers and `/readme/` serves this file in full; adding is one field + Enter by keyboard alone; an outcome is one click with no dialog, and Undo brings the item back; no horizontal overflow at phone and desktop widths, and axe is clean (colour contrast not yet checked); a device token is only ever stored hashed; one household can never see another's items or history.

## What's coming
- Invites and live sync between household members
- Neighbourhood communities: offer food about to go to waste, and neighbours claim it
- Item amounts, expiry buckets and photos

## What I chose not to build
- No chat or messaging. A pickup note replaces it.
- No barcode scanning, shopping lists, notifications, gamification or email.
- No multiple households per device.

<!-- Questions only you can answer (*will answer these later*)
- What made you want to build this?
- Which of the "chose not to build" items were hard cuts?
- Is there a real moment from your own use of the app to put in "the problem"? -->

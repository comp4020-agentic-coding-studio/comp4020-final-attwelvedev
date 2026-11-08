import { CALLOUT_WORD } from "../../src/client/hud.ts";
import { FACES } from "../../src/game/channels.ts";
import { type Method, type Role, SENDS } from "../../src/game/types.ts";
import { act, type Dir8, menu, move, sendByWheel } from "./drive.ts";
import { declinedCleanly, delivered, movedToward } from "./judges.ts";
import type { Seat3 } from "./table.ts";
import type { Finding } from "./types.ts";

// Task 126: before autopilot, each tab does what a person does, and each action is judged against
// what the page sent and the server showed next. Every failed expectation is a finding; the run
// goes on.
const DIRS: Dir8[] = ["left", "right", "up", "down"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Where {
  room: string;
  roles: Role[];
}

// `steps`: the run does every seat's "move" first, because a seat's Act can take a neighbour's hand,
// and a held hand pulls: a later seat's walk would then be judged against the pull.
export async function inputCheck(
  seat: number,
  table: Seat3[],
  where: Where,
  steps: "move" | "rest" = "rest",
): Promise<Omit<Finding, "screenshot" | "viewJson">[]> {
  const tab = table[seat] as Seat3;
  const role = where.roles[seat] as Role;
  const out: Omit<Finding, "screenshot" | "viewJson">[] = [];
  const fail = (step: string, detail: string) =>
    out.push({
      invariant: `input:${step}`,
      room: where.room,
      role,
      width: tab.width,
      tick: tab.wire.latest()?.tick ?? 0,
      detail,
    });

  // 1. Move
  for (const dir of steps === "move" ? DIRS : []) {
    const since = Date.now();
    await move(tab, dir, 250);
    await sleep(750);
    const sent = tab.wire
      .sent()
      .filter((s) => s.at >= since && s.msg.t === "input")
      .map((s) => s.msg as { move?: { x: number; y: number } });
    const sign = (m?: { x: number; y: number }) =>
      dir === "left"
        ? (m?.x ?? 0) < 0
        : dir === "right"
          ? (m?.x ?? 0) > 0
          : dir === "up"
            ? (m?.y ?? 0) < 0
            : (m?.y ?? 0) > 0;
    if (!sent.some((m) => sign(m.move))) {
      fail("move", `${dir}: no input frame with that move sign was sent`);
      continue;
    }
    const views = tab.wire.views(since).map((v) => v.view);
    if (role === "blind") {
      if (!views.some((v) => v.you.motion?.moving) && !views.every((v) => v.you.motion?.blocked))
        fail("move", `${dir}: Can't see's own motion never showed moving`);
      continue;
    }
    if (movedToward(views, dir) === false) {
      const at = views.flatMap((v) => (v.you.pos ? [v.you.pos] : []));
      const motion = views.map(
        (v) => `${v.you.motion?.moving ? "m" : "-"}${v.you.motion?.blocked ? "b" : "-"}`,
      );
      fail(
        "move",
        `${dir}: the seat's position did not go ${dir} (from ${JSON.stringify(at[0])} to ${JSON.stringify(at.at(-1))}; motion ${motion.join(" ")})`,
      );
    }
  }

  if (steps === "move") return out;

  // 2. Act
  {
    const since = Date.now();
    await act(tab);
    await sleep(300);
    const sent = tab.wire
      .sent()
      .some(
        (s) => s.at >= since && s.msg.t === "input" && (s.msg as { act?: boolean }).act === true,
      );
    if (!sent) fail("act", "no input frame with act: true was sent");
  }

  // 3. Comms
  {
    const since = Date.now();
    const method: Method = role === "mute" ? "face" : "callout";
    try {
      if (role === "mute") {
        const face = FACES[0];
        await sendByWheel(tab, { page: "faces", name: face?.label ?? "OK" });
      } else {
        await sendByWheel(tab, { page: "talk", name: CALLOUT_WORD.here });
      }
    } catch (e) {
      fail("comms", `the wheel would not send: ${(e as Error).message}`);
    }
    await sleep(1200);
    const sends = tab.wire.sent().filter((s) => s.at >= since && s.msg.t === "send");
    const errors = tab.wire.messages("error").filter((m) => m.at >= since);
    const cooled =
      errors.some((m) => m.msg.code === "cooldown") ||
      tab.wire.messages("cooldown").some((m) => m.at >= since);
    const bad = errors.filter((m) => m.msg.code !== "cooldown");
    if (bad.length > 0) fail("comms", `error ${bad.map((m) => m.msg.code).join(", ")}`);
    else if (sends.length === 0) fail("comms", "no { t: send } was sent");
    else if (!cooled || SENDS[role].includes(method)) {
      const wires = table.map((t) => t.wire.messages("msg").filter((m) => m.at >= since));
      const got = delivered(wires, seat, method, where.roles);
      if (!got.ok) fail("comms", got.detail);
    }
  }

  // 4. Menu: settings, then a restart vote that another tab declines
  try {
    await menu(tab, "settings");
    const reveals = table.map((t) => t.wire.messages("reveal").length);
    const since = Date.now();
    await menu(tab, "restart-room");
    for (const [i, t] of table.entries()) {
      try {
        await t.page.getByRole("alertdialog").waitFor({ timeout: 1500 });
      } catch {
        fail("menu", `seat ${i}'s tab never showed the vote dialog`);
      }
    }
    const other = table[(seat + 1) % 3] as Seat3;
    await menu(other, "vote-no");
    for (const [i, t] of table.entries()) {
      try {
        await t.page.getByRole("alertdialog").waitFor({ state: "detached", timeout: 1500 });
      } catch {
        fail("menu", `seat ${i}'s vote dialog stayed after a decline`);
      }
    }
    await sleep(300);
    const views = tab.wire.views(since).map((v) => v.view);
    const newReveals = tab.wire.messages("reveal").length - (reveals[seat] as number);
    const clean = declinedCleanly(views, newReveals);
    if (!clean.ok) fail("menu", clean.detail);
  } catch (e) {
    fail("menu", `the menu would not work: ${(e as Error).message}`);
  }
  return out;
}

// The Act step may have taken a teammate's hand (Act is a toggle), and a held hand pulls the pair
// through a room. Before autopilot, whoever the views show as holding or held presses Act again
// until nobody is, so each room starts with free hands. Looks only at what a tab perceives.
export async function freeHands(table: Seat3[]): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(300);
    const tied = new Set<number>();
    for (const tab of table) {
      for (const e of tab.wire.latest()?.entities ?? []) {
        if (e.kind === "player" && (e.holding !== undefined || e.heldBy !== undefined))
          tied.add(e.seat as number);
      }
    }
    if (tied.size === 0) return;
    const seat = [...tied][0] as number;
    await act(table[seat] as Seat3);
  }
}

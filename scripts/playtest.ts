// `pnpm playtest`: the regression run (plans/2026-11-07-playtests-02). Three real tabs, the real
// screens, a throwaway server with the autopilot flag. Not part of `pnpm check`.
//   pnpm playtest [--room NN] [--width 1280|375] [--rotations all]
import { readdirSync } from "node:fs";
import { launch } from "../spec/browser.ts";
import { settledHash } from "../spec/playUi.ts";
import { rolesFor } from "../src/game/crew.ts";
import type { Room } from "../src/game/rooms/format.ts";
import { loadRooms } from "../src/game/rooms/load.ts";
import type { Role, Seat } from "../src/game/types.ts";
import { type Args, parseArgs, rotatedWidths } from "./playtest/args.ts";
import { freshBeats, nextShot } from "./playtest/beats.ts";
import { soundIsOn } from "./playtest/drive.ts";
import { evidencePath, perceivedText, runName, writeEvidence } from "./playtest/evidence.ts";
import { freeHands, inputCheck } from "./playtest/inputCheck.ts";
import { sampleTab, type TabMemory } from "./playtest/invariants.ts";
import { renderReport } from "./playtest/report.ts";
import { roomEnd } from "./playtest/roomEnd.ts";
import { startServer } from "./playtest/server.ts";
import { openTable, readyAll, type Seat3 } from "./playtest/table.ts";
import type { Finding } from "./playtest/types.ts";

const files = readdirSync("rooms")
  .filter((f) => f.endsWith(".room"))
  .sort();
const available = files.map((f) => f.replace(/\.room$/, ""));
const args: Args = parseArgs(process.argv.slice(2), available);
const roomIds = args.rooms === "all" ? available : args.rooms;
const rooms: Room[] = loadRooms("./rooms").filter((r) => roomIds.includes(r.id));

const run = runName();
const runDir = (...parts: string[]) => evidencePath(run, ...parts);
const findings: Finding[] = [];
const shots: { room: string; file: string }[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A tab's beat: the beat whose columns hold the seat's x. A sighted seat reads its own position;
// Can't see's view has none, so it is read from its figure in a sighted seat's latest view.
function beatOf(room: Room, table: Seat3[], seat: Seat): number {
  const own = table[seat]?.wire.latest()?.you.pos;
  let x = own?.x;
  if (x === undefined) {
    for (const other of table) {
      const view = other.wire.latest();
      const fig = view?.entities.find((e) => e.kind === "player" && e.seat === seat);
      if (fig) {
        x = fig.pos.x;
        break;
      }
    }
  }
  if (x === undefined) return 0;
  const i = room.beats.findIndex((b) => x >= b.x[0] && x <= b.x[1] + 1);
  return i < 0 ? 0 : i + 1;
}

let failures = 0;
// A finding with its evidence (FR7): the tab's screenshot and its latest view, next to the beats.
async function record(
  table: Seat3[],
  seat: number,
  f: Omit<Finding, "screenshot" | "viewJson">,
): Promise<void> {
  const n = ++failures;
  const tab = table[seat];
  const png = `${f.room}/fail-${n}.png`;
  const json = `${f.room}/fail-${n}.json`;
  if (tab) {
    writeEvidence(runDir(png), await tab.page.screenshot());
    writeEvidence(runDir(json), JSON.stringify(tab.wire.latest(), null, 2));
  }
  console.log(`  finding ${f.invariant} ${f.room} ${f.role}@${f.width}: ${f.detail}`);
  findings.push({ ...f, screenshot: tab ? png : null, viewJson: tab ? json : null });
}

async function shot(table: Seat3[], room: Room, roles: Role[], beat: string, seat?: Seat) {
  for (const [s, tab] of table.entries()) {
    if (seat !== undefined && s !== seat) continue;
    const stem = `${roles[s]}-${tab.width}-${beat}`;
    const png = runDir(room.id, `${stem}.png`);
    writeEvidence(png, await tab.page.screenshot());
    writeEvidence(runDir(room.id, `${stem}.txt`), await perceivedText(tab.page));
    shots.push({ room: room.id, file: `${room.id}/${stem}.png` });
  }
}

async function playRotation(
  rotation: number,
  url: string,
  browser: Awaited<ReturnType<typeof launch>>,
) {
  const widths = rotatedWidths(args.widths, rotation);
  const table = await openTable(browser, url, widths, {
    onHome: (seat, text) => writeEvidence(runDir("prior", `${seat}-home.txt`), text),
  });
  for (const [index, room] of rooms.entries()) {
    const roles = rolesFor(index) as Role[];
    for (const [seat, tab] of table.entries()) {
      const text = await tab.page.locator("body").ariaSnapshot();
      writeEvidence(runDir(room.id, "prior", `${roles[seat]}-reveal.txt`), text);
    }
    const clearedBefore = table.map((t) => t.wire.messages("cleared").length);
    await readyAll(table);
    for (const steps of ["move", "rest"] as const) {
      for (const seat of [0, 1, 2]) {
        for (const f of await inputCheck(seat, table, { room: room.id, roles }, steps)) {
          await record(table, seat, f);
        }
      }
    }
    await freeHands(table);
    // everything slow happens before the bots move: a room can be crossed in seconds, and the
    // frame checks want the start, where most of the room is still out of sight
    const soundOn = await Promise.all(table.map((t) => soundIsOn(t)));
    // each tab is first sampled once its canvas holds still (NFR6: no frame is compared before then)
    await Promise.all(table.map((t) => settledHash(t.page)));
    await shot(table, room, roles, "start");
    await Promise.all(table.map((t) => t.page.evaluate("window.__playtest.autopilot(true)")));
    const beats = freshBeats(table.length);
    const sampledAt = table.map(() => Date.now());
    const memories: TabMemory[] = table.map(() => ({ heard: [], judgedUntil: Date.now() }));
    const cap = Date.now() + Number((room.meta.budgetS as number) ?? 240) * 3000;
    let done = false;
    while (Date.now() < cap) {
      await sleep(250);
      for (const [seat, tab] of table.entries()) {
        const since = sampledAt[seat] as number;
        sampledAt[seat] = Date.now();
        const found = await sampleTab(
          tab.page,
          memories[seat] as TabMemory,
          tab.wire.views(since - 1000),
          tab.wire.latest(),
          tab.wire.tiles(),
          {
            role: roles[seat] as string,
            sound: soundOn[seat] === true,
          },
        );
        for (const f of found) {
          await record(table, seat, {
            ...f,
            room: room.id,
            role: roles[seat] as string,
            width: tab.width,
            tick: tab.wire.latest()?.tick ?? 0,
          });
        }
      }
      for (const seat of [0, 1, 2] as Seat[]) {
        const b = beatOf(room, table, seat);
        if (nextShot(beats[seat] as number, b)) {
          beats[seat] = b;
          await shot(table, room, roles, String(b), seat);
        }
      }
      if (table.every((t, i) => t.wire.messages("cleared").length > (clearedBefore[i] as number))) {
        done = true;
        break;
      }
    }
    if (!done) {
      await record(table, 0, {
        invariant: "run:timeout",
        room: room.id,
        role: roles[0] as string,
        width: table[0]?.width ?? 0,
        tick: table[0]?.wire.latest()?.tick ?? 0,
        detail: "the room was not cleared within three times its budget",
      });
      return;
    }
    await sleep(600); // the cleared card draws
    await shot(table, room, roles, "end");
    const last = index === rooms.length - 1;
    if (last) {
      // the heist message follows the last cleared by a moment
      for (let i = 0; i < 40 && table.some((t) => t.wire.messages("heist").length === 0); i++)
        await sleep(100);
    }
    for (const [seat, tab] of table.entries()) {
      const cleared = tab.wire.messages("cleared").at(-1)?.msg;
      const heist = tab.wire.messages("heist").at(-1)?.msg;
      if (!cleared) continue;
      for (const f of await roomEnd(seat, tab, cleared, last ? heist : undefined)) {
        await record(table, seat, {
          ...f,
          room: room.id,
          role: roles[seat] as string,
          width: tab.width,
          tick: tab.wire.latest()?.tick ?? 0,
        });
      }
    }
    if (last) break;
    await table[0]?.page.getByRole("button", { name: "Next room" }).click();
    for (const [seat, t] of table.entries()) {
      try {
        await t.page.locator(".reveal").waitFor({ timeout: 15_000 });
      } catch {
        await record(table, seat, {
          invariant: "room-end:next",
          room: room.id,
          role: roles[seat] as string,
          width: t.width,
          tick: t.wire.latest()?.tick ?? 0,
          detail: "Next room did not lead this tab to the next reveal",
        });
        return;
      }
    }
  }
  for (const t of table) await t.page.context().close();
}

const server = await startServer({ rooms: args.rooms === "all" ? undefined : roomIds });
const browser = await launch(["--autoplay-policy=no-user-gesture-required"]);
try {
  for (let rotation = 0; rotation < args.rotations; rotation++) {
    await playRotation(rotation, server.url, browser);
  }
} finally {
  await browser.close();
  await server.stop();
}
writeEvidence(
  runDir("report.html"),
  renderReport({ run, rooms: roomIds, widths: args.widths, findings, shots }),
);
writeEvidence(
  runDir("run.json"),
  JSON.stringify({
    rooms: roomIds,
    widths: args.widths,
    seats: rotatedWidths(args.widths, 0).map((width, seat) => ({ seat, width })),
  }),
);
console.log(`playtest ${run}: ${findings.length} finding(s); evidence in ${runDir()}`);
process.exit(findings.length ? 1 : 0);

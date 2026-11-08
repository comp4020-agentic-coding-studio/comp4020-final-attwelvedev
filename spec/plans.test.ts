import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A plan's ticks are the record of what is done (auto fixes 6, Task 264): a ticked box whose own text
// says the work is not met, a ticked "accepted by the user" that is only queued, or a ticked phase
// under an unticked Definition of Done item, each claimed something that had not happened. The gap
// stays written beside an unticked box instead.

// A ticked box: a list item `- [x]`, or a table cell `| [x] …`, with the text that follows it.
const TICKED = /^\s*[-*] \[x\] (.*)$|\|\s*\[x\]([^|]*)/i;

function falseTicks(file: string, text: string): string[] {
  const out: string[] = [];
  let inDod = false;
  let open: number[] = []; // unticked Definition of Done items above, in this section
  for (const [i, line] of text.split("\n").entries()) {
    const at = `${file}:${i + 1}`;
    if (/^#/.test(line)) {
      inDod = /Definition of Done/i.test(line);
      open = [];
      continue;
    }
    const m = TICKED.exec(line);
    const said = m ? (m[1] ?? m[2] ?? "") : "";
    if (m && /not met/i.test(said)) out.push(`${at}: ticked, but says "not met"`);
    if (m && /accepted by the user/i.test(said) && /queued/i.test(said))
      out.push(`${at}: ticked "accepted by the user", but the review is only queued`);
    if (!inDod) continue;
    if (/^\s*[-*] \[ \] /.test(line)) open.push(i + 1);
    else if (m && /^\s*Tick (the )?phase/i.test(said) && open.length > 0)
      out.push(`${at}: phase ticked while line(s) ${open.join(", ")} above are not`);
  }
  return out;
}

describe("plan ticks", () => {
  it("never tick a box that says not met, an acceptance that is only queued, or a phase over an open item", () => {
    const found = readdirSync("plans")
      .filter((f) => f.endsWith(".md"))
      .flatMap((f) => falseTicks(f, readFileSync(join("plans", f), "utf8")));
    expect(found).toEqual([]);
  });

  it("finds a ticked line that says NOT MET, in a list or a table", () => {
    expect(falseTicks("p", "- [x] A full run completed: NOT MET.")).toHaveLength(1);
    expect(falseTicks("p", "| 02 | x | [x] (full run not met) |")).toHaveLength(1);
    expect(falseTicks("p", "- [ ] A full run completed: NOT MET.")).toEqual([]);
  });

  it("finds a ticked acceptance that is only queued", () => {
    expect(
      falseTicks("p", "- [x] Task 1's human review accepted by the user (review queued)"),
    ).toHaveLength(1);
    expect(
      falseTicks("p", "- [ ] Task 1's human review accepted by the user (review queued)"),
    ).toEqual([]);
    expect(falseTicks("p", "- [x] Task 1's human review accepted by the user")).toEqual([]);
  });

  it("finds a ticked phase under an unticked Definition of Done item, and only in that list", () => {
    const dod = (item: string) =>
      `## 6. Phase Definition of Done\n\n- [x] Tests pass\n- [${item}] A full run completed\n- [x] Tick phase 02 in overview §5 and commit\n`;
    expect(falseTicks("p", dod(" "))).toEqual(["p:5: phase ticked while line(s) 4 above are not"]);
    expect(falseTicks("p", dod("x"))).toEqual([]);
    expect(
      falseTicks(
        "p",
        "## Tasks\n\n- [ ] Task 1\n\n## Phase Definition of Done\n\n- [x] Tick phase 1\n",
      ),
    ).toEqual([]);
  });
});

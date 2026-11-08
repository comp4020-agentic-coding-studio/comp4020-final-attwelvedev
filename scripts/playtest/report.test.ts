import { describe, expect, it } from "vitest";
import { escapeHtml, page, renderReport } from "./report.ts";
import type { Finding, RunSummary } from "./types.ts";

const finding = (over: Partial<Finding> = {}): Finding => ({
  invariant: "frame:door-chip",
  room: "01-first-steps",
  role: "deaf",
  width: 1280,
  tick: 42,
  detail: "the chip says door",
  screenshot: "01-first-steps/fail-1.png",
  viewJson: "01-first-steps/fail-1.json",
  ...over,
});
const run = (findings: Finding[]): RunSummary => ({
  run: "2026-11-07T10-00",
  rooms: ["01-first-steps", "02-three-hands"],
  widths: [1280, 375, 1280],
  findings,
  shots: [{ room: "01-first-steps", file: "01-first-steps/deaf-1280-start.png" }],
});

describe("renderReport", () => {
  it("renders both findings with links to their PNG and JSON", () => {
    const html = renderReport(
      run([
        finding(),
        finding({
          invariant: "input:move",
          screenshot: "01-first-steps/fail-2.png",
          viewJson: "01-first-steps/fail-2.json",
        }),
      ]),
    );
    for (const n of [1, 2]) {
      expect(html).toContain(`href="01-first-steps/fail-${n}.png"`);
      expect(html).toContain(`href="01-first-steps/fail-${n}.json"`);
    }
  });
  it("counts findings by room and invariant", () => {
    const html = renderReport(
      run([finding(), finding(), finding({ room: "02-three-hands", invariant: "input:act" })]),
    );
    // invariants sort: frame:door-chip, input:act. Room 01 has two door chips, room 02 one act.
    expect(html).toContain('<th scope="row">01-first-steps</th><td>2</td><td>0</td>');
    expect(html).toContain('<th scope="row">02-three-hands</th><td>0</td><td>1</td>');
  });
  it("escapes text: a detail containing <b> appears as text", () => {
    const html = renderReport(run([finding({ detail: "saw <b>bold</b>" })]));
    expect(html).toContain("saw &lt;b&gt;bold&lt;/b&gt;");
    expect(html).not.toContain("<b>bold</b>");
  });
  it("says No findings for a clean run", () => {
    expect(renderReport(run([]))).toContain("No findings");
  });
  it("shows the beat screenshots as thumbnails, with no script and no external asset", () => {
    const html = renderReport(run([]));
    expect(html).toContain('src="01-first-steps/deaf-1280-start.png"');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/(?:src|href)="https?:/);
  });
});

describe("escapeHtml and page", () => {
  it("escapes the five characters", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });
  it("wraps a body in a titled shell", () => {
    expect(page("T <1>", "<p>hi</p>")).toContain("<title>T &lt;1&gt;</title>");
  });
});

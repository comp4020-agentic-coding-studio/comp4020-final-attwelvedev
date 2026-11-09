import type { Finding, RunSummary } from "./types.ts";

// The run's report as one static page: no script, no external asset. `escapeHtml` and `page` are
// shared with the screenshot review (phase 03).
export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const STYLE = `body{font:15px/1.5 system-ui,sans-serif;margin:2rem auto;max-width:72rem;padding:0 1rem;color:#222}
table{border-collapse:collapse;margin:1rem 0}th,td{border:1px solid #bbb;padding:.3rem .6rem;text-align:left}
.finding{border-left:4px solid #c33;padding:.2rem .8rem;margin:1rem 0;background:#fafafa}
.shots{display:flex;flex-wrap:wrap;gap:.5rem}.shots a{display:block}.shots img{height:9rem;border:1px solid #bbb}
code{background:#eee;padding:0 .25rem}`;

export function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head>
<body><h1>${escapeHtml(title)}</h1>
${body}
</body></html>
`;
}

function summaryTable(rooms: string[], findings: Finding[]): string {
  const invariants = [...new Set(findings.map((f) => f.invariant))].sort();
  const count = (room: string, inv: string) =>
    findings.filter((f) => f.room === room && f.invariant === inv).length;
  const head = invariants.map((i) => `<th>${escapeHtml(i)}</th>`).join("");
  const rows = rooms
    .map(
      (r) =>
        `<tr><th scope="row">${escapeHtml(r)}</th>${invariants
          .map((i) => `<td>${count(r, i)}</td>`)
          .join("")}</tr>`,
    )
    .join("\n");
  return `<table><thead><tr><th>Room</th>${head}</tr></thead><tbody>
${rows}
</tbody></table>`;
}

const link = (href: string | null, text: string): string =>
  href ? `<a href="${escapeHtml(href)}">${text}</a>` : "";

function findingBlock(f: Finding): string {
  return `<div class="finding"><strong>${escapeHtml(f.invariant)}</strong> in ${escapeHtml(f.room)},
${escapeHtml(f.role)} at ${f.width}, tick ${f.tick}<br>${escapeHtml(f.detail)}<br>
${link(f.screenshot, "screenshot")} ${link(f.viewJson, "view JSON")}</div>`;
}

export function renderReport(run: RunSummary): string {
  const findings =
    run.findings.length === 0
      ? "<p>No findings.</p>"
      : `${summaryTable(run.rooms, run.findings)}\n${run.findings.map(findingBlock).join("\n")}`;
  const shots = run.rooms
    .map((room) => {
      const mine = run.shots.filter((s) => s.room === room);
      if (mine.length === 0) return "";
      return `<h3>${escapeHtml(room)}</h3><div class="shots">${mine
        .map(
          (s) =>
            `<a href="${escapeHtml(s.file)}"><img src="${escapeHtml(s.file)}" alt="${escapeHtml(s.file)}" loading="lazy"></a>`,
        )
        .join("")}</div>`;
    })
    .join("\n");
  return page(
    `Playtest ${run.run}`,
    `<p>${run.rooms.length} room(s), table widths ${run.widths.join(", ")}.</p>
<h2>Findings</h2>
${findings}
<h2>Beats</h2>
${shots}`,
  );
}

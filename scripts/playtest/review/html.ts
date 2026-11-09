import { ROLE_LABEL } from "../../../src/game/types.ts";
import { escapeHtml, page } from "../report.ts";
import type { ReviewAnswer } from "./ask.ts";
import type { ReviewItem } from "./collect.ts";
import type { Tally } from "./cost.ts";

export interface Answered {
  item: ReviewItem;
  answer?: ReviewAnswer;
  error?: string;
}

const KINDS = ["unreadable", "misleading", "missing", "unclear-next"] as const;
const ROLES = ["blind", "deaf", "mute"] as const;
const e = escapeHtml;

// room id -> beat ("start", "1".."n") -> role -> the designed intent. Read from the room files for
// the reader only; it is never sent to the model.
export type Intents = Record<string, Record<string, Partial<Record<string, string>>>>;

// One answered item: its width and rotation, its screenshot, and what the model said.
function entry(a: Answered): string {
  const { item } = a;
  const shot = item.screenshot
    ? `<a href="${e(item.screenshot)}"><img src="${e(item.screenshot)}" alt="${e(`${ROLE_LABEL[item.role]}, beat ${item.beat}`)}" loading="lazy" style="height:9rem;border:1px solid #bbb"></a>`
    : "<p><em>screen dark</em></p>";
  let body = "";
  if (a.error) body = `<p class="finding"><strong>error:</strong> ${e(a.error)}</p>`;
  else if (a.answer) {
    const answer = a.answer;
    const groups = KINDS.map((k) => ({ k, list: answer.findings.filter((f) => f.kind === k) }))
      .filter((g) => g.list.length > 0)
      .map(
        (g) =>
          `<h4>${e(g.k)}</h4><ul>${g.list.map((f) => `<li>${e(f.what)} <small>(${e(f.where)})</small></li>`).join("")}</ul>`,
      )
      .join("");
    body = `${groups || "<p>No findings.</p>"}<p><strong>would do next:</strong> ${e(answer.next)}</p>`;
  }
  return `<div><p><small>at ${item.width}, r${item.rotation}</small></p>${shot}${body}</div>`;
}

// A role at a beat: every answer for it (one per width and rotation), then the designed intent once.
function cell(list: Answered[], intents: Intents): string {
  const first = list[0]?.item;
  if (!first) return "<td></td>";
  const designed = intents[first.room]?.[first.beat]?.[first.role];
  return `<td>${list.map(entry).join("")}${designed ? `<p><strong>designed:</strong> ${e(designed)}</p>` : ""}</td>`;
}

export function renderReview(answered: Answered[], intents: Intents, t: Tally): string {
  const rooms = [...new Set(answered.map((a) => a.item.room))];
  const count = (room: string, k: string) =>
    answered
      .filter((a) => a.item.room === room)
      .reduce((n, a) => n + (a.answer?.findings.filter((f) => f.kind === k).length ?? 0), 0);
  const cost = t.usd === null ? "unknown price" : `$${t.usd.toFixed(3)}`;
  const summary = `<table><thead><tr><th>Room</th>${KINDS.map((k) => `<th>${k}</th>`).join("")}</tr></thead><tbody>
${rooms.map((r) => `<tr><th scope="row">${e(r)}</th>${KINDS.map((k) => `<td>${count(r, k)}</td>`).join("")}</tr>`).join("\n")}
</tbody></table>
<p>${t.calls} calls, ${t.errors} errors; ${t.input} input, ${t.cacheRead} cached, ${t.output} output tokens; cost ${cost}. Findings are leads, not verdicts.</p>`;
  const sections = rooms.map((room) => {
    const mine = answered.filter((a) => a.item.room === room);
    const beats = [...new Set(mine.map((a) => a.item.beat))];
    const rows = beats
      .map((beat) => {
        const cells = ROLES.map((role) => {
          const list = mine.filter((m) => m.item.beat === beat && m.item.role === role);
          return cell(list, intents);
        }).join("");
        return `<tr><th scope="row">${e(beat)}</th>${cells}</tr>`;
      })
      .join("\n");
    return `<h2>${e(room)}</h2><table><thead><tr><th>Beat</th>${ROLES.map((r) => `<th>${e(ROLE_LABEL[r])}</th>`).join("")}</tr></thead><tbody>
${rows}
</tbody></table>`;
  });
  return page("Screenshot review", `${summary}\n${sections.join("\n")}`);
}

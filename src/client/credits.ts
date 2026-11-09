import type { Role } from "../game/types.ts";

// A room's credits as the results card shows them: each seat's name and role and its lines, with a
// `{seat}` token (a teammate) replaced by that person's nickname. The server never sees a nickname.
export interface CreditRow {
  name: string;
  role: Role;
  lines: string[];
}

export function creditRows(
  credits: { seat: number; lines: string[] }[],
  crew: { nickname: string; role: Role }[],
): CreditRow[] {
  return credits.flatMap((c) => {
    const me = crew[c.seat];
    if (!me) return [];
    return [
      {
        name: me.nickname,
        role: me.role,
        lines: c.lines.map((l) =>
          l.replace(/\{(\d)\}/g, (_, n) => crew[Number(n)]?.nickname ?? "a teammate"),
        ),
      },
    ];
  });
}

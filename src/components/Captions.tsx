import type { Caption } from "../client/hud.ts";
import { ROLE_LABEL } from "../game/types.ts";
import { RoleShape } from "./RoleShape.tsx";

export interface CaptionLine extends Caption {
  id: number;
  until: number; // performance.now() after which it goes
}

// Captions for anyone: what was said and what the room sounds like, as text.
// Each spoken line carries its sender's shape and name; a screen reader also
// gets the role in words. A polite live region, so each line is read as it lands.
export function Captions({ lines, cues }: { lines: CaptionLine[]; cues: string[] }) {
  if (lines.length === 0 && cues.length === 0) return null;
  return (
    <div class="captions" role="log" aria-live="polite" aria-label="Captions">
      {lines.map((l) => (
        <p key={l.id}>
          <RoleShape role={l.role} size={16} />
          <span class="sr-only">{ROLE_LABEL[l.role]} </span>
          <span>
            <b>{l.name}</b>: {l.text}
          </span>
        </p>
      ))}
      {cues.length > 0 && <p class="cue">{cues.join(" ")}</p>}
    </div>
  );
}

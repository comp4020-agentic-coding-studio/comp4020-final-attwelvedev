import type { GameAudio } from "../client/audio.ts";
import { CUE_WORD } from "../client/hud.ts";
import type { BriefingCue } from "../game/cues.ts";

// Can't see's "Learn the sounds": one play button per sound this room can make, and Play all.
// The cues are the same synthesised ones the game plays, so what is learnt is what is heard.
export function SoundBriefing({
  cues,
  audio,
}: {
  cues: BriefingCue[];
  audio: { current: GameAudio | null };
}) {
  if (cues.length === 0) return null;
  const play = async (kinds: BriefingCue[]) => {
    const a = audio.current;
    if (!a) return;
    await a.resume(); // a tap is the browser's cue to let sound start
    // each in turn, so Play all is a list and not a chord
    kinds.forEach((kind, i) => {
      setTimeout(() => a.play([{ kind, pan: 0, gain: 1 }]), i * 700);
    });
  };
  return (
    <section class="briefing" aria-labelledby="briefing-title">
      <h2 id="briefing-title">Learn the sounds</h2>
      <ul>
        {cues.map((cue) => (
          <li key={cue}>
            <button
              type="button"
              class="btn"
              aria-label={`Play ${CUE_WORD[cue]}`}
              onClick={() => play([cue])}
            >
              ▶ {CUE_WORD[cue]}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" class="btn" onClick={() => play(cues)}>
        ▶ Play all
      </button>
    </section>
  );
}

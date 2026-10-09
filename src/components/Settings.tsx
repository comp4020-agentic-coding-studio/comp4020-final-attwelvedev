import { useState } from "preact/hooks";
import type { Settings as SettingsState } from "../client/settings.ts";
import type { Role } from "../game/types.ts";
import { ConfirmButton } from "./ConfirmButton.tsx";

// The few things a person may turn on or off. Kept to a button and a small
// panel in the top bar: the real-life presets arrive with the wizard (Task 19).
// Can't hear is told nothing in words or sound (they get faces and stamps,
// which are pictures), so captions, sound and speech are shown off and can't
// be changed, with the reason, rather than offering switches that do nothing.
export function Settings({
  role,
  settings,
  onChange,
  onLeave,
  maskNoiseAvailable,
  othersSoundOff,
}: {
  role: Role;
  settings: SettingsState;
  onChange: (next: SettingsState) => void;
  onLeave: () => void;
  // Whether the host's real-life setup has turned masking noise on for the
  // team; Can't hear can still choose not to use it, but can't turn on what
  // the host hasn't.
  maskNoiseAvailable: boolean;
  // The host's real-life setup has turned game sound off for Can't see and
  // Can't speak (captions carry it instead): forced on everyone, so the
  // checkbox has to say so rather than show a personal choice that isn't one.
  othersSoundOff: boolean;
}) {
  const [open, setOpen] = useState(false);
  const deaf = role === "deaf";
  const forcedCaptions = !deaf && othersSoundOff;
  const toggle = (key: keyof SettingsState) => (e: Event) =>
    onChange({ ...settings, [key]: (e.target as HTMLInputElement).checked });
  return (
    <>
      <button
        type="button"
        class="hud-btn"
        aria-expanded={open}
        aria-controls="settings"
        onClick={() => setOpen(!open)}
      >
        Settings
      </button>
      {open && (
        <fieldset class="settings" id="settings">
          <legend class="sr-only">Settings</legend>
          <label>
            <input
              type="checkbox"
              checked={!deaf && (settings.captions || forcedCaptions)}
              disabled={deaf || forcedCaptions}
              aria-describedby={
                deaf ? "settings-note" : forcedCaptions ? "others-sound-off-note" : undefined
              }
              onChange={toggle("captions")}
            />
            Captions
          </label>
          <label>
            <input
              type="checkbox"
              checked={!deaf && settings.sound && !forcedCaptions}
              disabled={deaf || forcedCaptions}
              aria-describedby={
                deaf ? "settings-note" : forcedCaptions ? "others-sound-off-note" : undefined
              }
              onChange={toggle("sound")}
            />
            Game sound
          </label>
          <label>
            <input
              type="checkbox"
              checked={!deaf && settings.speech}
              disabled={deaf}
              aria-describedby={deaf ? "settings-note" : undefined}
              onChange={toggle("speech")}
            />
            Spoken lines
          </label>
          {deaf && (
            <p class="settings-note" id="settings-note">
              You can't hear in this game and nothing is said or played to you, so captions, sound
              and spoken lines are off.
            </p>
          )}
          {forcedCaptions && (
            <p class="settings-note" id="others-sound-off-note">
              The host turned off game sound for the table: captions are on for everyone instead.
            </p>
          )}
          <label>
            <input type="checkbox" checked={settings.keepOpen} onChange={toggle("keepOpen")} />
            Keep the comms sheet open after sending
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.highContrast}
              onChange={toggle("highContrast")}
            />
            High contrast
          </label>
          {deaf && (
            <>
              <label>
                <input
                  type="checkbox"
                  name="mask-noise"
                  checked={maskNoiseAvailable && settings.maskNoiseOn}
                  disabled={!maskNoiseAvailable}
                  aria-describedby={maskNoiseAvailable ? undefined : "mask-noise-note"}
                  onChange={toggle("maskNoiseOn")}
                />
                Masking noise
              </label>
              <label>
                Masking noise volume
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.volume}
                  disabled={!maskNoiseAvailable || !settings.maskNoiseOn}
                  aria-describedby={maskNoiseAvailable ? undefined : "mask-noise-note"}
                  onInput={(e) =>
                    onChange({
                      ...settings,
                      volume: Number((e.target as HTMLInputElement).value),
                    })
                  }
                />
              </label>
              {!maskNoiseAvailable && (
                <p class="mask-noise-note" id="mask-noise-note">
                  Turn masking noise on in the host's real-life setup first.
                </p>
              )}
            </>
          )}
          <div class="settings-leave">
            <ConfirmButton
              class="hud-btn danger"
              label="Leave game"
              confirmLabel="Sure? Leave game"
              onConfirm={onLeave}
            />
          </div>
        </fieldset>
      )}
    </>
  );
}

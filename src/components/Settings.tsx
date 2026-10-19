import { useState } from "preact/hooks";
import type { Settings as SettingsState } from "../client/settings.ts";
import type { Role } from "../game/types.ts";
import { ConfirmButton } from "./ConfirmButton.tsx";

// The few things a person may turn on or off. Kept to a button and a small
// panel in the top bar; what a person's real-life setup implies arrives in `real`.
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
  // Whether this person's setup says they have headphones, so Can't hear's masking noise can play;
  // they can still choose not to use it, but can't turn on what their setup rules out.
  maskNoiseAvailable: boolean;
  // This person's setup says they have no headphones (Can't see, Can't speak): captions carry
  // the game's sound instead, so the checkboxes say so rather than show a choice that isn't one.
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
              You said you have no headphones, so game sound is off and captions are on instead.
            </p>
          )}
          {role !== "mute" && (
            <label>
              <input
                type="checkbox"
                checked={settings.voiceMode === "toggle"}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    voiceMode: (e.target as HTMLInputElement).checked ? "toggle" : "hold",
                  })
                }
              />
              Press V to turn the mic on and off
            </label>
          )}
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
                  Masking noise needs headphones: say you have them in your setup, in the lobby.
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

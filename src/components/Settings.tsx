import { useState } from "preact/hooks";
import type { Settings as SettingsState } from "../client/settings.ts";
import type { Role } from "../game/types.ts";

// The few things a person may turn on or off. Kept to a button and a small
// panel in the top bar: the real-life presets arrive with the wizard (Task 19).
// Can't hear is told nothing in words or sound (they get faces and stamps,
// which are pictures), so captions, sound and speech are shown off and can't
// be changed, with the reason, rather than offering switches that do nothing.
export function Settings({
  role,
  settings,
  onChange,
}: {
  role: Role;
  settings: SettingsState;
  onChange: (next: SettingsState) => void;
}) {
  const [open, setOpen] = useState(false);
  const deaf = role === "deaf";
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
              checked={!deaf && settings.captions}
              disabled={deaf}
              aria-describedby={deaf ? "settings-note" : undefined}
              onChange={toggle("captions")}
            />
            Captions
          </label>
          <label>
            <input
              type="checkbox"
              checked={!deaf && settings.sound}
              disabled={deaf}
              aria-describedby={deaf ? "settings-note" : undefined}
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
          <label>
            <input type="checkbox" checked={settings.keepOpen} onChange={toggle("keepOpen")} />
            Keep the comms sheet open after sending
          </label>
        </fieldset>
      )}
    </>
  );
}

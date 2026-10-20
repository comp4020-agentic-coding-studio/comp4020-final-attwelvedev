import { useEffect, useRef, useState } from "preact/hooks";
import { readNickname, saveNickname } from "../client/nickname.ts";
import { loadSetup, saveSetup } from "../client/preferences.ts";
import { loadSettings, type Settings, saveSettings } from "../client/settings.ts";
import type { Setup } from "../net/protocol.ts";
import { YourSetup } from "./YourSetup.tsx";

// The one place to set yourself up outside a lobby. Everything is the browser's own saved
// preferences (ADRs 0008, 0009): no socket, nothing sent anywhere until a lobby is joined.
export function PreferencesForm({
  onSetup,
  showNickname = true,
}: {
  onSetup?: (next: Setup) => void; // in a lobby: tell the server too
  showNickname?: boolean; // in a lobby a name is changed on your row
}) {
  const [nickname, setNickname] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState("");
  const clear = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setNickname(readNickname());
    setSetup(loadSetup());
    setSettings(loadSettings("blind"));
  }, []);

  function said(what: string) {
    setSaved(`Saved ${what}`);
    if (clear.current) clearTimeout(clear.current);
    clear.current = setTimeout(() => setSaved(""), 2500);
  }

  function changeSetup(next: Setup) {
    setSetup(next);
    saveSetup({ ...next, done: true });
    onSetup?.(next);
    said("real life");
  }

  function changeSettings(next: Settings) {
    setSettings(next);
    saveSettings(next);
    said("playing");
  }

  const toggle = (key: "captions" | "sound" | "speech" | "highContrast") => (e: Event) =>
    settings && changeSettings({ ...settings, [key]: (e.target as HTMLInputElement).checked });

  return (
    <div class="prefs stack">
      <p class="saved" role="status">
        {saved}
      </p>

      {showNickname && (
        <section class="stack" aria-labelledby="you-title">
          <h2 id="you-title">You</h2>
          <div class="field">
            <label for="nickname">Nickname</label>
            <input
              id="nickname"
              value={nickname}
              maxLength={16}
              autoComplete="off"
              onInput={(e) => {
                const name = e.currentTarget.value;
                setNickname(name);
                saveNickname(name.trim());
                said("nickname");
              }}
            />
          </div>
        </section>
      )}

      <section class="stack" aria-labelledby="real-title">
        <h2 id="real-title">Real life</h2>
        {setup && <YourSetup setup={setup} onChange={changeSetup} heading={null} />}
      </section>

      <section class="stack" aria-labelledby="playing-title">
        <h2 id="playing-title">Playing</h2>
        {settings && (
          <form class="setup" aria-labelledby="playing-title" onSubmit={(e) => e.preventDefault()}>
            <label class="tick">
              <input type="checkbox" checked={settings.captions} onChange={toggle("captions")} />
              Captions
            </label>
            <label class="tick">
              <input type="checkbox" checked={settings.sound} onChange={toggle("sound")} />
              Game sound
            </label>
            <label class="tick">
              <input type="checkbox" checked={settings.speech} onChange={toggle("speech")} />
              Spoken lines
            </label>
            <label class="tick">
              <input
                type="checkbox"
                checked={settings.voiceMode === "toggle"}
                onChange={(e) =>
                  changeSettings({
                    ...settings,
                    voiceMode: e.currentTarget.checked ? "toggle" : "hold",
                  })
                }
              />
              Press V to turn the mic on and off
            </label>
            <label class="tick">
              <input
                type="checkbox"
                checked={settings.highContrast}
                onChange={toggle("highContrast")}
              />
              High contrast
            </label>
            <label class="volume">
              Masking noise volume
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.volume}
                onInput={(e) =>
                  changeSettings({ ...settings, volume: Number(e.currentTarget.value) })
                }
              />
            </label>
          </form>
        )}
      </section>
    </div>
  );
}

export function Preferences() {
  return (
    <div class="prefs stack">
      <h1>Preferences</h1>
      <p class="muted">
        Saved in this browser only. A lobby is told your real-life answers when you join it.
      </p>
      <PreferencesForm />
    </div>
  );
}

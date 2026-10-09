import { useState } from "preact/hooks";
import { honourLines } from "../client/honourLines.ts";
import { DEFAULT_SETTINGS, presetFor } from "../client/realLifePreset.ts";
import type { LobbySettings } from "../net/protocol.ts";

type Answers = { sameRoom: boolean; deafHasHeadphones: boolean; othersHaveHeadphones: boolean };

type Row = { key: keyof LobbySettings; label: string; sentence: (on: boolean) => string };

// One row per setting the wizard's answers imply, each with the sentence that
// explains it and its own toggle: the preset is a starting point, not a rule.
// Masking noise and captions-instead-of-sound exist to cover real speech and
// game audio around a shared table — neither means anything without one, so
// remote only ever offers the voice row.
function rowsFor(sameRoom: boolean): Row[] {
  const voice: Row = {
    key: "voice",
    label: "In-app voice",
    sentence: (on) =>
      on
        ? "The team talks through the app's voice chat."
        : sameRoom
          ? "The team talks in person, not through the app."
          : "The team is remote with the app's voice chat off: make sure everyone has another way to talk.",
  };
  if (!sameRoom) return [voice];
  return [
    {
      key: "maskNoise",
      label: "Masking noise",
      sentence: (on) =>
        on
          ? "Can't hear plays a quiet noise in their headphones, so they can't catch speech over the table."
          : "Can't hear gets no masking noise.",
    },
    {
      key: "othersSoundOff",
      label: "Captions instead of game sound",
      sentence: (on) =>
        on
          ? "Can't see and Can't speak get captions instead of game sound, so nothing plays out loud around the table."
          : "Can't see and Can't speak still get the game's sound.",
    },
    voice,
  ];
}

export function RealLifeWizard({
  settings,
  onApply,
  onClose,
}: {
  settings: LobbySettings;
  onApply: (next: LobbySettings) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"same-room" | "headphones" | "review">("same-room");
  const [answers, setAnswers] = useState<Answers>({
    sameRoom: settings.inPerson,
    deafHasHeadphones: settings.maskNoise,
    othersHaveHeadphones: !settings.othersSoundOff,
  });
  const [preset, setPreset] = useState<LobbySettings>(settings);

  function notSameRoom() {
    setAnswers((a) => ({ ...a, sameRoom: false }));
    setPreset({ ...DEFAULT_SETTINGS });
    setStep("review");
  }

  function sameRoom() {
    setAnswers((a) => ({ ...a, sameRoom: true }));
    setStep("headphones");
  }

  function answerHeadphones(deafHasHeadphones: boolean, othersHaveHeadphones: boolean) {
    const next = { ...answers, deafHasHeadphones, othersHaveHeadphones };
    setAnswers(next);
    setPreset(presetFor(next));
    setStep("review");
  }

  return (
    <section class="wizard" aria-label="Real-life setup">
      {step === "same-room" && (
        <fieldset>
          <legend>Are you all playing in the same room?</legend>
          <div class="wizard-actions">
            <button type="button" class="btn primary" onClick={sameRoom}>
              Yes, same room
            </button>
            <button type="button" class="btn" onClick={notSameRoom}>
              No, remote
            </button>
          </div>
        </fieldset>
      )}

      {step === "headphones" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget as HTMLFormElement;
            const deaf = (form.elements.namedItem("deaf-headphones") as RadioNodeList | null)
              ?.value;
            const others = (form.elements.namedItem("others-headphones") as RadioNodeList | null)
              ?.value;
            answerHeadphones(deaf === "yes", others === "yes");
          }}
        >
          <fieldset>
            <legend>Does Can't hear have their own headphones?</legend>
            <label>
              <input type="radio" name="deaf-headphones" value="yes" required /> Yes
            </label>
            <label>
              <input type="radio" name="deaf-headphones" value="no" /> No
            </label>
          </fieldset>
          <fieldset>
            <legend>Do Can't see and Can't speak have headphones?</legend>
            <label>
              <input type="radio" name="others-headphones" value="yes" required /> Yes
            </label>
            <label>
              <input type="radio" name="others-headphones" value="no" /> No
            </label>
          </fieldset>
          <div class="wizard-actions">
            <button type="submit" class="btn primary">
              Continue
            </button>
          </div>
        </form>
      )}

      {step === "review" && (
        <div class="wizard-review">
          {honourLines({ ...preset, inPerson: answers.sameRoom }).map((line) => (
            <p key={line} class="wizard-honour">
              {line}
            </p>
          ))}
          <ul class="wizard-rows">
            {rowsFor(answers.sameRoom).map((row) => (
              <li key={row.key}>
                <label>
                  <input
                    type="checkbox"
                    checked={preset[row.key]}
                    onChange={(e) =>
                      setPreset((p) => ({
                        ...p,
                        [row.key]: (e.target as HTMLInputElement).checked,
                      }))
                    }
                  />
                  {row.label}
                </label>
                <p>{row.sentence(preset[row.key])}</p>
              </li>
            ))}
          </ul>
          <div class="wizard-actions">
            <button
              type="button"
              class="btn primary"
              onClick={() => {
                onApply({ ...preset, inPerson: answers.sameRoom });
                onClose();
              }}
            >
              Use these settings
            </button>
            <button type="button" class="btn" onClick={() => setStep("same-room")}>
              Start over
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

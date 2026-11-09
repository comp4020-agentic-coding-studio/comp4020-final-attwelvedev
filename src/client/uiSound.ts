// Menu sounds (Task 92): soft ticks and chimes for buttons, toggles, errors, lobby joins and the role
// reveal. UI feedback, not game cues: they have no SoundCue and no parity row, each has a picture twin
// (see DESIGN.md "Menu sounds"). Each kind is a pure data plan, as chimeSound.ts does, so it can be
// tested; `uiSound` plays a plan on one shared AudioContext and never throws.
import { loadSettings, type Settings } from "./settings.ts";

export type UiSoundKind =
  | "press"
  | "toggle-on"
  | "toggle-off"
  | "error"
  | "join"
  | "leave"
  | "reveal"
  | "ready"
  | "all-ready";

export interface UiNote {
  at: number; // seconds from the start
  hz: number;
  to?: number; // slides to this pitch over `secs`
  wave: OscillatorType;
  secs: number;
  level: number;
}

export const UI_PLANS: Record<UiSoundKind, UiNote[]> = {
  press: [{ at: 0, hz: 700, to: 560, wave: "sine", secs: 0.05, level: 0.05 }],
  "toggle-on": [
    { at: 0, hz: 520, wave: "sine", secs: 0.06, level: 0.05 },
    { at: 0.06, hz: 780, wave: "sine", secs: 0.08, level: 0.05 },
  ],
  "toggle-off": [
    { at: 0, hz: 780, wave: "sine", secs: 0.06, level: 0.05 },
    { at: 0.06, hz: 520, wave: "sine", secs: 0.08, level: 0.05 },
  ],
  error: [{ at: 0, hz: 180, to: 130, wave: "triangle", secs: 0.18, level: 0.09 }],
  join: [
    { at: 0, hz: 523, wave: "triangle", secs: 0.14, level: 0.07 },
    { at: 0.11, hz: 784, wave: "triangle", secs: 0.22, level: 0.07 },
  ],
  leave: [
    { at: 0, hz: 784, wave: "triangle", secs: 0.14, level: 0.07 },
    { at: 0.11, hz: 523, wave: "triangle", secs: 0.22, level: 0.07 },
  ],
  reveal: [
    { at: 0, hz: 330, wave: "sine", secs: 0.3, level: 0.07 },
    { at: 0.12, hz: 494, wave: "sine", secs: 0.3, level: 0.07 },
    { at: 0.24, hz: 659, wave: "sine", secs: 0.5, level: 0.07 },
  ],
  ready: [{ at: 0, hz: 880, wave: "sine", secs: 0.25, level: 0.05 }],
  "all-ready": [
    { at: 0, hz: 523, wave: "triangle", secs: 0.25, level: 0.07 },
    { at: 0.1, hz: 659, wave: "triangle", secs: 0.25, level: 0.07 },
    { at: 0.2, hz: 784, wave: "triangle", secs: 0.25, level: 0.07 },
    { at: 0.3, hz: 1047, wave: "triangle", secs: 0.55, level: 0.08 },
  ],
};

let ctx: AudioContext | null = null;

const getContext = (): AudioContext | null => {
  if (ctx) return ctx;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    const unlock = () => void ctx?.resume().catch(() => undefined);
    for (const e of ["pointerdown", "keydown"]) window.addEventListener(e, unlock, { once: true });
    return ctx;
  } catch {
    return null;
  }
};

// `c` is for a test's fake context; the browser's shared one is used otherwise.
export function playPlan(c: AudioContext, plan: UiNote[]): void {
  const t0 = c.currentTime;
  for (const n of plan) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = n.wave;
    const start = t0 + n.at;
    osc.frequency.setValueAtTime(n.hz, start);
    if (n.to) osc.frequency.linearRampToValueAtTime(n.to, start + n.secs);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(n.level, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + n.secs);
    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(start + n.secs + 0.02);
  }
}

export function uiSound(
  kind: UiSoundKind,
  settings: Pick<Settings, "menuSounds">,
  c: AudioContext | null = null,
): void {
  if (!settings.menuSounds) return;
  try {
    // a spec sets `window.__uiSounds = []` (as `__cuesPlayed` does) to see which kinds were asked for
    (globalThis as { __uiSounds?: string[] }).__uiSounds?.push(kind);
    const use = c ?? getContext();
    if (!use) return;
    // A press is a gesture, so this is when a suspended context may wake. A suspended context's clock
    // stays at 0, so a note scheduled now would sound the moment it wakes: this one is dropped.
    if (use.state !== "running") {
      if (use.state === "suspended") void use.resume().catch(() => undefined);
      return;
    }
    playPlan(use, UI_PLANS[kind]);
  } catch {
    // a sound that does not play is not worth an error
  }
}

// What a press inside these is not a menu press: the game's own keys and wheel have game cues.
const SILENT = ".wheel, .touch-zone, canvas, [data-no-ui-sound]";

let installed = false;
let settingsNow: () => Pick<Settings, "menuSounds"> = () => ({ menuSounds: true });

// One delegated listener pair on `document`, called from each island's mount: a `button` click ticks,
// a checkbox change ticks up (on) or down (off). The listeners go on once, however many islands ask;
// the latest caller's `getSettings` is the one read (the game passes its live settings, which a
// blocked `localStorage` could never give back).
export function installUiSounds(getSettings: () => Pick<Settings, "menuSounds">): void {
  if (typeof document === "undefined") return;
  settingsNow = getSettings;
  if (installed) return;
  installed = true;
  document.addEventListener("click", (e) => {
    const el = e.target instanceof Element ? e.target : null;
    const button = el?.closest("button");
    if (!button || button.disabled || button.closest(SILENT)) return;
    uiSound("press", settingsNow());
  });
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || el.type !== "checkbox" || el.closest(SILENT)) return;
    uiSound(el.checked ? "toggle-on" : "toggle-off", settingsNow());
  });
}

// The lobby's change of people, by stable `who`: a reorder is neither a join nor a leave.
export function diffPeople(
  before: readonly string[],
  after: readonly string[],
): { joined: string[]; left: string[] } {
  return {
    joined: after.filter((w) => !before.includes(w)),
    left: before.filter((w) => !after.includes(w)),
  };
}

// The chime for a change of people, if there is one: only while the lobby is open. Once the game is on
// the lobby page still hears the people list change, and a teammate leaving mid-heist is not a lobby leave.
export function peopleSound(
  before: readonly string[],
  after: readonly string[],
  phase: "open" | "playing" | "done",
): "join" | "leave" | null {
  if (phase !== "open") return null;
  const { joined, left } = diffPeople(before, after);
  return joined.length > 0 ? "join" : left.length > 0 ? "leave" : null;
}

// The settings as saved in this browser: every island saves on change, so a press reads the latest.
export const savedSettings = (): Settings => loadSettings("blind");

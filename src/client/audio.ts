import type { SoundCue } from "../net/protocol.ts";

export interface GameAudio {
  resume(): void; // call from a tap or key press: browsers keep audio off until then
  play(sounds: SoundCue[]): void; // the sound cues of one view
  playClip(id: string): void; // a soundboard clip, from public/sounds/
  dispose(): void;
}

const STEP_GAP_MS = 260;
const OWN_STEP_GAP_MS = 290; // slower and deeper than other players' ticks, so it never merges with them
const BUMP_GAP_MS = 380;
const HUM_HZ = 110;

// The cues are made here rather than loaded, so there is nothing to download
// or credit: a soft tick for footsteps, a steady hum on a plate, a click for a
// door, and for the heist a lower tick for guards, a whir for a camera, a
// buzz for a laser, chimes, a siren and an alarm. Each is panned and scaled
// by the cue the server computed. Nothing flashes or flickers: a steady cue is
// a steady tone.
export function createAudio(): GameAudio {
  let ctx: AudioContext | null = null;
  let hum: { osc: OscillatorNode; gain: GainNode } | null = null;
  let noise: AudioBuffer | null = null;
  let lastStep = 0;
  let lastOwnStep = 0;
  let lastBump = 0;
  let lastGuard = 0;
  let lastLaser = 0;
  let lastAlarm = 0;

  const ensure = (): AudioContext | null => {
    if (ctx) return ctx;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    const frames = Math.floor(ctx.sampleRate * 0.05);
    noise = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    return ctx;
  };

  const panner = (c: AudioContext, pan: number): AudioNode => {
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = pan;
      p.connect(c.destination);
      return p;
    }
    return c.destination;
  };

  const tick = (c: AudioContext, cue: SoundCue) => {
    if (!noise) return;
    const src = c.createBufferSource();
    src.buffer = noise;
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 320;
    const gain = c.createGain();
    gain.gain.value = 0.5 * cue.gain;
    src.connect(filter).connect(gain).connect(panner(c, cue.pan));
    src.start();
  };

  // Your own step: a low, soft thump, centred. Other players' steps are the higher
  // bandpassed tick above, panned, so the two are never mistaken for each other.
  const ownStep = (c: AudioContext, cue: SoundCue) => {
    if (!noise) return;
    const src = c.createBufferSource();
    src.buffer = noise;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 150;
    const gain = c.createGain();
    gain.gain.value = 1.1 * cue.gain;
    src.connect(filter).connect(gain).connect(panner(c, 0));
    src.start();
  };

  const click = (c: AudioContext, cue: SoundCue) => {
    const osc = c.createOscillator();
    osc.type = "square";
    osc.frequency.value = 1400;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.25 * cue.gain, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.06);
    osc.connect(gain).connect(panner(c, cue.pan));
    osc.start();
    osc.stop(c.currentTime + 0.07);
  };

  // One short tone, optionally sliding from `from` to `to` Hz over `secs`.
  const tone = (
    c: AudioContext,
    cue: SoundCue,
    type: OscillatorType,
    from: number,
    to: number,
    secs: number,
    level: number,
    delay = 0, // seconds from now, so a few tones can make an arpeggio
  ) => {
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (to !== from) osc.frequency.linearRampToValueAtTime(to, t0 + secs);
    const gain = c.createGain();
    gain.gain.setValueAtTime(level * cue.gain, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + secs);
    osc.connect(gain).connect(panner(c, cue.pan));
    osc.start(t0);
    osc.stop(t0 + secs + 0.02);
  };

  // A soft rustle of cloth: a hiss, high-passed, for stepping into a hiding place.
  const rustle = (c: AudioContext, cue: SoundCue) => {
    if (!noise) return;
    const src = c.createBufferSource();
    src.buffer = noise;
    const filter = c.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 2500;
    const gain = c.createGain();
    gain.gain.value = 0.45 * cue.gain;
    src.connect(filter).connect(gain).connect(panner(c, cue.pan));
    src.start();
  };

  // The families, so they can be learned instead of memorised one by one:
  //   object clicks     plate, plate-up, door              short, dry
  //   things moving     crate, hide                        scrapes and rustles
  //   team progress     flag, exit, seq-ok                 a tone that rises with how many
  //   mistakes          seq-wrong                          low and buzzy
  //   successes         seq-open, cleared, loot, checkpoint   bright arpeggios and chimes
  const progress = (
    c: AudioContext,
    cue: SoundCue,
    notes: readonly number[],
    type: OscillatorType,
  ) => {
    const hz = notes[Math.max(0, Math.min(notes.length - 1, cue.n ?? 0))] as number;
    tone(c, cue, type, hz, hz, 0.2, 0.3);
  };

  const setHum = (c: AudioContext, level: number) => {
    if (!hum) {
      const osc = c.createOscillator();
      osc.type = "sine";
      osc.frequency.value = HUM_HZ;
      const gain = c.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(c.destination);
      osc.start();
      hum = { osc, gain };
    }
    hum.gain.gain.setTargetAtTime(level, c.currentTime, 0.04);
  };

  return {
    resume() {
      void ensure()?.resume();
    },
    playClip(id) {
      // a plain element: the clips are short, and a blocked autoplay just stays silent
      void new Audio(`/sounds/${encodeURIComponent(id)}.mp3`).play().catch(() => undefined);
    },
    play(sounds) {
      const c = ctx;
      if (c?.state !== "running") return;
      const now = performance.now();
      for (const s of sounds) {
        if (s.kind === "plate") tone(c, s, "square", 700, 520, 0.05, 0.22);
        else if (s.kind === "plate-up") tone(c, s, "square", 450, 340, 0.05, 0.14);
        else if (s.kind === "crate") {
          tone(c, s, "sawtooth", 120, 55, 0.24, 0.3); // the scrape
          tone(c, s, "sine", 70, 40, 0.14, 0.5); // and the thud
        } else if (s.kind === "flag") progress(c, s, [260, 330, 392, 494], "triangle");
        else if (s.kind === "exit") progress(c, s, [260, 440, 523, 659], "sine");
        else if (s.kind === "seq-ok") progress(c, s, [440, 523, 659, 784], "triangle");
        else if (s.kind === "seq-wrong") tone(c, s, "sawtooth", 150, 90, 0.3, 0.3);
        else if (s.kind === "seq-open") {
          [523, 659, 784].forEach((hz, i) => {
            tone(c, s, "triangle", hz, hz, 0.22, 0.3, i * 0.09);
          });
        } else if (s.kind === "hide") rustle(c, s);
        else if (s.kind === "cleared") {
          [523, 659, 784, 1047].forEach((hz, i) => {
            tone(c, s, "sine", hz, hz, 0.45, 0.3, i * 0.12);
          });
        }
      }
      const own = sounds.find((s) => s.kind === "step");
      if (own && now - lastOwnStep >= OWN_STEP_GAP_MS) {
        lastOwnStep = now;
        ownStep(c, own);
      }
      const bump = sounds.find((s) => s.kind === "bump");
      if (bump && now - lastBump >= BUMP_GAP_MS) {
        lastBump = now;
        tone(c, bump, "sine", 95, 45, 0.16, 0.7); // a dull thud: you hit something
      }
      const steps = sounds.filter((s) => s.kind === "footsteps");
      const loudest = steps.sort((a, b) => b.gain - a.gain)[0];
      if (loudest && now - lastStep >= STEP_GAP_MS) {
        lastStep = now;
        tick(c, loudest);
      }
      for (const s of sounds) if (s.kind === "door") click(c, s);
      for (const s of sounds) {
        if (s.kind === "camera") tone(c, s, "sawtooth", 500, 900, 0.35, 0.18);
        else if (s.kind === "loot") tone(c, s, "sine", 988, 1318, 0.25, 0.3);
        else if (s.kind === "checkpoint") tone(c, s, "triangle", 523, 784, 0.4, 0.3);
        else if (s.kind === "caught") tone(c, s, "square", 900, 500, 0.7, 0.25);
      }
      const guard = sounds.filter((s) => s.kind === "guard").sort((a, b) => b.gain - a.gain)[0];
      if (guard && now - lastGuard >= STEP_GAP_MS * 1.6) {
        lastGuard = now;
        tone(c, guard, "triangle", 130, 100, 0.12, 0.5);
      }
      const laser = sounds.find((s) => s.kind === "laser");
      if (laser && now - lastLaser >= 250) {
        lastLaser = now;
        tone(c, laser, "sawtooth", 220, 220, 0.2, 0.12);
      }
      // a steady two-tone, twice a second at most: well under the flashing limit
      const alarm = sounds.find((s) => s.kind === "alarm");
      if (alarm && now - lastAlarm >= 500) {
        lastAlarm = now;
        tone(c, alarm, "square", 740, 740, 0.22, 0.2);
      }
      const h = sounds.find((s) => s.kind === "hum");
      if (h || hum) setHum(c, h ? 0.12 * h.gain : 0);
    },
    dispose() {
      hum?.osc.stop();
      hum = null;
      void ctx?.close();
      ctx = null;
    },
  };
}

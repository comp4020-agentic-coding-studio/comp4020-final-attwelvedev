import type { SoundCue } from "../net/protocol.ts";

export interface GameAudio {
  resume(): void; // call from a tap or key press: browsers keep audio off until then
  play(sounds: SoundCue[]): void; // the sound cues of one view
  dispose(): void;
}

const STEP_GAP_MS = 260;
const HUM_HZ = 110;

// The cues are made here rather than loaded, so there is nothing to download
// or credit: a soft tick for footsteps, a steady hum on a plate, a click for a
// door. Each is panned and scaled by the cue the server computed.
export function createAudio(): GameAudio {
  let ctx: AudioContext | null = null;
  let hum: { osc: OscillatorNode; gain: GainNode } | null = null;
  let noise: AudioBuffer | null = null;
  let lastStep = 0;

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
    play(sounds) {
      const c = ctx;
      if (c?.state !== "running") return;
      const now = performance.now();
      const steps = sounds.filter((s) => s.kind === "footsteps");
      const loudest = steps.sort((a, b) => b.gain - a.gain)[0];
      if (loudest && now - lastStep >= STEP_GAP_MS) {
        lastStep = now;
        tick(c, loudest);
      }
      for (const s of sounds) if (s.kind === "door") click(c, s);
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

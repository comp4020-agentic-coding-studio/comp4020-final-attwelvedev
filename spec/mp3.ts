import { readFileSync } from "node:fs";

// MPEG audio layer III only (what the soundboard ships): the length of an mp3
// by walking its frames, so a spec can enforce the 3 s limit without decoding.
const BITRATE_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATE_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const RATE: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG 1
  2: [22050, 24000, 16000], // MPEG 2
  0: [11025, 12000, 8000], // MPEG 2.5
};

export function mp3Seconds(path: string): number {
  const buf = readFileSync(path);
  let at = 0;
  if (buf.toString("latin1", 0, 3) === "ID3") {
    at =
      10 + (((buf[6] ?? 0) << 21) | ((buf[7] ?? 0) << 14) | ((buf[8] ?? 0) << 7) | (buf[9] ?? 0));
  }
  let seconds = 0;
  while (at + 4 <= buf.length) {
    const [b0, b1, b2] = [buf[at] ?? 0, buf[at + 1] ?? 0, buf[at + 2] ?? 0];
    const version = (b1 >> 3) & 3;
    const layer = (b1 >> 1) & 3;
    const bitrateIndex = b2 >> 4;
    const rateIndex = (b2 >> 2) & 3;
    const sync = b0 === 0xff && (b1 & 0xe0) === 0xe0;
    if (
      !sync ||
      layer !== 1 ||
      version === 1 ||
      bitrateIndex === 0 ||
      bitrateIndex === 15 ||
      rateIndex === 3
    ) {
      at++; // not a frame header: tags and padding are stepped over
      continue;
    }
    const rate = RATE[version]?.[rateIndex] ?? 44100;
    const kbps = (version === 3 ? BITRATE_V1 : BITRATE_V2)[bitrateIndex] ?? 0;
    const samples = version === 3 ? 1152 : 576;
    const length = Math.floor(((samples / 8) * kbps * 1000) / rate) + ((b2 >> 1) & 1);
    seconds += samples / rate;
    at += length;
  }
  return seconds;
}

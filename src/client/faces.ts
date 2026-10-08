import { FACES } from "../game/channels.ts";

export const faceUrl = (file: string): string => `/faces/${file}`;

const cache = new Map<string, HTMLImageElement>();

// A face ready to draw on the canvas, or null while it is still loading (the
// pop is simply skipped that once). Only roles that receive Show ever ask.
export function faceImage(id: string): HTMLImageElement | null {
  const face = FACES.find((f) => f.id === id);
  if (!face) return null;
  let img = cache.get(id);
  if (!img) {
    img = new Image();
    img.src = faceUrl(face.file);
    cache.set(id, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

export function preloadFaces(): void {
  for (const face of FACES) faceImage(face.id);
}

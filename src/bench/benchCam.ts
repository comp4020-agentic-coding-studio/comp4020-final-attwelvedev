import type { Camera } from "../client/render/project.ts";

// The frame bench's camera: it pans slowly side to side and up and down, so the tile window and the
// horizon (and with it the sky, backdrop.ts) move as they do in play.
export function benchCam(cam: Camera, frame: number): Camera {
  return {
    ...cam,
    ox: cam.ox + Math.sin(frame / 60) * cam.scale * 3,
    oy: cam.oy + Math.cos(frame / 45) * cam.scale * 1.5,
  };
}

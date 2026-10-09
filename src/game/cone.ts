import type { Vec } from "./types.ts";

export interface ConeShape {
  origin: Vec; // tile units, the centre of whatever is looking
  facing: Vec; // a unit vector
  fovDeg: number;
  range: number; // tiles
}

const STEP = 0.1; // tiles between samples along a ray: the same fineness the server's line of sight uses

// The region a cone can really see: a fan of rays, each stopped at the face of the first
// blocked tile (a wall, a closed door, a hide spot) or at its range. Drawn as a polygon, so
// the light stops at walls and leaves a shadow behind cover, matching the server's
// rule for who is seen. The tile the viewer stands on never blocks it.
export function visiblePolygon(
  shape: ConeShape,
  blocked: (tx: number, ty: number) => boolean,
  rays = 48,
): Vec[] {
  const { origin, facing, fovDeg, range } = shape;
  const centre = Math.atan2(facing.y, facing.x);
  const half = (fovDeg / 2) * (Math.PI / 180);
  const home = { x: Math.floor(origin.x), y: Math.floor(origin.y) };
  const poly: Vec[] = [{ ...origin }];
  for (let i = 0; i <= rays; i++) {
    const a = centre - half + (2 * half * i) / rays;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const hit = (t: number): boolean => {
      const tx = Math.floor(origin.x + dx * t);
      const ty = Math.floor(origin.y + dy * t);
      return (tx !== home.x || ty !== home.y) && blocked(tx, ty);
    };
    let t = 0;
    while (t + STEP <= range) {
      if (hit(t + STEP)) {
        // The wall's face is somewhere in this step. Home in on it, so the ray ends
        // on the face itself and not up to a step short: that is what makes the lit
        // edge along a flat wall a straight line instead of a ragged one.
        let [lo, hi] = [t, t + STEP];
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2;
          if (hit(mid)) hi = mid;
          else lo = mid;
        }
        t = lo;
        break;
      }
      t += STEP;
    }
    poly.push({ x: origin.x + dx * t, y: origin.y + dy * t });
  }
  return poly;
}

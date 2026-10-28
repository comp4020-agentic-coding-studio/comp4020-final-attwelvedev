import type { Vec } from "../../game/types.ts";
import { WORLD } from "../tokens.ts";

// The dye pack (spec §4.1): failure is a toy, not the alarm. Pastel blotches on every figure until
// the reset, and a soft paint cloud from the station (the cloud is an fx: src/client/fx.ts).

const DYES = () => [WORLD.dyePink, WORLD.dyeMint, WORLD.dyeSky];

// A soft paint blotch: a lumpy round shape, the same every frame for the same seed.
export function splat(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  seed: number,
) {
  ctx.beginPath();
  const lobes = 7;
  for (let i = 0; i <= lobes * 2; i++) {
    const a = (i / (lobes * 2)) * Math.PI * 2;
    const wobble = 0.75 + 0.25 * Math.sin(seed * 3.1 + i * 1.7);
    const rr = r * (i % 2 === 0 ? wobble : wobble * 0.82);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// Blotches on a dyed figure: three, in the three dye colours, over the body and hat.
export function drawBlotches(ctx: CanvasRenderingContext2D, foot: Vec, s: number, seat: number) {
  const spots: [number, number, number][] = [
    [-0.14, -0.35, 0.12],
    [0.12, -0.6, 0.1],
    [0.02, -0.98, 0.09],
  ];
  const dyes = DYES();
  spots.forEach(([dx, dy, r], i) => {
    ctx.fillStyle = dyes[(i + seat) % dyes.length] as string;
    splat(ctx, foot.x + dx * s, foot.y + dy * s, r * s, seat * 5 + i);
    ctx.fill();
  });
}

// The cloud: a ring of splats around the station, growing and fading over its life (0 to 1).
export function drawCloud(
  ctx: CanvasRenderingContext2D,
  c: Vec,
  s: number,
  age: number,
  reducedMotion: boolean,
) {
  const grow = reducedMotion ? 1 : 0.4 + 0.6 * age;
  const dyes = DYES();
  ctx.save();
  ctx.globalAlpha = 0.8 * (1 - age);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    ctx.fillStyle = dyes[i % dyes.length] as string;
    splat(
      ctx,
      c.x + Math.cos(a) * s * 0.5 * grow,
      c.y + Math.sin(a) * s * 0.3 * grow,
      s * 0.28 * grow,
      i,
    );
    ctx.fill();
  }
  ctx.restore();
}

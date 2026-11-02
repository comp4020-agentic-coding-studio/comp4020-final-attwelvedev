import type { ItemId } from "../../game/rooms/format.ts";
import {
  EDGE_DARK,
  GLOSS_ALPHA,
  INK_CENTRE,
  ITEM_LAYERS,
  ITEM_MARGIN,
  ITEM_VIEW,
  inkWidth,
  type Layer,
  LIGHT,
  SHADE_ALPHA,
  SHADOW,
  STOPS,
  shadowPath,
  visibleLayers,
} from "../items.ts";
import { isHighContrast, WORLD } from "../tokens.ts";

// `hex` ("#rrggbb") moved `amount` of the way toward white (255) or black (0)
function mixHex(hex: string, toward: 0 | 255, amount: number): string {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (toward - c) * amount));
  return `rgb(${ch.join(",")})`;
}

// A keepsake on the canvas, centred on (x, y) and `size` px across (the 64 grid plus its margin):
// the same layers, gradients and numbers the HUD's ItemGlyph draws (src/client/items.ts), the fills
// from the world tokens so high contrast remaps them. High contrast also drops the gradients, the
// lights and the shadow, and draws every edge and ink in the line colour.
export function drawItem(
  ctx: CanvasRenderingContext2D,
  item: ItemId,
  x: number,
  y: number,
  size: number,
) {
  const def = ITEM_LAYERS[item];
  const k = size / ITEM_VIEW;
  const flat = isHighContrast();
  const turn = () => {
    if (!def.turn) return;
    ctx.translate(INK_CENTRE, INK_CENTRE);
    ctx.rotate((def.turn * Math.PI) / 180);
    ctx.translate(-INK_CENTRE, -INK_CENTRE);
  };
  const tone = (token: Layer["token"], dark: number): string =>
    flat || !token ? WORLD.line : mixHex(WORLD[token] as string, 0, dark);
  const paint = (l: Layer): string | CanvasGradient => {
    const [x1, y1, x2, y2] = l.axis ?? [LIGHT.from[0], LIGHT.from[1], LIGHT.to[0], LIGHT.to[1]];
    const g = l.radial
      ? ctx.createRadialGradient(l.radial[0], l.radial[1], 0, l.radial[0], l.radial[1], l.radial[2])
      : ctx.createLinearGradient(x1, y1, x2, y2);
    if (l.look === "shine" || l.look === "shade") {
      const c = l.look === "shine" ? "255,255,255" : "0,0,0";
      g.addColorStop(0, `rgba(${c},${l.look === "shine" ? GLOSS_ALPHA : SHADE_ALPHA})`);
      g.addColorStop(1, `rgba(${c},0.08)`);
      return g;
    }
    const base = WORLD[l.token ?? "card"] as string;
    for (const [at, toward, amt] of STOPS[l.look as keyof typeof STOPS])
      g.addColorStop(at, amt === 0 ? base : mixHex(base, toward ? 255 : 0, amt));
    return g;
  };

  ctx.save();
  ctx.translate(x - size / 2 + ITEM_MARGIN * k, y - size / 2 + ITEM_MARGIN * k);
  ctx.scale(k, k);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (!flat) {
    ctx.save();
    ctx.translate(SHADOW.dx, SHADOW.dy);
    turn();
    ctx.fillStyle = `rgba(0,0,0,${SHADOW.alpha})`;
    ctx.fill(new Path2D(shadowPath(item)));
    ctx.restore();
  }
  ctx.save();
  turn();
  for (const l of visibleLayers(item, size)) {
    const p = new Path2D(l.d);
    if (l.look === "ink") {
      ctx.strokeStyle = tone(l.token, l.dark ?? 0);
      ctx.lineWidth = inkWidth(l.w ?? 1, size);
      ctx.stroke(p);
    } else if (l.look === "shine" || l.look === "shade") {
      if (flat) continue;
      ctx.fillStyle = paint(l);
      ctx.fill(p);
    } else {
      ctx.fillStyle = flat ? (WORLD[l.token ?? "card"] as string) : paint(l);
      ctx.fill(p);
      if (l.edge) {
        ctx.strokeStyle = tone(l.token, EDGE_DARK);
        ctx.lineWidth = l.edge;
        ctx.stroke(p);
      }
    }
  }
  ctx.restore();
  ctx.restore();
}

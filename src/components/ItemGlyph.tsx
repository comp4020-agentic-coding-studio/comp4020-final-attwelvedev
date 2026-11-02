import {
  edgeCss,
  GLOSS_ALPHA,
  INK_CENTRE,
  ITEM_LAYERS,
  ITEM_MARGIN,
  ITEM_NAMES,
  ITEM_VIEW,
  inkCss,
  inkWidth,
  type Layer,
  LIGHT,
  mixCss,
  SHADE_ALPHA,
  SHADOW,
  STOPS,
  shadowPath,
  visibleLayers,
} from "../client/items.ts";
import type { ItemId } from "../game/rooms/format.ts";

// A keepsake, drawn from the one layer table the canvas reads too (src/client/items.ts): a drop
// shadow, then each layer in order: bodies in gradients with an edge tinted from their own token,
// lights over them, ink lines. High contrast zeroes --item-shade and hides the shadow and lights
// (game.css), leaving flat outlined fills. Decorative: say the name beside it.
export function ItemGlyph({ item, size = 48 }: { item: ItemId; size?: number }) {
  const def = ITEM_LAYERS[item];
  const layers = visibleLayers(item, size);
  const turn = def.turn ? `rotate(${def.turn} ${INK_CENTRE} ${INK_CENTRE})` : "";
  const gid = (l: Layer) => `ig-${item}-${def.layers.indexOf(l)}`;
  const gradient = (l: Layer) => {
    const [x1, y1, x2, y2] = l.axis ?? [LIGHT.from[0], LIGHT.from[1], LIGHT.to[0], LIGHT.to[1]];
    const axis = l.radial
      ? {
          cx: l.radial[0],
          cy: l.radial[1],
          r: l.radial[2],
          gradientUnits: "userSpaceOnUse" as const,
        }
      : { x1, y1, x2, y2, gradientUnits: "userSpaceOnUse" as const };
    const stops =
      l.look === "shine" || l.look === "shade" ? (
        <>
          <stop
            offset="0"
            stop-color={l.look === "shine" ? "#fff" : "#000"}
            stop-opacity={l.look === "shine" ? GLOSS_ALPHA : SHADE_ALPHA}
          />
          <stop
            offset="1"
            stop-color={l.look === "shine" ? "#fff" : "#000"}
            stop-opacity={l.look === "shine" ? 0.08 : 0.08}
          />
        </>
      ) : (
        STOPS[l.look as keyof typeof STOPS].map(([at, toward, amt]) => (
          <stop
            key={at}
            offset={at}
            style={`stop-color:${mixCss(l.token ?? "card", toward, amt)}`}
          />
        ))
      );
    return l.radial ? (
      <radialGradient id={gid(l)} {...axis}>
        {stops}
      </radialGradient>
    ) : (
      <linearGradient id={gid(l)} {...axis}>
        {stops}
      </linearGradient>
    );
  };
  return (
    <svg
      class="item-glyph"
      width={size}
      height={size}
      viewBox={`${-ITEM_MARGIN} ${-ITEM_MARGIN} ${ITEM_VIEW} ${ITEM_VIEW}`}
      aria-hidden="true"
      focusable="false"
      stroke-linejoin="round"
      stroke-linecap="round"
    >
      <title>{ITEM_NAMES[item]}</title>
      <defs>{layers.filter((l) => l.look !== "ink").map(gradient)}</defs>
      <path
        class="item-shadow"
        d={shadowPath(item)}
        transform={`translate(${SHADOW.dx} ${SHADOW.dy}) ${turn}`}
        fill="#000"
        fill-opacity={SHADOW.alpha}
        stroke="none"
      />
      <g transform={turn || undefined}>
        {layers.map((l) =>
          l.look === "ink" ? (
            <path
              d={l.d}
              fill="none"
              style={`stroke:${inkCss(l.token, l.dark)}`}
              stroke-width={inkWidth(l.w ?? 1, size)}
            />
          ) : l.look === "shine" || l.look === "shade" ? (
            <path class="item-light" d={l.d} fill={`url(#${gid(l)})`} stroke="none" />
          ) : (
            <path
              d={l.d}
              fill={`url(#${gid(l)})`}
              style={l.edge ? `stroke:${edgeCss(l.token ?? "card")}` : undefined}
              stroke-width={l.edge}
            />
          ),
        )}
      </g>
    </svg>
  );
}

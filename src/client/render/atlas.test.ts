import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentHue, setContrast, setDusk, setHue, worldStamp } from "../tokens.ts";
import { atlasKey, atlasTile, clearAtlas, drawTile } from "./atlas.ts";
import { setRise } from "./project.ts";

// A context that records its calls: enough for the atlas's paint and blit.
function recorder() {
  const calls: { name: string; args: unknown[] }[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_t, name) => {
        if (name === "getTransform") return () => ({ a: 2 });
        return (...args: unknown[]) => calls.push({ name: String(name), args });
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

// A stand-in document whose canvases hand out a recording context.
function fakeDocument() {
  const made: { width: number; height: number }[] = [];
  vi.stubGlobal("document", {
    createElement: () => {
      const c = { width: 0, height: 0, getContext: () => recorder().ctx };
      made.push(c);
      return c;
    },
  });
  return made;
}

beforeEach(() => {
  clearAtlas();
  setRise(1);
});
afterEach(() => {
  vi.unstubAllGlobals();
  setContrast(false);
  setHue(undefined);
  setDusk(false, 0, true);
  setRise(1);
});

describe("the tile atlas", () => {
  it("the same key returns the same canvas; a WORLD change (setContrast, setHue) gives a new one", () => {
    fakeDocument();
    const { ctx } = recorder();
    const paint = vi.fn();
    const a = atlasTile(atlasKey(ctx, 28), "floor:0", paint);
    expect(atlasTile(atlasKey(ctx, 28), "floor:0", paint)).toBe(a);
    expect(paint).toHaveBeenCalledTimes(1);
    setContrast(true);
    const b = atlasTile(atlasKey(ctx, 28), "floor:0", paint);
    expect(b).not.toBe(a);
    setContrast(false);
    const c = atlasTile(atlasKey(ctx, 28), "floor:0", paint);
    setHue(currentHue() === "teal" ? "amber" : "teal");
    expect(atlasTile(atlasKey(ctx, 28), "floor:0", paint)).not.toBe(c);
    // its size is the tile at the frame's device scale
    expect((a as unknown as { width: number }).width).toBe(56);
  });

  it("worldStamp() changes whenever WORLD changes", () => {
    const seen = [worldStamp()];
    setDusk(true, 0, true);
    seen.push(worldStamp());
    setDusk(false, 0, true);
    seen.push(worldStamp());
    setContrast(true);
    seen.push(worldStamp());
    setContrast(false);
    seen.push(worldStamp());
    setHue("violet");
    seen.push(worldStamp());
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("while LIVE.wall < TILT.wall the atlas is not used", () => {
    fakeDocument();
    const { ctx, calls } = recorder();
    setRise(0.5);
    drawTile(ctx, 28, "wall-top", 0, 0, 28, 23, (c, ox, oy) => c.fillRect(ox, oy, 28, 23));
    expect(calls.map((c) => c.name)).toEqual(["fillRect"]);
    setRise(1);
    const settled = recorder();
    drawTile(settled.ctx, 28, "wall-top", 0, 0, 28, 23, (c, ox, oy) => c.fillRect(ox, oy, 28, 23));
    expect(settled.calls.map((c) => c.name)).toEqual(["drawImage"]);
  });

  it("with no document, tiles are drawn directly", () => {
    expect(typeof document).toBe("undefined");
    const { ctx, calls } = recorder();
    drawTile(ctx, 28, "floor:1", 5, 7, 28, 23, (c, ox, oy) => c.fillRect(ox, oy, 28, 23));
    expect(calls).toEqual([{ name: "fillRect", args: [5, 7, 28, 23] }]);
  });
});

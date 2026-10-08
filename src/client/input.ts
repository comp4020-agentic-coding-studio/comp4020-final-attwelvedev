import type { PlayerInput } from "../game/types.ts";

export interface InputSource {
  read(): PlayerInput;
  dispose(): void;
}

const LEFT = ["a", "arrowleft"];
const RIGHT = ["d", "arrowright"];
const UP = ["w", "arrowup"];
const DOWN = ["s", "arrowdown"];
const GAME_KEYS = new Set([...LEFT, ...RIGHT, ...UP, ...DOWN, " "]);
const DEAD_ZONE = 0.2;
const STICK_PX = 48; // how far the knob travels from the centre

const typing = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  const tag = el?.tagName;
  return (
    tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable === true
  );
};

// Keyboard (WASD or arrows, Space) and a touch joystick, merged into one
// PlayerInput. The joystick and Act button are the elements in `root` marked
// data-joystick and data-act, if there are any (touch devices only render them).
export function createInput(root: HTMLElement): InputSource {
  const keys = new Set<string>();
  let seq = 0;
  let stick = { x: 0, y: 0 };
  let actHeld = false;
  let live = true;

  const onKeyDown = (e: KeyboardEvent): void => {
    if (typing(e.target)) return;
    const k = e.key.toLowerCase();
    if (!GAME_KEYS.has(k)) return;
    e.preventDefault(); // arrows and Space must not scroll the page
    keys.add(k);
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    keys.delete(e.key.toLowerCase());
  };
  const clear = (): void => {
    keys.clear();
    stick = { x: 0, y: 0 };
    actHeld = false;
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", clear);

  const cleanups: (() => void)[] = [];
  const joystick = root.querySelector<HTMLElement>("[data-joystick]");
  if (joystick) {
    let pointer: number | null = null;
    const setStick = (e: PointerEvent): void => {
      const box = joystick.getBoundingClientRect();
      const dx = (e.clientX - (box.left + box.width / 2)) / STICK_PX;
      const dy = (e.clientY - (box.top + box.height / 2)) / STICK_PX;
      const len = Math.hypot(dx, dy);
      const k = len > 1 ? 1 / len : 1;
      stick = len < DEAD_ZONE ? { x: 0, y: 0 } : { x: dx * k, y: dy * k };
      joystick.style.setProperty("--jx", String(stick.x));
      joystick.style.setProperty("--jy", String(stick.y));
    };
    const release = (): void => {
      pointer = null;
      stick = { x: 0, y: 0 };
      joystick.style.setProperty("--jx", "0");
      joystick.style.setProperty("--jy", "0");
    };
    const down = (e: PointerEvent): void => {
      pointer = e.pointerId;
      joystick.setPointerCapture?.(e.pointerId);
      setStick(e);
    };
    const move = (e: PointerEvent): void => {
      if (e.pointerId === pointer) setStick(e);
    };
    const up = (e: PointerEvent): void => {
      if (e.pointerId === pointer) release();
    };
    joystick.addEventListener("pointerdown", down);
    joystick.addEventListener("pointermove", move);
    joystick.addEventListener("pointerup", up);
    joystick.addEventListener("pointercancel", up);
    cleanups.push(() => {
      joystick.removeEventListener("pointerdown", down);
      joystick.removeEventListener("pointermove", move);
      joystick.removeEventListener("pointerup", up);
      joystick.removeEventListener("pointercancel", up);
    });
  }
  const act = root.querySelector<HTMLElement>("[data-act]");
  if (act) {
    const down = (e: PointerEvent): void => {
      actHeld = true;
      act.setPointerCapture?.(e.pointerId);
    };
    const up = (): void => {
      actHeld = false;
    };
    act.addEventListener("pointerdown", down);
    act.addEventListener("pointerup", up);
    act.addEventListener("pointercancel", up);
    cleanups.push(() => {
      act.removeEventListener("pointerdown", down);
      act.removeEventListener("pointerup", up);
      act.removeEventListener("pointercancel", up);
    });
  }

  const axis = (neg: string[], pos: string[]): number =>
    (pos.some((k) => keys.has(k)) ? 1 : 0) - (neg.some((k) => keys.has(k)) ? 1 : 0);
  const clamp = (n: number): number => Math.max(-1, Math.min(1, n));

  return {
    read() {
      return {
        seq: ++seq,
        move: {
          x: clamp(axis(LEFT, RIGHT) + stick.x) + 0,
          y: clamp(axis(UP, DOWN) + stick.y) + 0,
        },
        act: keys.has(" ") || actHeld,
      };
    },
    dispose() {
      if (!live) return;
      live = false;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clear);
      for (const off of cleanups) off();
      clear();
    },
  };
}

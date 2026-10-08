// The phone's joystick and Act button. createInput (src/client/input.ts) finds
// them by their data attributes and wires the touches. The context-menu guard
// lives here, on the elements themselves: a handler added later by an effect left
// a gap in which a long press could still raise the browser's menu mid-game.
const noMenu = (e: Event): void => e.preventDefault();

// `disabled` greys the controls out (the room is cleared: there is nothing to steer).
export function TouchControls({ disabled = false }: { disabled?: boolean }) {
  return (
    <div class={disabled ? "touch-zone is-off" : "touch-zone"}>
      <div
        class="joystick"
        data-joystick
        role="application"
        aria-label="Move"
        aria-disabled={disabled ? "true" : undefined}
        onContextMenu={noMenu}
      >
        <span class="knob" />
      </div>
      <button type="button" class="act" data-act disabled={disabled} onContextMenu={noMenu}>
        Act
      </button>
    </div>
  );
}

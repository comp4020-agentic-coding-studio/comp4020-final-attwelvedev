import type { CommsApi } from "./CommsWheel.tsx";

// The phone's joystick, comms buttons and Act button. createInput
// (src/client/input.ts) finds the joystick and Act by their data attributes and
// wires the touches. The context-menu guard lives here, on the elements
// themselves: a handler added later by an effect left a gap in which a long
// press could still raise the browser's menu mid-game.
const noMenu = (e: Event): void => e.preventDefault();

// `disabled` greys the controls out (the room is cleared: there is nothing to steer).
export function TouchControls({
  disabled = false,
  comms,
  quickLabel,
}: {
  disabled?: boolean;
  comms?: { current: CommsApi | null };
  quickLabel?: string; // what the quick slot sends, for its label
}) {
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
      {comms && (
        <div class="touch-comms">
          <button
            type="button"
            class="quick-btn"
            aria-label={`Quick send: ${quickLabel ?? ""}`}
            disabled={disabled}
            onClick={() => comms.current?.quick()}
            onContextMenu={noMenu}
          >
            <span class="quick-label">{quickLabel}</span>
          </button>
          <button
            type="button"
            class="wheel-btn"
            aria-label="Comms wheel: hold, drag to a choice, let go to send"
            disabled={disabled}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              comms.current?.wheelDown(e);
            }}
            onContextMenu={noMenu}
          >
            Wheel
          </button>
        </div>
      )}
      <button type="button" class="act" data-act disabled={disabled} onContextMenu={noMenu}>
        Act
      </button>
    </div>
  );
}

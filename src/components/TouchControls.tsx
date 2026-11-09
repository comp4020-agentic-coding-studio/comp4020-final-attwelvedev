import type { CommsApi } from "./CommsWheel.tsx";

// The phone's joystick, comms buttons and Act button. createInput
// (src/client/input.ts) finds the joystick and Act by their data attributes and
// wires the touches. The context-menu guard lives here, on the elements
// themselves: a handler added later by an effect left a gap in which a long
// press could still raise the browser's menu mid-game.
const noMenu = (e: Event): void => e.preventDefault();

// `moveDisabled` greys out the joystick and Act (the room is cleared: there is nothing to steer);
// the comms buttons stay live, so the crew can still talk.
export function TouchControls({
  moveDisabled = false,
  comms,
  quickLabel,
  act,
}: {
  moveDisabled?: boolean;
  comms?: { current: CommsApi | null };
  quickLabel?: string; // what the quick slot sends, for its label
  act?: string; // what Act would do here (the view's words): the button says it
}) {
  return (
    <div class="touch-zone">
      <div
        class={moveDisabled ? "joystick is-off" : "joystick"}
        data-joystick
        role="application"
        aria-label="Move"
        aria-disabled={moveDisabled ? "true" : undefined}
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
            onClick={() => comms.current?.quick()}
            onContextMenu={noMenu}
          >
            <span class="quick-label">{quickLabel}</span>
          </button>
          <button
            type="button"
            class="wheel-btn"
            aria-label="Comms wheel: hold, drag to a choice, let go to send"
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
      <button
        type="button"
        class={["act", act && "has-hint", moveDisabled && "is-off"].filter(Boolean).join(" ")}
        data-act
        disabled={moveDisabled}
        aria-label={act ? `Act: ${act}` : "Act"}
        onContextMenu={noMenu}
      >
        {act ?? "Act"}
      </button>
    </div>
  );
}

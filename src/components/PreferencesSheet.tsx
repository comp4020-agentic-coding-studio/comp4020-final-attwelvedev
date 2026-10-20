import { useEffect, useRef } from "preact/hooks";
import type { Setup } from "../net/protocol.ts";
import { PreferencesForm } from "./Preferences.tsx";

// The preferences, in the lobby, without leaving it. Every change is saved and sent the moment it
// is made, so closing the sheet commits nothing and a host starting while it is open loses
// nothing (setup never gates Start).
export function PreferencesSheet({
  open,
  onClose,
  onSetup,
}: {
  open: boolean;
  onClose: () => void;
  onSetup: (next: Setup) => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    close.current?.focus();
    return () => before?.focus?.();
  }, [open]);
  if (!open) return null;
  return (
    // a press on the scrim itself (not on the sheet) closes it
    <div
      class="scrim"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        class="modal sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          else if (e.key === "Tab") {
            const items = [
              ...e.currentTarget.querySelectorAll<HTMLElement>("button, input, a[href]"),
            ].filter((el) => !(el as HTMLInputElement).disabled);
            const at = items.indexOf(document.activeElement as HTMLElement);
            const next = e.shiftKey ? at - 1 : at + 1;
            if (next < 0 || next >= items.length) {
              e.preventDefault();
              items[(next + items.length) % items.length]?.focus();
            }
          }
        }}
      >
        <div class="sheet-head">
          <h2 id="sheet-title" class="modal-title">
            Preferences
          </h2>
          <button ref={close} type="button" class="btn" onClick={onClose}>
            Done
          </button>
        </div>
        <PreferencesForm onSetup={onSetup} showNickname={false} />
      </div>
    </div>
  );
}

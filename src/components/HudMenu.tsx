import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { ConfirmButton } from "./ConfirmButton.tsx";

// The [≡] menu: settings, the two restart proposals, and Leave. A restart asks twice, since it asks
// everyone else; Leave is one press here because the page's own modal asks before it goes.
export function HudMenu({
  settings,
  onAsk,
  onLeave,
  leaveLabel = "Leave game",
  restarts = true,
}: {
  settings?: ComponentChildren; // the Settings control, which owns its own panel; a watcher has none
  onAsk?: (kind: "room" | "heist") => void;
  onLeave: () => void;
  leaveLabel?: string;
  restarts?: boolean; // a watcher proposes nothing
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const away = (event: PointerEvent) => {
      const at = event.target as Node | null;
      if (at && !panel.current?.contains(at) && !button.current?.contains(at)) setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", away);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", away);
    };
  }, [open]);
  return (
    <div class="hud-menu">
      <button
        ref={button}
        type="button"
        class="hud-btn hud-menu-btn"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls="hud-menu"
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">≡</span>
      </button>
      {open && (
        <div class="hud-menu-panel" id="hud-menu" ref={panel}>
          {settings}
          {restarts && onAsk && (
            <>
              <ConfirmButton
                class="hud-btn"
                label="Restart room"
                confirmLabel="Sure? Ask to restart room"
                onConfirm={() => {
                  setOpen(false);
                  onAsk("room");
                }}
              />
              <ConfirmButton
                class="hud-btn"
                label="Restart heist"
                confirmLabel="Sure? Ask to restart heist"
                onConfirm={() => {
                  setOpen(false);
                  onAsk("heist");
                }}
              />
            </>
          )}
          <button
            type="button"
            class="hud-btn danger"
            onClick={() => {
              setOpen(false);
              onLeave();
            }}
          >
            {leaveLabel}
          </button>
        </div>
      )}
    </div>
  );
}

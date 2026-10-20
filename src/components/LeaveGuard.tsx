import { useEffect, useRef } from "preact/hooks";

// "Leave the lobby? You'll lose your spot." Catches the page's own links (the browser can't
// style its prompt, so a tab close or address-bar change gets the native one) and shows a glass
// modal for them and for the Leave button. The parent owns whether it is open and what leaving
// does, since leaving needs the socket.
export function LeaveGuard({
  active,
  open,
  onAsk,
  onStay,
  onLeave,
  title,
  body,
  leaveLabel,
}: {
  active: boolean; // this page is somewhere a person would lose their place by leaving
  open: boolean;
  onAsk: (href: string) => void; // a link was clicked: where it was going
  onStay: () => void;
  onLeave: () => void;
  title: string;
  body: string;
  leaveLabel: string;
}) {
  const stay = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!active) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = ""; // the browser shows its own wording
    };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download"))
        return;
      const to = new URL(link.href, location.href);
      if (to.origin !== location.origin) return;
      if (to.pathname === location.pathname && to.search === location.search) return; // same page
      event.preventDefault();
      onAsk(to.pathname + to.search + to.hash);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, [active, onAsk]);

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    stay.current?.focus();
    return () => before?.focus?.();
  }, [open]);

  if (!open) return null;
  return (
    <div class="scrim">
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-title"
        aria-describedby="leave-body"
        onKeyDown={(e) => {
          if (e.key === "Escape") onStay();
          else if (e.key === "Tab") {
            // two buttons: keep focus between them
            const buttons = [...e.currentTarget.querySelectorAll("button")];
            const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const next = e.shiftKey ? at - 1 : at + 1;
            if (next < 0 || next >= buttons.length) {
              e.preventDefault();
              buttons[(next + buttons.length) % buttons.length]?.focus();
            }
          }
        }}
      >
        <h2 id="leave-title" class="modal-title">
          {title}
        </h2>
        <p id="leave-body">{body}</p>
        <div class="actions">
          <button ref={stay} type="button" class="btn primary" onClick={onStay}>
            Stay
          </button>
          <button type="button" class="btn danger" onClick={onLeave}>
            {leaveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

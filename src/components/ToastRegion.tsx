import { useEffect, useRef, useState } from "preact/hooks";

export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface Toast {
  id: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  // more than one button ("Undo", "Edit note"); used instead of actionLabel
  actions?: ToastAction[];
}

const DEFAULT_MS = 8000;

// Plain props, nothing of the pantry, so the offers feed can reuse it. The
// region is a polite live region; a toast waits while the pointer or focus is
// on it, so Undo can't vanish under a finger or a keyboard user.
export function ToastRegion({
  toasts,
  onDismiss,
  durationMs = DEFAULT_MS,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
  durationMs?: number;
}) {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} durationMs={durationMs} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
  durationMs,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
  durationMs: number;
}) {
  const [paused, setPaused] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Pointer or focus on the toast holds it open. Wired here rather than in the
  // markup because the div itself isn't interactive; its button is.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const hold = () => setPaused(true);
    const release = () => setPaused(el.matches(":hover") || el.contains(document.activeElement));
    el.addEventListener("mouseenter", hold);
    el.addEventListener("focusin", hold);
    el.addEventListener("mouseleave", release);
    const blur = () => setPaused(el.matches(":hover"));
    el.addEventListener("focusout", blur);
    return () => {
      el.removeEventListener("mouseenter", hold);
      el.removeEventListener("focusin", hold);
      el.removeEventListener("mouseleave", release);
      el.removeEventListener("focusout", blur);
    };
  }, []);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), durationMs);
    return () => window.clearTimeout(timer);
  }, [paused, toast.id, onDismiss, durationMs]);

  const actions: ToastAction[] =
    toast.actions ??
    (toast.onAction && toast.actionLabel
      ? [{ label: toast.actionLabel, onAction: toast.onAction }]
      : []);

  return (
    <div class="toast" ref={root}>
      <span>{toast.text}</span>
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={() => {
            action.onAction();
            onDismiss(toast.id);
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

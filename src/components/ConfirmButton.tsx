import { useEffect, useRef, useState } from "preact/hooks";

const ASK_MS = 3000;

// A button that asks first: the first press changes its label ("Sure? ..."), and
// only a second press within 3 s does the thing. For anything that would wipe the
// room or end the session, where a stray tap must not be enough.
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  class: cls = "",
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  class?: string;
}) {
  const [asking, setAsking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const press = () => {
    if (timer.current) clearTimeout(timer.current);
    if (!asking) {
      setAsking(true);
      timer.current = setTimeout(() => setAsking(false), ASK_MS);
      return;
    }
    setAsking(false);
    onConfirm();
  };
  return (
    <>
      <button type="button" class={asking ? `${cls} asking` : cls} onClick={press}>
        {asking ? confirmLabel : label}
      </button>
      <span class="sr-only" role="status">
        {asking ? "Press again to confirm" : ""}
      </span>
    </>
  );
}

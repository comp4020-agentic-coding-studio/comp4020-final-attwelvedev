import { useEffect, useState } from "preact/hooks";
import type { GameSocket } from "../client/socket.ts";

export interface Pause {
  waitingFor: string;
  until: number; // on this page's clock: the server says how long is left
  choosing: boolean;
  gone: boolean;
  forReady: boolean;
}

// The game is held for a seat: a dropped connection, or someone who left and the host must choose
// what takes their place. Shared by the reveal, the game and the watchers' screen, since the host
// may be any of them.
export function usePause(socket: GameSocket): {
  pause: Pause | null;
  secondsLeft: number;
  back: string | null;
} {
  const [pause, setPause] = useState<Pause | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [back, setBack] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const offs = [
      socket.on("pause", (m) => {
        setBack(null);
        setPause({
          waitingFor: m.waitingFor,
          until: performance.now() + m.left,
          choosing: m.choosing,
          gone: m.gone ?? false,
          forReady: m.forReady ?? false,
        });
      }),
      socket.on("resume", (m) => {
        setPause(null);
        setBack(m.back);
        clearTimeout(timer);
        if (m.back) timer = setTimeout(() => setBack(null), 4000);
      }),
    ];
    return () => {
      for (const off of offs) off();
      clearTimeout(timer);
    };
  }, [socket]);

  useEffect(() => {
    if (!pause) return;
    const tick = () => setSecondsLeft((pause.until - performance.now()) / 1000);
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [pause]);

  return { pause, secondsLeft, back };
}

import type { RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { micAfter } from "../client/mic.ts";
import type { Settings } from "../client/settings.ts";
import type { GameSocket } from "../client/socket.ts";
import { type Capture, startCapture, voiceSupport } from "../client/voice/capture.ts";
import { startPlayer, type VoicePlayer } from "../client/voice/playback.ts";
import type { Role } from "../game/types.ts";

export type VoiceStatus =
  | "starting"
  | "ready" // can talk: the mic is open, nothing is sent until the key or button is held
  | "blocked" // the person or the browser said no to the microphone
  | "no-encoder" // this browser has no WebCodecs audio
  | "insecure" // the page isn't one the browser lets use a microphone
  | "host-off"
  | "none"; // this role doesn't speak (Can't speak), so there is nothing to show

export interface Voice {
  status: VoiceStatus;
  talking: boolean;
  talk(on: boolean): void;
  mode: Settings["voiceMode"];
  // a V or mic-button event, read by the mode: hold follows the key, toggle flips on each press
  mic(event: "down" | "up" | "off"): void;
  speaking: ReadonlySet<number>; // seats heard in the last moment: for the "talking" badge
  lagging: boolean;
}

const SPEAKING_MS = 400;

// Push-to-talk voice for one page: the microphone for the roles that may Say (Can't see, Can't hear),
// and playback for the roles that hear Say (Can't see, Can't speak). `frames` is the page's count of
// voice frames received, written to a data attribute so a spec can see audio arriving.
export function useVoice(
  socket: GameSocket,
  role: Role,
  voiceOn: boolean,
  frames: RefObject<HTMLElement>,
  mode: Settings["voiceMode"] = "hold",
): Voice {
  const sends = role !== "mute";
  const hears = role !== "deaf";
  const support = voiceSupport();
  const [status, setStatus] = useState<VoiceStatus>(
    !voiceOn ? "host-off" : support !== "ok" ? support : sends ? "starting" : "none",
  );
  const [talking, setTalking] = useState(false);
  const [speaking, setSpeaking] = useState<ReadonlySet<number>>(new Set());
  const [lagging, setLagging] = useState(false);
  const capture = useRef<Capture | null>(null);

  useEffect(() => {
    if (!voiceOn || support !== "ok") return;
    let gone = false;
    if (sends) {
      startCapture(socket).then(
        (c) => {
          if (gone) return c.stop();
          capture.current = c;
          setStatus("ready");
        },
        () => !gone && setStatus("blocked"),
      );
    }
    let player: VoicePlayer | null = null;
    if (hears) {
      let count = 0;
      const timers = new Map<number, ReturnType<typeof setTimeout>>();
      player = startPlayer(socket, {
        onFrame: (seat) => {
          count++;
          if (frames.current) frames.current.dataset.voiceFrames = String(count);
          clearTimeout(timers.get(seat));
          setSpeaking((now) => (now.has(seat) ? now : new Set(now).add(seat)));
          timers.set(
            seat,
            setTimeout(
              () =>
                setSpeaking((now) => {
                  const next = new Set(now);
                  next.delete(seat);
                  return next;
                }),
              SPEAKING_MS,
            ),
          );
        },
        onLag: setLagging,
      });
      if (frames.current) frames.current.dataset.voiceFrames = "0";
    }
    return () => {
      gone = true;
      capture.current?.stop();
      capture.current = null;
      player?.stop();
    };
  }, [socket, sends, hears, voiceOn, support, frames]);

  const open = useRef(false);
  function talk(on: boolean): void {
    if (!capture.current) return;
    capture.current.talk(on);
    open.current = on;
    setTalking(on);
  }

  function mic(event: "down" | "up" | "off"): void {
    const next = micAfter(mode, open.current, event);
    if (next !== open.current) talk(next);
  }

  // switching the setting while the mic is live must not leave it open
  useEffect(() => {
    if (open.current) talk(false);
  }, [mode]);

  return { status, talking, talk, mode, mic, speaking, lagging };
}

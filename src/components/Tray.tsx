import { useEffect, useRef, useState } from "preact/hooks";
import { trayFor } from "../client/hud.ts";
import { keyAction, type Sheet as SheetId } from "../client/keys.ts";
import type { GameSocket } from "../client/socket.ts";
import {
  CALLOUTS,
  CLIPS,
  COOLDOWN_MS,
  FACES,
  STAMP_COOLDOWN_MS,
  STAMPS,
} from "../game/channels.ts";
import { ROLE_LABEL, type Role } from "../game/types.ts";
import type { ClientMsg } from "../net/protocol.ts";
import { ROLE_GLYPH } from "./RoleShape.tsx";
import { SaySheet } from "./SaySheet.tsx";
import { HOTBAR, Sheet } from "./SheetGrid.tsx";
import { ShowSheet, type ShowTab } from "./ShowSheet.tsx";
import { SoundSheet } from "./SoundSheet.tsx";
import type { Voice } from "./useVoice.ts";

type Clock = "say" | "sound" | "show" | "stamp";

const TOAST_MS = 3000;
const SHOW_KEYS = [
  ["1 2 3", "open Say, Sound, Show"],
  ["1–9", "pick in the open sheet"],
  ["Enter", "write a message (Say)"],
  ["V (hold)", "talk, if your role can Say"],
  ["0", "other six faces or clips (Show, Sound)"],
  ["F  T", "Faces or Stamps (Show)"],
  ["Esc", "close"],
  ["WASD or arrows", "move"],
  ["Space", "act"],
] as const;

const isTextField = (el: EventTarget | null): boolean => {
  const t = el as HTMLElement | null;
  if (!t) return false;
  if (t.isContentEditable || t.tagName === "TEXTAREA") return true;
  return t.tagName === "INPUT" && ["text", "search", ""].includes((t as HTMLInputElement).type);
};

// What a role is told when it taps a family it can't send on.
const cantSend = (role: Role, label: string): string =>
  role === "mute" && label === "Say"
    ? "Can't speak: no voice, text or callouts"
    : `${ROLE_LABEL[role]}: can't send ${label}`;

export function Tray({
  role,
  socket,
  keepOpen,
  onTyping,
  voice,
}: {
  role: Role;
  socket: GameSocket;
  keepOpen: boolean;
  onTyping: (typing: boolean) => void;
  voice: Voice;
}) {
  const tiles = trayFor(role);
  const [open, setOpen] = useState<SheetId | null>(null);
  const [tab, setTab] = useState<ShowTab>("faces");
  const [page, setPage] = useState(0); // which six faces keys 1–6 send
  const [writing, setWriting] = useState(false);
  const [typing, setTyping] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [until, setUntil] = useState<Partial<Record<Clock, number>>>({});
  const [now, setNow] = useState(Date.now());
  const [cheat, setCheat] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  // seconds left on a clock, rounded up so it never shows 0 while still cooling
  const wait = (clock: Clock): number => Math.max(0, Math.ceil(((until[clock] ?? 0) - now) / 1000));

  function say(message: string): void {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }

  function close(): void {
    setOpen(null);
    setWriting(false);
  }

  // `clock` is the cooldown this send will start, so a press during it is
  // refused here with a number rather than round-tripping to the server.
  function send(msg: ClientMsg, clock: Clock | null): void {
    if (clock && wait(clock) > 0) {
      say(`Wait ${wait(clock)} s`);
      return;
    }
    socket.send(msg);
    if (!keepOpen) close();
  }

  // The server names each cooldown; the countdown runs on this device's clock
  // so a phone whose clock is off still counts down truthfully.
  useEffect(() => {
    const offCooldown = socket.on("cooldown", (m) => {
      const clock: Clock = m.stamp ? "stamp" : m.family;
      const ms = m.stamp ? STAMP_COOLDOWN_MS : COOLDOWN_MS[m.family];
      setUntil((u) => ({ ...u, [clock]: Date.now() + ms }));
      setNow(Date.now());
    });
    const offError = socket.on("error", (m) => {
      if (m.code === "cooldown" || m.code === "cant-send") say(m.message);
    });
    return () => {
      offCooldown();
      offError();
      clearTimeout(toastTimer.current);
    };
  }, [socket]);

  const cooling = Object.values(until).some((u) => (u ?? 0) > now);
  useEffect(() => {
    if (!cooling) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [cooling]);

  useEffect(() => {
    if (writing) field.current?.focus();
  }, [writing]);

  useEffect(() => {
    onTyping(typing);
  }, [typing, onTyping]);

  // The keys read the latest state through a ref, so the listener is added once.
  const live = useRef({ open, tab, typing, page, voice });
  live.current = { open, tab, typing, page, voice };
  const pick = useRef<(index: number) => void>(() => undefined);
  pick.current = (index) => {
    const sheet = live.current.open;
    if (sheet === "say") {
      const callout = CALLOUTS[index];
      if (callout) send({ t: "say", kind: "callout", callout }, null);
    } else if (sheet === "sound") {
      const clip = index < HOTBAR ? CLIPS[live.current.page * HOTBAR + index] : undefined;
      if (clip) send({ t: "sound", clip: clip.id }, "sound");
    } else if (sheet === "show") {
      if (live.current.tab === "faces") {
        const face = index < HOTBAR ? FACES[live.current.page * HOTBAR + index] : undefined;
        if (face) send({ t: "show", kind: "face", id: face.id }, "show");
      } else {
        const stamp = STAMPS[index];
        if (stamp) send({ t: "show", kind: "stamp", id: stamp }, "stamp");
      }
    }
  };

  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      // Enter on a focused button is that button's click, not "write a message"
      if (e.key === "Enter" && target?.tagName === "BUTTON") return;
      const { open: shown } = live.current;
      const action = keyAction(shown, e.key, isTextField(e.target));
      if (!action) return;
      if (action.type === "talk") {
        e.preventDefault();
        if (!e.repeat && live.current.voice.status === "ready") live.current.voice.talk(true);
        return;
      }
      if (action.type === "keys") {
        setCheat(true); // no preventDefault: Tab must still move focus
        return;
      }
      e.preventDefault();
      if (action.type === "close") close();
      else if (action.type === "tab") setTab(action.tab);
      else if (action.type === "page") {
        const { open: sheet, tab: shown } = live.current;
        if (sheet === "sound" || (sheet === "show" && shown === "faces")) setPage((p) => 1 - p);
      } else if (action.type === "text") setWriting(true);
      else if (action.type === "pick") pick.current(action.index);
      else openSheet(action.sheet);
    };
    const up = (e: KeyboardEvent): void => {
      if (e.key === "Tab") setCheat(false);
      if (e.key.toLowerCase() === "v") live.current.voice.talk(false);
    };
    const blur = (): void => {
      setCheat(false);
      live.current.voice.talk(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  function openSheet(sheet: SheetId): void {
    const tile = trayFor(role).find((t) => t.family === sheet);
    if (!tile) return;
    if (!tile.canSend) {
      say(cantSend(role, tile.label));
      return;
    }
    setWriting(false);
    setPage(0); // keys 1–6 start on the first six
    setTab("faces"); // and "3 then 1" is always the first face
    setOpen(sheet);
  }

  const tile = open ? tiles.find((t) => t.family === open) : null;
  return (
    <div class="tray-wrap">
      {toast && (
        <p class="toast" role="status">
          {toast}
        </p>
      )}
      {cheat && (
        <dl class="cheat" aria-label="Keys">
          {SHOW_KEYS.map(([k, what]) => (
            <div key={k}>
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      )}
      {open && tile && (
        <Sheet
          family={open}
          label={tile.label}
          receivers={tile.receivers}
          youReceive={tile.youReceive}
          wait={wait(open === "show" && tab === "stamps" ? "stamp" : open)}
        >
          {open === "say" && (
            <SaySheet
              onCallout={(callout) => send({ t: "say", kind: "callout", callout }, null)}
              writing={writing}
              onWrite={() => setWriting(true)}
              field={field}
              onText={(text) => {
                if (text.trim() === "") return;
                socket.send({ t: "say", kind: "text", text });
                if (!keepOpen) close();
              }}
              onFocus={setTyping}
              voice={voice}
            />
          )}
          {open === "sound" && (
            <SoundSheet
              wait={wait("sound")}
              page={page}
              onClip={(clip) => send({ t: "sound", clip }, "sound")}
            />
          )}
          {open === "show" && (
            <ShowSheet
              tab={tab}
              onTab={setTab}
              page={page}
              faceWait={wait("show")}
              stampWait={wait("stamp")}
              onFace={(id) => send({ t: "show", kind: "face", id }, "show")}
              onStamp={(id) => send({ t: "show", kind: "stamp", id }, "stamp")}
            />
          )}
        </Sheet>
      )}
      <ul class="tray" aria-label="Ways to talk">
        {tiles.map((t, i) => {
          const left = wait(t.family);
          return (
            <li key={t.family}>
              <button
                type="button"
                class={t.canSend ? "tile" : "tile cant"}
                aria-disabled={t.canSend ? undefined : "true"}
                aria-expanded={t.canSend ? open === t.family : undefined}
                aria-controls={open === t.family ? "sheet" : undefined}
                onClick={() => (open === t.family ? close() : openSheet(t.family))}
              >
                <span class="tile-name">
                  <kbd>{i + 1}</kbd> {t.label}
                </span>
                {t.canSend ? (
                  <span class="tile-to">
                    <span class="sr-only">
                      goes to {t.receivers.map((r) => ROLE_LABEL[r]).join(" and ")}
                    </span>
                    <span aria-hidden="true">
                      →{" "}
                      {t.receivers.map((r) => (
                        <span key={r} class={r === role ? "glyph me" : "glyph"}>
                          {ROLE_GLYPH[r]}
                        </span>
                      ))}
                    </span>
                  </span>
                ) : (
                  <span class="tile-cant">Can't send</span>
                )}
                {left > 0 && (
                  <span
                    class="cd"
                    style={{ "--p": left / (COOLDOWN_MS[t.family] / 1000) }}
                    role="timer"
                    aria-label={`${t.label} ready in ${left} seconds`}
                  >
                    <span class="cd-n">{left}</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

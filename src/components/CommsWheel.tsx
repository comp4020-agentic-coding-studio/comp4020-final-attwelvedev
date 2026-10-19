import { useEffect, useRef, useState } from "preact/hooks";
import { faceUrl } from "../client/faces.ts";
import { STAMP_FACE } from "../client/hud.ts";
import { keyAction } from "../client/keys.ts";
import type { GameSocket } from "../client/socket.ts";
import {
  aimFrom,
  DRAW_MS,
  defaultPage,
  FLICK_PX,
  PAGE_LABEL,
  PAGE_METHOD,
  PAGES,
  type Page,
  pageSlots,
  quickSlot,
  releaseAction,
  requestFor,
  type Slot,
  sendersOf,
  slotXY,
  TAB_DWELL_MS,
  tabAt,
  tabXY,
} from "../client/wheel.ts";
import {
  CENTRE_INDEX,
  hasCentre,
  insideOutline,
  type Mode,
  modeFor,
  outlineOf,
  slotSize,
  tallestHalf,
  wheelScale,
} from "../client/wheelLayout.ts";
import { COOLDOWN_MS, FACES, type Stamp } from "../game/channels.ts";
import { canSend, type Method, type Role, type Seat, type Vec } from "../game/types.ts";
import type { CrewMember } from "../net/protocol.ts";
import { ReceiverLine } from "./ReceiverLine.tsx";
import { RoleShape } from "./RoleShape.tsx";
import type { Voice } from "./useVoice.ts";

type Source = "key" | "mouse" | "touch" | "click"; // click: opened by the Comms button, stays open

const PIN_MS = 500; // a touch held on one slot this long pins it to the quick slot
const TOAST_MS = 2500;
const NOUN: Record<Method, string> = {
  callout: "callouts",
  text: "text",
  voice: "voice",
  clip: "clips",
  face: "faces",
  mark: "marks",
};
const KEYS = [
  ["Q (hold)", "open the comms wheel; flick to send without it"],
  ["1–4", "switch page while the wheel is open"],
  ["Enter", "write a message"],
  ["V", "talk"],
  ["Esc", "cancel"],
  ["WASD or arrows", "move"],
  ["Space", "act"],
] as const;

const isTextField = (el: EventTarget | null): boolean => {
  const t = el as HTMLElement | null;
  if (!t) return false;
  if (t.isContentEditable || t.tagName === "TEXTAREA") return true;
  return t.tagName === "INPUT" && ["text", "search", ""].includes((t as HTMLInputElement).type);
};

// What the phone's wheel button and quick slot call into.
export interface CommsApi {
  wheelDown(e: PointerEvent): void; // the wheel button was pressed: held, or tapped to open it
  quick(): void; // the quick slot was pressed
  toggle(): void; // the Comms button: open the wheel and leave it open, or close it
}

interface Hold {
  source: Source;
  origin: Vec; // client px where the press began: aim is the pointer's offset from here
  at: number; // performance.now() of the press
  page: Page;
  drawn: boolean;
  centre: Vec; // client px of the drawn wheel's centre: a drawn wheel is aimed by the cursor over it
  mode: Mode; // wide frames get the ring for Faces and Clips, narrow ones a 4x3 grid
  frame: { w: number; h: number }; // the frame the wheel is drawn in, for its scale
  pinned: boolean; // a long press pinned a slot: letting go sends nothing
  aimIndex: number | null;
  aimSince: number;
  tabSince: { page: Page; at: number } | null;
}

// The comms wheel (a marking menu), mark placement, the cooldown numbers and
// the comms keys. Everything it decides is in client/wheel.ts and client/keys.ts;
// this draws the wheel, listens, and sends.
export function CommsWheel({
  role,
  me,
  crew,
  socket,
  quick,
  voice,
  api,
  onPin,
  onText,
  onClose,
  onOwnFace,
  typing,
  toTile,
}: {
  role: Role;
  me: Seat;
  crew: CrewMember[];
  socket: GameSocket;
  quick: string | null;
  voice: Voice;
  api: { current: CommsApi | null };
  onPin: (id: string) => void;
  onText: () => void; // Enter: open the text field
  onClose: () => void; // Esc: close the text field
  // A face you sent, once the server has accepted it. You are not sent your own message back, so
  // this is how your own character gets the face over its head, as every other player's does.
  onOwnFace: (id: string) => void;
  typing: boolean;
  // the tile centre under a client point, or null off the map; `open` is false for a wall
  toTile: (clientX: number, clientY: number) => { at: Vec; open: boolean } | null;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const hold = useRef<Hold | null>(null);
  const pointer = useRef<Vec>({ x: 0, y: 0 });
  const lastPage = useRef<Page>(defaultPage(role));
  const [shown, setShown] = useState<{
    page: Page;
    centre: Vec;
    aim: number | null;
    tab: Page | null;
    finger: Vec | null; // touch only: where the thumb has moved to, since it is not over the wheel
  } | null>(null);
  const [placing, setPlacing] = useState<Slot | null>(null);
  const [ghost, setGhost] = useState<Vec | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [keys, setKeys] = useState(false);
  const [until, setUntil] = useState<Partial<Record<Method, number>>>({});
  const [now, setNow] = useState(Date.now());
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const sentFace = useRef<string | null>(null); // the face id last asked for, until the server confirms

  // the latest props and state, read by the listeners added once
  const live = useRef({
    role,
    me,
    crew,
    socket,
    quick,
    voice,
    typing,
    placing,
    until,
    toTile,
    onOwnFace,
  });
  live.current = {
    role,
    me,
    crew,
    socket,
    quick,
    voice,
    typing,
    placing,
    until,
    toTile,
    onOwnFace,
  };

  const wait = (m: Method): number =>
    Math.max(0, Math.ceil(((live.current.until[m] ?? 0) - Date.now()) / 1000));

  function say(message: string): void {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }

  // The server names each cooldown; the countdown runs on this device's clock.
  useEffect(() => {
    const offCooldown = socket.on("cooldown", (m) => {
      setUntil((u) => ({ ...u, [m.method]: Date.now() + COOLDOWN_MS[m.method] }));
      setNow(Date.now());
      // the server accepted a face: it is on its way to everyone else, so show it over your own head
      if (m.method === "face" && sentFace.current) {
        live.current.onOwnFace(sentFace.current);
        sentFace.current = null;
      }
    });
    const offError = socket.on("error", (m) => {
      if (m.code === "cooldown" || m.code === "cant-send" || m.code === "not-in-sight") {
        sentFace.current = null;
        say(m.message);
      }
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

  const frameBox = (): DOMRect | null =>
    layer.current?.parentElement?.getBoundingClientRect() ?? null;

  // Sends a slot: refuses what the role can't send or what is still cooling
  // with a line saying why, starts placing a mark, or sends.
  function activate(slot: Slot): void {
    const { role: r, crew: c, me: seat, socket: s } = live.current;
    if (!canSend(r, slot.method)) {
      const who = sendersOf(slot.method, c, seat).map((m) => m.nickname);
      say(`You can't send ${NOUN[slot.method]}.${who.length ? ` ${who.join(" and ")} can.` : ""}`);
      return;
    }
    const left = wait(slot.method);
    if (left > 0) {
      say(`Wait ${left} s`);
      return;
    }
    if (slot.method === "mark") {
      setPlacing(slot);
      return;
    }
    const msg = requestFor(slot);
    if (!msg) return;
    if (msg.method === "face") sentFace.current = msg.id;
    s.send({ t: "send", msg });
    say(`Sent: ${slot.name}`);
  }
  const act = useRef(activate);
  act.current = activate;

  function place(clientX: number, clientY: number): void {
    const slot = live.current.placing;
    if (!slot) return;
    const hit = live.current.toTile(clientX, clientY);
    if (!hit?.open) {
      say("Not in sight");
      return;
    }
    live.current.socket.send({
      t: "send",
      msg: { method: "mark", id: slot.id.slice(5) as Stamp, at: hit.at },
    });
    say(`Sent: ${slot.name}`);
    setPlacing(null);
    setGhost(null);
  }

  // ---- the wheel's hold ----

  // Drawn, the cursor itself aims: its offset from the wheel's centre. Before the
  // wheel is drawn there is nothing to point at, so a flick is the movement since the press.
  const scaleOf = (h: Hold): number => wheelScale(h.page, h.mode, h.frame.w, h.frame.h);

  const offset = (h: Hold): Vec => {
    // A key or the right mouse button draws the wheel under a cursor that can see it, so the
    // cursor aims. A thumb is on the wheel button, away from the wheel: it aims by direction.
    const from = h.drawn && h.source !== "touch" ? h.centre : h.origin;
    const k = h.drawn ? scaleOf(h) : 1;
    return { x: (pointer.current.x - from.x) / k, y: (pointer.current.y - from.y) / k };
  };

  function refresh(h: Hold): void {
    if (!h.drawn) return;
    const rel = offset(h);
    const aim = aimFrom(h.page, h.mode, rel, { x: 0, y: 0 });
    const finger = h.source === "touch" ? rel : null;
    const tab = tabAt(h.page, h.mode, rel.x, rel.y);
    const t = performance.now();
    if (aim !== h.aimIndex) {
      h.aimIndex = aim;
      h.aimSince = t;
    }
    if (tab !== (h.tabSince?.page ?? null)) h.tabSince = tab ? { page: tab, at: t } : null;
    setShown((s) => s && { ...s, aim, tab, finger, page: h.page });
  }

  function draw(h: Hold): void {
    if (hold.current !== h || h.drawn) return;
    h.drawn = true;
    const box = frameBox();
    const w = box?.width ?? 0;
    const hgt = box?.height ?? 0;
    h.mode = modeFor(w);
    h.frame = { w, h: hgt };
    // The key and the phone open it in the middle of the frame; the right mouse button
    // under the cursor. Either way it then stays put through page changes, so the centre
    // is clamped by the biggest page's extent in this mode and every page fits wherever it opened.
    let centre: Vec = { x: w / 2, y: hgt / 2 };
    if (h.source === "mouse" && box) {
      let halfW = 0;
      let halfH = 0;
      for (const p of PAGES) {
        const o = outlineOf(p, h.mode);
        const k = wheelScale(p, h.mode, w, hgt);
        halfW = Math.max(halfW, (o.kind === "circle" ? o.r : o.halfW) * k);
        halfH = Math.max(halfH, (o.kind === "circle" ? o.r : o.halfH) * k + 40);
      }
      centre = {
        x: w > 2 * halfW ? Math.max(halfW, Math.min(w - halfW, h.origin.x - box.left)) : w / 2,
        y: hgt > 2 * halfH ? Math.max(halfH, Math.min(hgt - halfH, h.origin.y - box.top)) : hgt / 2,
      };
    }
    h.centre = { x: (box?.left ?? 0) + centre.x, y: (box?.top ?? 0) + centre.y };
    setShown({ page: h.page, centre, aim: null, tab: null, finger: null });
    refresh(h);
  }

  function open(source: Source, origin: Vec): void {
    if (hold.current) return;
    const h: Hold = {
      source,
      origin,
      at: performance.now(),
      page: lastPage.current,
      drawn: false,
      centre: origin,
      mode: "wide",
      frame: { w: 0, h: 0 },
      pinned: false,
      aimIndex: null,
      aimSince: performance.now(),
      tabSince: null,
    };
    hold.current = h;
    setPlacing(null);
    if (source !== "click") setTimeout(() => draw(h), DRAW_MS);
  }

  // The Comms button, or a tap on the phone's wheel button: the wheel is drawn at once, in the
  // middle, and stays open until a slot is clicked or it is dismissed.
  function openClick(): void {
    if (hold.current) return;
    setPlacing(null);
    open("click", { ...pointer.current });
    const h = hold.current as Hold | null;
    if (h) draw(h);
  }

  function setPage(h: Hold, page: Page): void {
    h.page = page;
    lastPage.current = page;
    h.aimIndex = null;
    refresh(h);
  }

  function finish(send: boolean): void {
    const h = hold.current;
    if (!h) return;
    hold.current = null;
    setShown(null);
    if (!send || h.pinned) return;
    const rel = offset(h);
    const r = releaseAction(h.page, h.mode, { drawn: h.drawn, dx: rel.x, dy: rel.y });
    // on a phone, back on the button is a cancel
    if (h.source === "touch" && h.drawn && Math.hypot(rel.x, rel.y) < 24) return;
    if (r.kind !== "send") return;
    const slot = pageSlots(h.page)[r.index];
    if (slot) act.current(slot);
  }

  // dwell: a page label held 300 ms switches page; a touch held 500 ms on a slot pins it
  useEffect(() => {
    if (!shown) return;
    const timer = setInterval(() => {
      const h = hold.current;
      if (!h?.drawn) return;
      const t = performance.now();
      if (h.tabSince && h.tabSince.page !== h.page && t - h.tabSince.at >= TAB_DWELL_MS) {
        setPage(h, h.tabSince.page);
      }
      // a thumb resting on the button before it moves is not a long press on a slot
      const moved = Math.hypot(offset(h).x, offset(h).y) >= FLICK_PX;
      if (
        h.source === "touch" &&
        moved &&
        h.aimIndex !== null &&
        !h.pinned &&
        t - h.aimSince >= PIN_MS
      ) {
        const slot = pageSlots(h.page)[h.aimIndex];
        if (slot && canSend(live.current.role, slot.method)) {
          h.pinned = true;
          onPin(slot.id);
          say(`Pinned ${slot.name} to the quick slot`);
        }
      }
    }, 50);
    return () => clearInterval(timer);
  }, [shown === null]);

  // ---- listeners, added once ----

  useEffect(() => {
    api.current = {
      wheelDown(e) {
        if (live.current.placing) {
          setPlacing(null);
          setGhost(null);
          return;
        }
        pointer.current = { x: e.clientX, y: e.clientY };
        open("touch", { x: e.clientX, y: e.clientY });
      },
      quick() {
        act.current(quickSlot(live.current.role, live.current.quick));
      },
      toggle() {
        if (hold.current) finish(false);
        else openClick();
      },
    };
    const frame = layer.current?.parentElement;
    const inFrame = (el: EventTarget | null): boolean =>
      !!frame && el instanceof Node && frame.contains(el);

    const down = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      // Enter on a focused button is that button's click, not "write a message"
      if (e.key === "Enter" && target?.tagName === "BUTTON") return;
      const l = live.current;
      const a = keyAction(
        l.role,
        { wheel: hold.current !== null, typing: isTextField(e.target) },
        e,
      );
      if (!a) return;
      if (a.type === "keys") {
        setKeys(true); // no preventDefault: Tab must still move focus
        return;
      }
      if (a.type === "talk") {
        e.preventDefault();
        if (!e.repeat && l.voice.status === "ready") l.voice.talk(true);
        return;
      }
      e.preventDefault();
      if (a.type === "close") {
        if (hold.current) finish(false);
        setPlacing(null);
        setGhost(null);
        onClose();
      } else if (a.type === "text") onText();
      else if (a.type === "wheel") {
        if (!e.repeat) open("key", { ...pointer.current });
      } else if (a.type === "page") {
        if (hold.current) setPage(hold.current, a.page);
      }
    };
    const up = (e: KeyboardEvent): void => {
      if (e.key === "Tab") setKeys(false);
      const k = e.key.toLowerCase();
      if (k === "q" && hold.current?.source === "key") finish(true);
      if (k === "v") live.current.voice.talk(false);
    };
    const blur = (): void => {
      setKeys(false);
      finish(false);
      live.current.voice.talk(false);
    };
    const move = (e: PointerEvent): void => {
      pointer.current = { x: e.clientX, y: e.clientY };
      if (live.current.placing) setGhost({ x: e.clientX, y: e.clientY });
      const h = hold.current;
      if (h) refresh(h);
    };
    const pdown = (e: PointerEvent): void => {
      pointer.current = { x: e.clientX, y: e.clientY };
      const h = hold.current;
      if (h?.source === "click" && e.button === 0) {
        const el = e.target as HTMLElement | null;
        // the Comms and wheel buttons toggle it themselves
        if (el?.closest(".talk-comms, .wheel-btn")) return;
        e.preventDefault();
        e.stopPropagation();
        const tab = el?.closest<HTMLElement>(".wheel-tab");
        if (tab?.dataset.page) {
          setPage(h, tab.dataset.page as Page);
          return;
        }
        const rel = offset(h);
        const index = aimFrom(h.page, h.mode, pointer.current, h.centre);
        if (index !== null && insideOutline(h.page, h.mode, rel.x, rel.y)) {
          const slot = pageSlots(h.page)[index];
          if (slot) {
            // a refused slot (can't send, cooling) leaves the wheel open to choose again
            const keep = !canSend(live.current.role, slot.method) || wait(slot.method) > 0;
            if (!keep) finish(false);
            act.current(slot);
          }
        } else finish(false);
        return;
      }
      if (e.pointerType === "mouse" && e.button === 2 && inFrame(e.target)) {
        e.preventDefault();
        open("mouse", { x: e.clientX, y: e.clientY });
      } else if (live.current.placing && e.button === 0 && inFrame(e.target)) {
        e.preventDefault();
        place(e.clientX, e.clientY);
      }
    };
    const pup = (e: PointerEvent): void => {
      const h = hold.current;
      if (!h || h.source === "key" || h.source === "click") return;
      // a quick tap on the phone's wheel button, with no wheel drawn and no drag, opens the
      // wheel to choose from instead of cancelling
      if (
        h.source === "touch" &&
        !h.drawn &&
        e.type === "pointerup" &&
        performance.now() - h.at < DRAW_MS &&
        Math.hypot(e.clientX - h.origin.x, e.clientY - h.origin.y) < FLICK_PX
      ) {
        hold.current = null;
        openClick();
        return;
      }
      if (h.source === "mouse" && e.button !== 2) return;
      pointer.current = { x: e.clientX, y: e.clientY };
      finish(e.type === "pointerup");
    };
    const menu = (e: Event): void => {
      if (inFrame(e.target)) e.preventDefault();
    };
    const wheel = (e: WheelEvent): void => {
      const h = hold.current;
      if (!h) return;
      e.preventDefault();
      const i = PAGES.indexOf(h.page) + (e.deltaY > 0 ? 1 : -1);
      const next = PAGES[(i + PAGES.length) % PAGES.length];
      if (next) setPage(h, next);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerdown", pdown);
    window.addEventListener("pointerup", pup);
    window.addEventListener("pointercancel", pup);
    window.addEventListener("contextmenu", menu);
    window.addEventListener("wheel", wheel, { passive: false });
    return () => {
      api.current = null;
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", pdown);
      window.removeEventListener("pointerup", pup);
      window.removeEventListener("pointercancel", pup);
      window.removeEventListener("contextmenu", menu);
      window.removeEventListener("wheel", wheel);
    };
  }, []);

  // ---- drawing ----

  const slots = shown ? pageSlots(shown.page) : [];
  const mode: Mode = hold.current?.mode ?? "wide";
  const wheelK = shown && hold.current ? scaleOf(hold.current) : 1;
  const outline = outlineOf(shown?.page ?? "talk", mode);
  const outlineHalfW = outline.kind === "circle" ? outline.r : outline.halfW;
  const outlineHalfH = outline.kind === "circle" ? outline.r : outline.halfH;
  const box = slotSize(shown?.page ?? "talk", mode);
  const method = shown ? PAGE_METHOD[shown.page] : "callout";
  const sendable = canSend(role, method);
  const aimed = shown?.aim != null ? slots[shown.aim] : undefined;
  const senders = sendersOf(method, crew, me);

  return (
    <div class="comms-layer" ref={layer}>
      {toast && (
        <p class="comms-toast" role="status">
          {toast}
        </p>
      )}
      {keys && (
        <dl class="comms-keys" aria-label="Keys">
          {KEYS.map(([k, what]) => (
            <div key={k}>
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      )}
      {placing && (
        <>
          <p class="comms-place-note" role="status">
            Tap where, in sight (Esc cancels)
          </p>
          {ghost && layer.current && (
            <span
              class="comms-ghost"
              aria-hidden="true"
              style={{
                left: `${ghost.x - (frameBox()?.left ?? 0)}px`,
                top: `${ghost.y - (frameBox()?.top ?? 0)}px`,
              }}
            >
              {STAMP_FACE[placing.id.slice(5) as Stamp]}
            </span>
          )}
        </>
      )}
      {shown && (
        <section
          class={[
            mode === "narrow" ? "wheel is-narrow" : "wheel",
            hold.current?.source === "click" ? "is-click" : "",
          ]
            .join(" ")
            .trim()}
          aria-label={`Comms wheel: ${PAGE_LABEL[shown.page]}`}
          style={{
            left: `${shown.centre.x}px`,
            top: `${shown.centre.y}px`,
            scale: String(wheelK),
            "--plate-top": `${tallestHalf(mode) + 8}px`,
          }}
        >
          <span
            class={outline.kind === "circle" ? "wheel-outline is-circle" : "wheel-outline"}
            aria-hidden="true"
            style={{
              width: `${2 * outlineHalfW}px`,
              height: `${2 * outlineHalfH}px`,
              left: `${-outlineHalfW}px`,
              top: `${-outlineHalfH}px`,
            }}
          />
          <ul class="wheel-tabs" aria-label="Pages">
            {PAGES.map((p) => {
              const { x, y } = tabXY(p, mode);
              return (
                <li
                  key={p}
                  class={
                    p === shown.page
                      ? "wheel-tab is-page"
                      : shown.tab === p
                        ? "wheel-tab is-aimed"
                        : "wheel-tab"
                  }
                  aria-current={p === shown.page ? "true" : undefined}
                  data-page={p}
                  style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }}
                >
                  <kbd>{PAGES.indexOf(p) + 1}</kbd> {PAGE_LABEL[p]}
                </li>
              );
            })}
          </ul>
          <p class="wheel-plate" aria-live="polite">
            {sendable ? (
              <>
                {aimed && <strong class="wheel-name">{aimed.name}</strong>}
                <ReceiverLine method={method} crew={crew} me={me} />
              </>
            ) : (
              <>
                <strong class="wheel-name">You can't send {NOUN[method]}</strong>
                <span class="receiver-line">
                  {senders.map((c, i) => (
                    <span key={c.seat}>
                      {i > 0 && " and "}
                      <RoleShape role={c.role} size={14} /> {c.nickname}
                    </span>
                  ))}
                  {senders.length > 0 && " can."}
                </span>
              </>
            )}
          </p>
          <ul class="wheel-slots" aria-label={PAGE_LABEL[shown.page]}>
            {slots.map((slot, i) => {
              const { x, y } = slotXY(shown.page, mode, i);
              const left = wait(slot.method);
              const cls = [
                "wheel-slot",
                `page-${shown.page}`,
                hasCentre(shown.page) && i === CENTRE_INDEX ? "is-centre" : "",
                sendable ? "" : "cant",
                shown.aim === i ? "is-aimed" : "",
              ].join(" ");
              return (
                <li
                  key={slot.id}
                  class={cls}
                  aria-current={shown.aim === i ? "true" : undefined}
                  style={{
                    width: `${hasCentre(shown.page) && i === CENTRE_INDEX ? box.centre : box.w}px`,
                    height: `${hasCentre(shown.page) && i === CENTRE_INDEX ? box.centre : box.h}px`,
                    transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                  }}
                >
                  {slot.face ? (
                    <img
                      src={faceUrl(FACES.find((f) => f.id === slot.face)?.file ?? "")}
                      alt={slot.name}
                      width="44"
                      height="44"
                      draggable={false}
                    />
                  ) : (
                    <span class="wheel-label">{slot.label}</span>
                  )}
                  {sendable && left > 0 && (
                    <span
                      class="wheel-cd"
                      role="timer"
                      aria-label={`${slot.name} ready in ${left} seconds`}
                    >
                      {left}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {shown.finger && (
            <span
              class="wheel-finger"
              aria-hidden="true"
              style={{
                transform: `translate(${Math.max(-outlineHalfW, Math.min(outlineHalfW, shown.finger.x))}px, ${Math.max(-outlineHalfH, Math.min(outlineHalfH, shown.finger.y))}px)`,
              }}
            />
          )}
        </section>
      )}
    </div>
  );
}

// The page the room mockup writes. It draws answers the game's own perception gave
// (src/game/rooms/mockup.ts) and holds no rules: if it shows something, the game said it.
export const PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Room mockup</title>
<style>
  :root {
    --bg: #0b1220; --panel: #121a2d; --ink: #e8eef9; --muted: #8fa0c0; --line: #2a3756;
    --floor: #f3e6cf; --wall: #5a6384; --door: #d99a2b; --glass: #8fd3e6; --vent: #b08fd6; --dark: #1b2236;
    --blind: #f2a93b; --deaf: #4aa8ff; --mute: #a07bf0; --hazard: #ff5c6c; --good: #4fd28a;
  }
  @media (prefers-color-scheme: light) {
    :root { --bg: #f4f1ea; --panel: #fff; --ink: #1b2236; --muted: #5d6783; --line: #cfc8b8; --floor: #efe0c2; --wall: #3b4468; --dark: #2a3150; --door: #c47f10; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.45 system-ui, sans-serif; }
  main { max-width: 1200px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .sub { color: var(--muted); margin: 0 0 14px; }
  .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
  .bar button { background: var(--panel); color: var(--ink); border: 2px solid var(--line); border-radius: 8px; padding: 8px 14px; font: inherit; cursor: pointer; min-height: 44px; }
  .bar button[aria-pressed="true"] { border-color: var(--c); box-shadow: inset 0 0 0 1px var(--c); font-weight: 600; }
  .bar .hint { color: var(--muted); margin-left: auto; }
  .wrap { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; }
  @media (max-width: 900px) { .wrap { grid-template-columns: 1fr; } }
  .map { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 10px; overflow-x: auto; }
  svg { display: block; max-width: none; }
  .side { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px; }
  .side h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 14px 0 6px; }
  .side h2:first-child { margin-top: 0; }
  ul { margin: 0; padding-left: 18px; }
  li { margin: 2px 0; }
  .none { color: var(--muted); }
  .tag { display: inline-block; border: 1px solid var(--line); border-radius: 4px; padding: 0 6px; margin-left: 4px; font-size: 12px; color: var(--muted); }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 10px; color: var(--muted); font-size: 12px; }
  .legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; vertical-align: -2px; margin-right: 4px; border: 1px solid var(--line); }
  .beats { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 6px; }
  .beat { border: 1px solid var(--line); border-radius: 6px; padding: 3px 8px; font-size: 12px; background: var(--panel); }
</style>
</head>
<body>
<main>
  <h1 id="title"></h1>
  <p class="sub" id="sub"></p>
  <div class="bar" role="group" aria-label="Whose view">
    <button type="button" data-role="blind" style="--c: var(--blind)">Can't see</button>
    <button type="button" data-role="deaf" style="--c: var(--deaf)">Can't hear</button>
    <button type="button" data-role="mute" style="--c: var(--mute)">Can't speak</button>
    <span class="hint">Click a tile to stand there. Arrow keys move.</span>
  </div>
  <div class="wrap">
    <div class="map"><svg id="map" role="img" aria-label="The room"></svg></div>
    <aside class="side" aria-live="polite">
      <h2>Standing at</h2><div id="at"></div>
      <h2>Sees</h2><div id="sees"></div>
      <h2>Hears</h2><div id="hears"></div>
      <h2>Cannot perceive from here</h2><div id="hidden"></div>
    </aside>
  </div>
  <div class="legend">
    <span><i style="background:var(--floor)"></i>floor</span><span><i style="background:var(--wall)"></i>wall</span><span><i style="background:var(--door)"></i>door</span>
    <span><i style="background:var(--glass)"></i>glass: sight passes, sound doesn't</span>
    <span><i style="background:var(--vent)"></i>vent: sound passes, sight doesn't</span>
    <span><i style="background:var(--dark)"></i>dark zone</span>
    <span><i style="background:var(--good); opacity:.5"></i>in this role's sight</span>
  </div>
  <div class="beats" id="beats"></div>
</main>
<script>
const M = /*DATA*/null;
let T = 28; // fits the room to the map's width, never smaller than 16 px a tile
const NS = "http://www.w3.org/2000/svg";
const ROLE_NAME = { blind: "Can't see", deaf: "Can't hear", mute: "Can't speak" };
const ROLE_VAR = { blind: "--blind", deaf: "--deaf", mute: "--mute" };
const GLYPH = { plate: "▭", door: "▮", crate: "▣", exit: "E", spawn: "", guard: "G", camera: "C", laser: "L", hide: "h", checkpoint: "⚑", loot: "$", sign: "S", clue: "♪" };
let role = "deaf";
let at = null;

const cells = (r) => M.roles[r].cells;
const key = (x, y) => x + "," + y;
const el = (name, attrs, parent) => { const e = document.createElementNS(NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const inDark = (x, y) => M.dark.some((z) => x >= z[0] && x <= z[2] && y >= z[1] && y <= z[3]);

// "y:x0-x1,x2-x3" rows, as the game's view sends them, back into a set of "x,y"
function decode(rows) {
  const out = new Set();
  for (const row of rows) {
    const [y, spans] = row.split(":");
    for (const s of spans.split(",")) { if (!s) continue; const [a, b] = s.split("-").map(Number); for (let x = a; x <= (b ?? a); x++) out.add(key(x, Number(y))); }
  }
  return out;
}

function render() {
  const svg = document.getElementById("map");
  const room = document.querySelector(".map").clientWidth - 22;
  T = Math.max(16, Math.min(32, Math.floor(room / M.width)));
  svg.replaceChildren();
  svg.setAttribute("width", M.width * T); svg.setAttribute("height", M.height * T);
  const here = at && cells(role)[key(at.x, at.y)];
  const seen = here ? decode(here.seen) : new Set();
  const sighted = role !== "blind";
  for (let y = 0; y < M.height; y++) for (let x = 0; x < M.width; x++) {
    const ch = M.grid[y][x];
    let fill = css("--floor");
    if (ch === "#") fill = css("--wall"); else if (ch === "=") fill = css("--glass"); else if (ch === "%") fill = css("--vent");
    else if (ch === "D") fill = css("--door");
    const g = el("g", { "data-x": x, "data-y": y }, svg);
    el("rect", { x: x * T, y: y * T, width: T, height: T, fill, stroke: css("--line"), "stroke-width": 0.5 }, g);
    if (inDark(x, y) && ch !== "#") el("rect", { x: x * T, y: y * T, width: T, height: T, fill: css("--dark"), opacity: 0.78 }, g);
    if (here && sighted && seen.has(key(x, y))) el("rect", { x: x * T, y: y * T, width: T, height: T, fill: css("--good"), opacity: 0.28 }, g);
    if (ch === "." && cells(role)[key(x, y)]) { g.style.cursor = "pointer"; g.addEventListener("click", () => { at = { x, y }; render(); }); }
  }
  for (const o of M.objects) for (const t of o.tiles) {
    const glyph = GLYPH[o.kind] ?? "";
    if (!glyph && o.kind !== "spawn") continue;
    const colour = o.kind === "guard" || o.kind === "camera" || o.kind === "laser" ? css("--hazard") : css("--ink");
    const label = o.kind === "spawn" ? o.id.slice(1) : glyph;
    const t1 = el("text", { x: t.x * T + T / 2, y: t.y * T + T / 2 + 5, "text-anchor": "middle", fill: o.kind === "spawn" ? css("--muted") : colour, "font-size": 15, "font-weight": 700 }, svg);
    t1.textContent = label;
    if (o.kind === "plate" || o.kind === "sign") { const s = el("text", { x: t.x * T + T - 3, y: t.y * T + 10, "text-anchor": "end", fill: css("--muted"), "font-size": 9 }, svg); s.textContent = o.id; }
  }
  if (at) {
    const c = css(ROLE_VAR[role]);
    el("circle", { cx: at.x * T + T / 2, cy: at.y * T + T / 2, r: T * 0.36, fill: c, stroke: css("--ink"), "stroke-width": 2 }, svg);
  }
  panel(here, seen);
}

function panel(here, seen) {
  const $ = (id) => document.getElementById(id);
  const list = (items) => items.length ? "<ul>" + items.map((i) => "<li>" + i + "</li>").join("") + "</ul>" : "<span class=none>nothing</span>";
  if (!here) { $("at").innerHTML = "<span class=none>Click a floor tile.</span>"; $("sees").innerHTML = $("hears").innerHTML = $("hidden").innerHTML = ""; return; }
  const beat = M.beats.find((b) => at.x >= b.x[0] && at.x <= b.x[1]);
  $("at").innerHTML = ROLE_NAME[role] + " at (" + at.x + ", " + at.y + ")" + (inDark(at.x, at.y) ? '<span class=tag>in the dark</span>' : "") + (beat ? "<br><span class=none>beat: " + beat.name + (beat.lead ? ", led by " + ROLE_NAME[beat.lead] : "") + "</span>" : "");
  const byId = Object.fromEntries(M.objects.map((o) => [o.id, o]));
  const sees = role === "blind" ? [] : [...new Set(here.entities)].map((id) => { const o = byId[id]; return o ? o.kind + " " + id + (o.note ? " <span class=none>(" + o.note + ")</span>" : "") : id; });
  $("sees").innerHTML = role === "blind" ? "<span class=none>nothing: Can't see has no map</span>" : list(sees);
  const say = (s) => s.kind + (s.dir ? " from the " + compass(s.dir) : "") + " <span class=none>(loudness " + s.gain.toFixed(2) + ")</span>";
  $("hears").innerHTML = role === "deaf" ? "<span class=none>nothing: Can't hear gets no sound</span>" : list(here.sounds.map(say));
  const hidden = M.objects.filter((o) => ["laser", "guard", "camera", "plate", "clue", "sign"].includes(o.kind)).filter((o) => {
    const seenIt = role !== "blind" && here.entities.includes(o.id);
    const heard = role !== "deaf" && here.sounds.some((s) => s.kind === o.kind || (o.kind === "plate" && s.kind === "plate") || (o.kind === "clue" && s.kind === "clue"));
    return !seenIt && !heard;
  });
  $("hidden").innerHTML = list(hidden.map((o) => o.kind + " " + o.id));
}

function compass(d) { const a = Math.atan2(d.y, d.x) * 180 / Math.PI; const names = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"]; return names[Math.round(((a % 360) + 360) % 360 / 45) % 8]; }

document.getElementById("title").textContent = M.name + " (" + M.id + ")";
document.getElementById("sub").textContent = M.width + " × " + M.height + " tiles. Everything shown is what the game's own perception reports for that role and tile; hazards repeat every " + (M.cycleTicks / 20) + " s.";
document.getElementById("beats").innerHTML = M.beats.map((b) => '<span class="beat">' + b.name + " · x " + b.x[0] + "–" + b.x[1] + (b.lead ? " · lead: " + ROLE_NAME[b.lead] : "") + (b.cue ? " · cue: " + b.cue : "") + "</span>").join("");
for (const b of document.querySelectorAll("[data-role]")) {
  b.addEventListener("click", () => { role = b.dataset.role; for (const o of document.querySelectorAll("[data-role]")) o.setAttribute("aria-pressed", String(o === b)); render(); });
  b.setAttribute("aria-pressed", String(b.dataset.role === role));
}
document.addEventListener("keydown", (e) => {
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (!d || !at) return;
  const n = { x: at.x + d[0], y: at.y + d[1] };
  if (cells(role)[key(n.x, n.y)]) { at = n; render(); e.preventDefault(); }
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
addEventListener("resize", render);
const s1 = M.objects.find((o) => o.id === "s2")?.tiles[0];
if (s1) at = { x: s1.x, y: s1.y };
render();
</script>
</body>
</html>`;

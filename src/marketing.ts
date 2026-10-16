/**
 * Builds the Maker Console listing pages (1920 x 960) as HTML, using the plugin's real key renderer, its real touch
 * strip layouts and its real property inspector pages, placed on Stream Deck devices drawn to their actual key
 * layouts. scripts/make-marketing.mjs bundles this, runs it, and screenshots each page.
 *   node marketing.js <outDir> <logoPng>
 * Text stays minimal (Elgato product guidelines, "Gallery"): the description field carries the detail.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { ChargeState, OperatingState } from "./puffco/constants";
import { isHeating, type DeviceState, type Profile } from "./puffco/device";
import {
  batteryKey,
  boostKey,
  cycleProgress,
  FG,
  fit,
  fmtTemp,
  fmtTime,
  glyphs,
  GOLD,
  GREEN,
  heatKey,
  MUTED,
  powerKey,
  profileKey,
  PURPLE,
  sessionStatsKey,
  stateColor,
  stateLabel,
  statusKey,
  toggleKey,
} from "./render/svg";

const outDir = process.argv[2];
const logoPath = process.argv[3];
const logo = readFileSync(logoPath).toString("base64");
const pluginDir = join(dirname(logoPath), "..", "..");
const layout = (name: string) => JSON.parse(readFileSync(join(pluginDir, "layouts", `${name}.json`), "utf8")) as Layout;

const profiles: Profile[] = [
  { index: 0, name: "High Flavor", tempC: 254, timeS: 40, color: "#2f6bff" },
  { index: 1, name: "Balanced", tempC: 266, timeS: 40, color: "#3ad47e" },
  { index: 2, name: "Strong Vapor", tempC: 277, timeS: 40, color: "#ff4f5e" },
  { index: 3, name: "Nightcap", tempC: 243, timeS: 60, color: "#b06cff" },
];

function st(p: Partial<DeviceState>): DeviceState {
  return {
    link: "ready",
    adapter: "poweredOn",
    error: "",
    id: "x",
    name: "Plasma Boi",
    model: "Peak Pro Indiglow",
    battery: 72,
    charge: ChargeState.DISCONNECTED,
    chamber: "3DXL",
    opState: OperatingState.IDLE,
    heaterTempC: 24,
    targetTempC: null,
    elapsedS: 0,
    totalS: 0,
    profileIndex: 2,
    profiles,
    lantern: false,
    stealth: false,
    dabsRemaining: 16,
    dabsTotal: 1203,
    dabsPerDay: 3.2,
    brightness: 200,
    lastSeen: null,
    seen: [],
    ...p,
  };
}
const idle = st({});
const preheat = st({ opState: OperatingState.HEAT_CYCLE_PREHEAT, heaterTempC: 190, targetTempC: 277 });
const active = st({ opState: OperatingState.HEAT_CYCLE_ACTIVE, heaterTempC: 276, targetTempC: 277, elapsedS: 14, totalS: 40 });
const fade = st({ opState: OperatingState.HEAT_CYCLE_FADE, heaterTempC: 214 });

const keys = {
  p1: profileKey(profiles[0], 1, false, idle, "f"),
  p2: profileKey(profiles[1], 2, false, idle, "f"),
  p3: profileKey(profiles[2], 3, true, idle, "f"),
  p3heating: profileKey(profiles[2], 3, true, preheat, "f"),
  p3active: profileKey(profiles[2], 3, true, active, "f"),
  p4: profileKey(profiles[3], 4, false, idle, "f"),
  start: heatKey(idle, "f", true),
  heating: heatKey(preheat, "f"),
  ready: heatKey(active, "f"),
  cooling: heatKey(fade, "f"),
  boost: boostKey(active),
  boostIdle: boostKey(idle),
  battery: batteryKey(idle),
  stats: sessionStatsKey(idle),
  lantern: toggleKey(idle, "Lantern", true, glyphs.lantern, GOLD),
  stealth: toggleKey(idle, "Stealth", false, glyphs.ghost, PURPLE),
  sleep: powerKey(idle, "sleep", true),
  off: powerKey(idle, "off", true),
  status: statusKey(idle),
};

// ---------------------------------------------------------------------------------------------------------------
// Touch strip: the plugin's own layout JSON, filled with the same feedback src/actions/dials.ts sends.
// ---------------------------------------------------------------------------------------------------------------

type Item = { key: string; type: "text" | "bar"; rect: [number, number, number, number]; font?: { size: number; weight: number }; alignment?: string; color?: string; bar_bg_c?: string; bar_fill_c?: string; range?: { min: number; max: number } };
type Layout = { items: Item[] };
type Fb = Record<string, { value: string | number; color?: string | null; bar_fill_c?: string | null } | number>;

/** One 200 x 100 dial segment, drawn the way Stream Deck draws a layout: black panel, text centred in its rect. */
function segment(l: Layout, fb: Fb): string {
  return `<div class="seg">${l.items
    .map((it) => {
      const [x, y, w, h] = it.rect;
      const v = fb[it.key];
      const o = typeof v === "number" ? { value: v } : (v ?? { value: "" });
      if (it.type === "bar") {
        const r = it.range ?? { min: 0, max: 100 };
        const pct = (100 * (Number(o.value) - r.min)) / (r.max - r.min);
        // A full-width bar overlaps its neighbours by a pixel so segments meet without an anti-aliased seam (the strip is one panel).
        const edge = w === 200 ? 1 : 0;
        return `<div style="position:absolute;left:${x}px;top:${y}px;width:${w + edge}px;height:${h}px;background:${it.bar_bg_c}">${pct > 0 ? `<div style="position:absolute;left:-${edge}px;top:0;width:calc(${Math.min(100, pct)}% + ${edge}px);height:100%;background:${o.bar_fill_c ?? it.bar_fill_c}"></div>` : ""}</div>`;
      }
      const align = it.alignment === "left" ? "flex-start" : it.alignment === "right" ? "flex-end" : "center";
      return `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:${align};font-size:${it.font?.size}px;font-weight:${it.font?.weight};color:${o.color ?? it.color};white-space:nowrap;overflow:hidden">${o.value}</div>`;
    })
    .join("")}</div>`;
}

const sessionIcon = `data:image/svg+xml;base64,${readFileSync(join(pluginDir, "imgs", "actions", "session", "icon.svg")).toString("base64")}`;
const STRIP = layout("strip");
const SESSION = layout("session");
const BATTERY = layout("battery");

/** SessionStrip.render, for one segment. */
function stripFb(d: DeviceState, seg: number): Fb {
  const p = d.profiles[d.profileIndex ?? 0];
  const heating = isHeating(d.opState);
  const fill = heating ? cycleProgress(d) / 100 : 1;
  const local = Math.max(0, Math.min(1, fill * 4 - seg));
  const remaining = Math.max(0, d.totalS - d.elapsedS);
  let top = "", topRight = "", bottom = "";
  if (seg === 0) { top = fit(p.name, 18); bottom = `${fmtTemp(p.tempC, "f")}  ·  ${fmtTime(p.timeS)}`; }
  if (seg === 1) bottom = heating ? fmtTemp(d.heaterTempC, "f") : "press to start";
  if (seg === 2) bottom = heating ? stateLabel(d.opState) : `${d.battery}% battery`;
  if (seg === 3) {
    topRight = d.opState === OperatingState.HEAT_CYCLE_ACTIVE ? `${fmtTime(remaining)} left` : d.opState === OperatingState.HEAT_CYCLE_PREHEAT ? `→ ${fmtTemp(d.targetTempC, "f")}` : "";
    bottom = heating ? "tap: boost" : "turn: temp";
  }
  return {
    top: { value: top, color: MUTED },
    topRight: { value: topRight, color: heating ? stateColor(d.opState) : MUTED },
    bar: { value: Math.round(local * 1000), bar_fill_c: heating ? stateColor(d.opState) : p.color },
    bottom: { value: bottom, color: seg === 1 && heating ? FG : MUTED },
  };
}
const stripSegs = (d: DeviceState) => [0, 1, 2, 3].map((i) => segment(STRIP, stripFb(d, i)));

/** SessionDial.render. */
function sessionFb(d: DeviceState): Fb {
  const p = d.profiles[d.profileIndex ?? 0];
  const heating = isHeating(d.opState);
  const sub = heating
    ? d.opState === OperatingState.HEAT_CYCLE_ACTIVE
      ? `${stateLabel(d.opState)}  ·  ${fmtTime(Math.max(0, d.totalS - d.elapsedS))} left`
      : `Heating to ${fmtTemp(d.targetTempC, "f")}`
    : `${fmtTime(p.timeS)}  ·  press to start`;
  return {
    title: { value: `${fit(p.name, 14)}  ·  P${(d.profileIndex ?? 0) + 1}`, color: p.color },
    temp: { value: heating ? fmtTemp(d.heaterTempC, "f") : fmtTemp(p.tempC, "f"), color: heating ? FG : p.color },
    sub: { value: sub, color: heating ? stateColor(d.opState) : MUTED },
    bar: { value: heating ? Math.round(cycleProgress(d)) : 0, bar_fill_c: heating ? stateColor(d.opState) : p.color },
  };
}
/** BrightnessDial.render (it uses the battery layout's item keys). */
const brightnessFb = (d: DeviceState): Fb => ({
  title: { value: "LED BRIGHTNESS", color: MUTED },
  pct: { value: `${Math.round((100 * (d.brightness ?? 0)) / 255)}%`, color: FG },
  sub: { value: "turn to adjust  ·  press for stealth", color: MUTED },
  bar: { value: Math.round((100 * (d.brightness ?? 0)) / 255), bar_fill_c: GOLD },
});
/** BatteryDial.render. */
const batteryFb = (d: DeviceState): Fb => ({
  title: { value: fit(d.model, 24), color: MUTED },
  pct: { value: `${d.battery}%`, color: FG },
  sub: { value: `≈ ${d.dabsRemaining} sessions left  ·  ${d.dabsTotal} total`, color: MUTED },
  bar: { value: d.battery ?? 0, bar_fill_c: GREEN },
});

// ---------------------------------------------------------------------------------------------------------------
// Devices, drawn front-on to their real key layouts: Stream Deck + (4 x 2 keys, 800 x 100 touch strip, 4 dials)
// and Stream Deck MK.2 (5 x 3 keys). Units are the touch strip's own pixels, scaled as a whole.
// ---------------------------------------------------------------------------------------------------------------

const keyImg = (uri: string, size: number) =>
  uri ? `<img src="${uri}" width="${size}" height="${size}" style="display:block;border-radius:${size * 0.1}px">` : `<div class="blank" style="width:${size}px;height:${size}px;border-radius:${size * 0.1}px"></div>`;

/** Stream Deck +; `crop` shows only the touch strip and dials. */
function deckPlus(keyList: string[], segs: string[], scale: number, crop = false): string {
  const W = 940, H = crop ? 400 : 760;
  const keysHtml = crop
    ? ""
    : `<div style="position:absolute;left:100px;top:66px;display:grid;grid-template-columns:repeat(4,140px);column-gap:60px;row-gap:30px">${keyList.map((k) => `<div class="key">${keyImg(k, 140)}</div>`).join("")}</div>`;
  const stripTop = crop ? 60 : 430;
  return `<div style="width:${W * scale}px;height:${H * scale}px"><div class="body plus" style="width:${W}px;height:${H}px;transform:scale(${scale});${crop ? "border-radius:0 0 56px 56px;border-top:none;-webkit-mask-image:linear-gradient(180deg,transparent,#000 12%)" : ""}">
    ${keysHtml}
    <div class="strip" style="left:70px;top:${stripTop}px">${segs.join("")}</div>
    <div style="position:absolute;left:70px;top:${stripTop + 140}px;width:800px;display:flex">${[0, 1, 2, 3].map(() => `<div style="width:200px;display:flex;justify-content:center"><div class="knob"></div></div>`).join("")}</div>
  </div></div>`;
}

/** Stream Deck MK.2: 15 keys in 5 columns. */
function deckMk2(keyList: string[], scale: number): string {
  const W = 1040, H = 660;
  return `<div style="width:${W * scale}px;height:${H * scale}px"><div class="body" style="width:${W}px;height:${H}px;transform:scale(${scale})">
    <div style="position:absolute;left:70px;top:70px;display:grid;grid-template-columns:repeat(5,148px);gap:40px">${keyList.map((k) => `<div class="key">${keyImg(k, 148)}</div>`).join("")}</div>
  </div></div>`;
}

// ---------------------------------------------------------------------------------------------------------------
// Property inspector: the plugin's real PI page, with the status line filled in as it reads when connected.
// ---------------------------------------------------------------------------------------------------------------

function piPage(name: string): string {
  const css = pathToFileURL(join(pluginDir, "ui", "common.css")).href;
  const status = `<sdpi-item label="Peak Pro"><div class="sd-status ok"><span class="dot"></span><span>Connected: Plasma Boi (Peak Pro Indiglow) · 72%</span></div></sdpi-item>`;
  const html = readFileSync(join(pluginDir, "ui", `${name}.html`), "utf8")
    .replace(`href="common.css"`, `href="${css}"`)
    .replace(`<script src="common.js"></script>`, `<style>html,body{background:#2d2d2d;margin:0;overflow:hidden}</style>`)
    .replace(`<div id="status"></div>`, `<div id="status">${status}</div>`);
  const file = `pi-${name}.html`;
  writeFileSync(join(outDir, file), html);
  return file;
}

/** A Stream Deck app style settings panel around a PI page. */
const piPanel = (file: string, title: string, icon: string, w: number, h: number, scale: number) =>
  `<div class="panel" style="width:${w * scale}px">
    <div class="panel-head" style="font-size:${15 * scale}px;padding:${10 * scale}px ${14 * scale}px;gap:${10 * scale}px"><img src="${icon}" width="${28 * scale}" height="${28 * scale}" style="border-radius:${4 * scale}px">${title}</div>
    <div style="width:${w * scale}px;height:${h * scale}px;overflow:hidden"><iframe src="${file}" style="width:${w}px;height:${h}px;border:0;transform:scale(${scale});transform-origin:0 0"></iframe></div>
  </div>`;

// ---------------------------------------------------------------------------------------------------------------

const page = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1920px;height:960px;overflow:hidden;background:#0f0f10;font-family:"Segoe UI",Helvetica,Arial,sans-serif;color:#fff}
  .bg{position:absolute;inset:0;background:radial-gradient(1100px 700px at 72% 50%,#3a1c0a 0%,#0f0f10 62%)}
  .wrap{position:relative;width:1920px;height:960px}
  h1{font-size:104px;font-weight:800;margin:0;letter-spacing:-2px;line-height:1}
  h2{font-size:68px;font-weight:800;margin:0 0 22px;letter-spacing:-1px;line-height:1.05}
  p{font-size:34px;color:#b3b3b3;margin:0;line-height:1.35}
  .body{position:relative;transform-origin:0 0;background:linear-gradient(180deg,#1b1c1f,#0d0d0f);border:2px solid #2a2b2f;border-radius:56px;box-shadow:0 40px 90px #000a,inset 0 2px 0 #ffffff14}
  .key{padding:0;border-radius:16px;background:#000;box-shadow:0 0 0 6px #050506,0 4px 0 6px #000}
  .blank{background:#060607}
  .strip{position:absolute;display:flex;overflow:hidden;width:800px;height:100px;background:#000;box-shadow:0 0 0 8px #050506}
  .seg{position:relative;width:200px;height:100px;flex:none;font-family:"Segoe UI",Arial,sans-serif}
  .knob{width:118px;height:118px;border-radius:50%;background:repeating-conic-gradient(#1d1e21 0 4deg,#26272b 4deg 8deg);box-shadow:0 0 0 6px #0a0a0b,0 10px 18px #000c;position:relative}
  .knob::after{content:"";position:absolute;inset:18px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#34353a,#141518 75%)}
  .panel{background:#2d2d2d;border-radius:14px;overflow:hidden;box-shadow:0 30px 70px #000a;border:1px solid #3a3a3a}
  .panel-head{display:flex;align-items:center;background:#232323;color:#ddd;font-weight:600;border-bottom:1px solid #3a3a3a}
  .note{font-size:24px;color:#77777c}
</style></head><body><div class="wrap"><div class="bg"></div>${body}</div></body></html>`;

const pages: Record<string, string> = {
  "thumbnail.html": page(`
    <div style="position:absolute;left:120px;top:250px;width:700px">
      <div style="display:flex;align-items:center;gap:40px;margin-bottom:44px"><img src="data:image/png;base64,${logo}" width="170" height="170" style="border-radius:38px"><h1>Simply<br>Peak</h1></div>
      <p>Your Puffco Peak Pro on Stream Deck.</p>
      <p class="note" style="margin-top:26px">Not affiliated with Puffco. 21+.</p>
    </div>
    <div style="position:absolute;left:826px;top:62px">${deckPlus([keys.p1, keys.p2, keys.p3heating, keys.p4, keys.heating, keys.boost, keys.battery, keys.lantern], stripSegs(preheat), 1.1)}</div>`),

  "gallery-1.html": page(`
    <div style="position:absolute;left:120px;top:330px;width:620px">
      <h2>Every key is live</h2>
      <p>Profiles, sessions, battery and lights, straight from the device.</p>
    </div>
    <div style="position:absolute;left:770px;top:150px">${deckMk2(
      [keys.p1, keys.p2, keys.p3, keys.p4, keys.start, keys.boostIdle, keys.battery, keys.stats, keys.lantern, keys.stealth, keys.status, keys.sleep, keys.off, "", ""],
      1,
    )}</div>`),

  "gallery-2.html": page(`
    <div style="position:absolute;left:0;top:150px;width:1920px;text-align:center">
      <h2>Hold to start. Watch it heat.</h2>
      <p>The key counts the session down and lights up green when it is ready.</p>
    </div>
    <div style="position:absolute;left:0;top:440px;width:1920px;display:flex;justify-content:center;align-items:center;gap:44px">
      ${[keys.start, keys.heating, keys.ready, keys.cooling].map((k) => `<div class="key">${keyImg(k, 260)}</div>`).join(`<div style="font-size:64px;color:#55555b">→</div>`)}
    </div>`),

  "gallery-3.html": page(`
    <div style="position:absolute;left:0;top:110px;width:1920px;text-align:center">
      <h2>One bar across the Stream Deck + strip</h2>
      <p>Fills while the chamber heats, drains through the session.</p>
    </div>
    <div style="position:absolute;left:255px;top:330px">${deckPlus([], stripSegs(active), 1.5, true)}</div>`),

  "gallery-4.html": page(`
    <div style="position:absolute;left:120px;top:110px;width:700px">
      <h2>Set it up your way</h2>
      <p>Choose what each key and dial does in the Stream Deck app.</p>
    </div>
    <div style="position:absolute;left:120px;top:340px">${piPanel(piPage("session"), "Session (Dial)", sessionIcon, 380, 300, 1.6)}</div>
    <div style="position:absolute;left:826px;top:62px">${deckPlus([keys.p1, keys.p2, keys.p3active, keys.p4, keys.ready, keys.boost, keys.battery, keys.stealth], [segment(SESSION, sessionFb(active)), segment(BATTERY, brightnessFb(active)), segment(BATTERY, batteryFb(active)), `<div class="seg"></div>`], 1.1)}</div>`),
};

for (const [name, html] of Object.entries(pages)) writeFileSync(join(outDir, name), html);
console.log(`wrote ${Object.keys(pages).length} pages to ${outDir}`);
process.exit(0);

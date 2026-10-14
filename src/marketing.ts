/**
 * Builds the Maker Console listing pages (1920 x 960) as HTML, using the plugin's real key renderer so the pictures
 * match what users see. scripts/make-marketing.mjs bundles this, runs it, and screenshots each page.
 *   node marketing.js <outDir> <logoPngBase64File>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ChargeState, OperatingState } from "./puffco/constants";
import type { DeviceState, Profile } from "./puffco/device";
import { batteryKey, boostKey, glyphs, GOLD, heatKey, powerKey, profileKey, PURPLE, sessionStatsKey, statusKey, toggleKey } from "./render/svg";

const outDir = process.argv[2];
const logo = readFileSync(process.argv[3]).toString("base64");

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

const img = (uri: string, size: number) => `<img src="${uri}" width="${size}" height="${size}" style="border-radius:${size * 0.12}px;display:block">`;
const keys = {
  p1: profileKey(profiles[0], 1, false, idle, "f"),
  p2: profileKey(profiles[1], 2, false, idle, "f"),
  p3: profileKey(profiles[2], 3, true, idle, "f"),
  p3heating: profileKey(profiles[2], 3, true, preheat, "f"),
  p4: profileKey(profiles[3], 4, false, idle, "f"),
  start: heatKey(idle, "f", true),
  heating: heatKey(preheat, "f"),
  ready: heatKey(active, "f"),
  boost: boostKey(active),
  battery: batteryKey(idle),
  charging: batteryKey(st({ battery: 40, charge: ChargeState.BULK })),
  stats: sessionStatsKey(idle),
  lantern: toggleKey(idle, "Lantern", true, glyphs.lantern, GOLD),
  stealth: toggleKey(idle, "Stealth", false, glyphs.ghost, PURPLE),
  power: powerKey(idle, "sleep", true),
  status: statusKey(idle),
  searching: statusKey(st({ link: "scanning" })),
};

// Touch-strip mock: four 200x100 segments drawn as HTML, scaled up 2x.
const seg = (inner: string) => `<div class="seg">${inner}</div>`;
const txt = (x: number, y: number, w: number, size: number, color: string, s: string, weight = 700, align = "left") =>
  `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;font-size:${size}px;color:${color};font-weight:${weight};text-align:${align};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s}</div>`;
const bar = (pct: number, color: string, y = 36, h = 28, x = 0, w = 200) =>
  `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:#22262c"><div style="width:${pct}%;height:100%;background:${color}"></div></div>`;

/** The full-width session strip at a given overall fill (0..1). */
function strip(fill: number, color: string, labels: [string, string, string, string], topRight = "", scale = 1) {
  const local = (i: number) => Math.max(0, Math.min(1, fill * 4 - i)) * 100;
  return `<div class="strip" style="transform:scale(${scale})">${[0, 1, 2, 3]
    .map((i) =>
      seg(
        (i === 0 ? txt(10, 6, 104, 13, "#9aa0a6", "Strong Vapor") : "") +
          (i === 3 ? txt(116, 6, 74, 13, color, topRight, 800, "right") : "") +
          bar(local(i), color) +
          txt(10, 72, 180, 14, i === 1 ? "#fff" : "#9aa0a6", labels[i], 700, "center"),
      ),
    )
    .join("")}</div>`;
}
const stripIdle = strip(1, "#ff4f5e", ["530°F · 0:40", "press to start", "72% battery", "turn: temp"], "", 1.1);
const stripHeating = strip(0.62, "#ff7a1a", ["530°F · 0:40", "374°F", "Heating", "hold: stop"], "→ 530°F", 1.1);
const stripThumb = strip(0.62, "#ff7a1a", ["530°F · 0:40", "374°F", "Heating", "hold: stop"], "→ 530°F", 0.9);
const stripReady = strip(0.65, "#3ad47e", ["530°F · 0:40", "529°F", "Ready", "tap: boost"], "0:26 left", 1.1);
const sessionDial = `<div class="seg one">${txt(8, 6, 184, 12, "#ff4f5e", "Strong Vapor  ·  P3") + txt(8, 26, 184, 28, "#fff", "529°F", 800, "center") + txt(8, 62, 184, 11, "#3ad47e", "Ready  ·  0:26 left", 600, "center") + bar(65, "#3ad47e", 84, 10, 8, 184)}</div>`;
const brightnessDial = `<div class="seg one">${txt(8, 6, 184, 12, "#9aa0a6", "LED BRIGHTNESS") + txt(8, 26, 184, 28, "#fff", "78%", 800, "center") + txt(8, 62, 184, 11, "#9aa0a6", "turn to adjust  ·  press for stealth", 600, "center") + bar(78, "#ffc53d", 84, 10, 8, 184)}</div>`;

const page = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1920px;height:960px;overflow:hidden;background:#0f0f0f;font-family:"Segoe UI",Helvetica,Arial,sans-serif;color:#fff}
  .bg{position:absolute;inset:0;background:radial-gradient(1200px 700px at 30% 40%,#3a1c0a 0%,#0f0f0f 60%)}
  .wrap{position:relative;width:1920px;height:960px}
  h1{font-size:96px;font-weight:800;margin:0;letter-spacing:-2px;line-height:1}
  h2{font-size:64px;font-weight:800;margin:0 0 18px;letter-spacing:-1px}
  p{font-size:34px;color:#b3b3b3;margin:0;line-height:1.35}
  .orange{color:#ff7a1a}
  .row{display:flex;gap:28px}
  .col{display:flex;flex-direction:column;gap:28px}
  .strip{display:flex;gap:0;width:800px;height:100px;transform-origin:top left;border-radius:6px;overflow:hidden}
  .seg{position:relative;width:200px;height:100px;background:#101114;flex:none;font-family:"Segoe UI",Arial,sans-serif}
  .seg.one{border-radius:6px;transform:scale(2);transform-origin:top left}
  .dial{width:120px;height:120px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#3a3a3a,#111 70%);border:4px solid #333;margin:0 auto}
  .feature{display:flex;gap:22px;align-items:flex-start}
  .feature .dot{width:18px;height:18px;border-radius:50%;background:#ff7a1a;margin-top:16px;flex:none}
  .feature b{font-size:36px;display:block;margin-bottom:6px}
  .feature span{font-size:28px;color:#b3b3b3;line-height:1.35}
  .caption{font-size:24px;color:#8a8a8a;margin-top:220px;display:flex;justify-content:space-between;width:800px}
</style></head><body><div class="wrap"><div class="bg"></div>${body}</div></body></html>`;

const deck = (list: string[], size = 150) =>
  `<div class="col">${[0, 1].map((r) => `<div class="row">${list.slice(r * 4, r * 4 + 4).map((k) => img(k, size)).join("")}</div>`).join("")}</div>`;

const pages: Record<string, string> = {
  "thumbnail.html": page(`
    <div style="position:absolute;left:120px;top:150px;width:880px">
      <div style="display:flex;align-items:center;gap:36px;margin-bottom:40px"><img src="data:image/png;base64,${logo}" width="160" height="160" style="border-radius:36px"><h1>Simply<br>Peak</h1></div>
      <p>Your Puffco Peak Pro on Stream Deck. Profiles with live temperature, hold-to-start sessions, and a session bar across the whole Stream Deck + strip.</p>
      <p style="font-size:24px;color:#6a6a6a;margin-top:28px">Not affiliated with Puffco. 21+.</p>
    </div>
    <div style="position:absolute;right:120px;top:120px">${deck([keys.p1, keys.p2, keys.p3heating, keys.p4, keys.heating, keys.boost, keys.battery, keys.lantern], 160)}</div>
    <div style="position:absolute;left:1080px;top:530px;width:720px;height:90px">${stripThumb}</div>`),

  "gallery-1.html": page(`
    <div style="position:absolute;left:120px;top:120px;width:760px">
      <h2>Every key is live</h2>
      <p>Profile keys show each profile's name, temperature, time and colour, with the active one outlined. Start reads the chamber temperature while it heats and counts the session down, then ticks the instant it is ready.</p>
    </div>
    <div style="position:absolute;right:120px;top:120px">${deck([keys.p1, keys.p2, keys.p3, keys.p4, keys.start, keys.heating, keys.ready, keys.boost], 170)}</div>
    <div style="position:absolute;left:120px;bottom:110px" class="row">${[keys.battery, keys.charging, keys.stats, keys.lantern, keys.stealth, keys.power].map((k) => img(k, 140)).join("")}</div>`),

  "gallery-2.html": page(`
    <div style="position:absolute;left:120px;top:120px;width:760px">
      <h2>Built for Stream Deck +</h2>
      <p>One action on all four dials draws a single bar across the strip: it fills while the chamber heats and drains through the session. Turn a dial for temperature, time or profile. Hold to start, press to stop, tap to boost.</p>
    </div>
    <div style="position:absolute;left:900px;top:150px;width:880px">
      <div style="height:210px">${stripIdle}</div>
      <div style="height:210px">${stripHeating}</div>
      <div style="height:170px">${stripReady}</div>
      <div class="row" style="justify-content:space-around;padding:0 60px"><div class="dial"></div><div class="dial"></div><div class="dial"></div><div class="dial"></div></div>
    </div>`),

  "gallery-3.html": page(`
    <div style="position:absolute;left:120px;top:110px;width:840px">
      <h2 style="font-size:60px">Power on, place a key,<br>it finds your Peak</h2>
      <div class="col" style="gap:26px;margin-top:24px">
        <div class="feature"><div class="dot"></div><div><b>Direct over Bluetooth</b><span>No phone, no cloud, no account. The plugin bonds with the Peak once and reconnects whenever it wakes.</span></div></div>
        <div class="feature"><div class="dot"></div><div><b>Safe by design</b><span>Start is hold-to-start so a brushed key never lights the chamber. Everything goes through the device's own limits.</span></div></div>
        <div class="feature"><div class="dot"></div><div><b>Lights and power</b><span>Lantern and stealth toggles, LED brightness on a dial, hold to sleep or power off.</span></div></div>
        <div class="feature"><div class="dot"></div><div><b>Free and open source</b><span>MIT licensed on GitHub. Peak Pro on firmware X or later, Windows.</span></div></div>
      </div>
    </div>
    <div style="position:absolute;right:120px;top:150px;width:800px" class="col">
      <div style="height:220px">${sessionDial}</div>
      <div style="height:220px">${brightnessDial}</div>
      <div class="row">${[keys.status, keys.searching, keys.power, keys.stats].map((k) => img(k, 150)).join("")}</div>
    </div>`),
};

for (const [name, html] of Object.entries(pages)) writeFileSync(join(outDir, name), html);
console.log(`wrote ${Object.keys(pages).length} pages to ${outDir}`);
process.exit(0);

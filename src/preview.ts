/** Renders every key state to an HTML page for a visual check without a device. Bundled by scripts/preview.mjs. */
import { writeFileSync } from "node:fs";
import { ChargeState, OperatingState } from "./puffco/constants";
import type { DeviceState, Profile } from "./puffco/device";
import { batteryKey, boostKey, glyphs, GOLD, heatKey, PURPLE, profileKey, statusKey, toggleKey } from "./render/svg";

const out = process.argv[2] ?? "preview.html";

const profiles: Profile[] = [
  { index: 0, name: "Low & Slow", tempC: 232, timeS: 90, color: "#3ad47e" },
  { index: 1, name: "Daily", tempC: 260, timeS: 75, color: "#4f8cff" },
  { index: 2, name: "Flavor Town", tempC: 246, timeS: 100, color: "#ff7a1a" },
  { index: 3, name: "Nuke", tempC: 310, timeS: 60, color: "#ff4f5e" },
];

function st(p: Partial<DeviceState>): DeviceState {
  return {
    link: "ready",
    adapter: "poweredOn",
    error: "",
    id: "x",
    name: "Mike's Peak",
    model: "Peak Pro Onyx",
    battery: 72,
    charge: ChargeState.DISCONNECTED,
    chamber: "3D",
    opState: OperatingState.IDLE,
    heaterTempC: 24,
    targetTempC: null,
    elapsedS: 0,
    totalS: 0,
    profileIndex: 1,
    profiles,
    lantern: false,
    stealth: false,
    dabsRemaining: 14,
    dabsTotal: 1203,
    dabsPerDay: 3.2,
    brightness: 200,
    lastSeen: null,
    seen: [],
    ...p,
  };
}

const idle = st({});
const preheat = st({ opState: OperatingState.HEAT_CYCLE_PREHEAT, heaterTempC: 150, targetTempC: 260 });
const active = st({ opState: OperatingState.HEAT_CYCLE_ACTIVE, heaterTempC: 259, targetTempC: 260, elapsedS: 30, totalS: 75 });
const fade = st({ opState: OperatingState.HEAT_CYCLE_FADE, heaterTempC: 200, elapsedS: 0, totalS: 0 });
const scanning = st({ link: "scanning" });
const btOff = st({ link: "adapter-off" });
const err = st({ link: "error", error: "connect failed: timed out" });

const keys: [string, string][] = [
  ["Profile 1", profileKey(profiles[0], 1, false, idle, "f")],
  ["Profile 2 (active)", profileKey(profiles[1], 2, true, idle, "f")],
  ["Profile 2 (heating)", profileKey(profiles[1], 2, true, preheat, "f")],
  ["Profile 3 °C", profileKey(profiles[2], 3, false, idle, "c")],
  ["Profile 4", profileKey(profiles[3], 4, false, idle, "f")],
  ["Profile (scanning)", profileKey(null, 1, false, scanning, "f")],
  ["Start (idle)", heatKey(idle, "f")],
  ["Heating", heatKey(preheat, "f")],
  ["Ready, 45s left", heatKey(active, "f")],
  ["Cooling", heatKey(fade, "f")],
  ["Boost (idle)", boostKey(idle)],
  ["Boost (active)", boostKey(active)],
  ["Battery 72%", batteryKey(idle)],
  ["Battery charging", batteryKey(st({ battery: 40, charge: ChargeState.BULK }))],
  ["Battery low", batteryKey(st({ battery: 9, dabsRemaining: 1 }))],
  ["Lantern on", toggleKey(idle, "Lantern", true, glyphs.lantern, GOLD)],
  ["Stealth off", toggleKey(idle, "Stealth", false, glyphs.ghost, PURPLE)],
  ["Status connected", statusKey(idle)],
  ["Status scanning", statusKey(scanning)],
  ["Status BT off", statusKey(btOff)],
  ["Status error", statusKey(err)],
];

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{background:#1b1e24;color:#ccc;font:12px Segoe UI,Arial,sans-serif;margin:0;padding:16px;width:1180px}
.grid{display:flex;flex-wrap:wrap;gap:14px}.k{width:144px;text-align:center}.k img{width:144px;height:144px;border-radius:14px;display:block;box-shadow:0 2px 10px #0008}.k span{display:block;margin-top:4px;font-size:11px}
</style></head><body><div class="grid">${keys.map(([n, src]) => `<div class="k"><img src="${src}"><span>${n}</span></div>`).join("")}</div></body></html>`;
writeFileSync(out, html);
console.log(`wrote ${out}`);
// The BLE binding (pulled in transitively) keeps the event loop alive; we are done.
process.exit(0);

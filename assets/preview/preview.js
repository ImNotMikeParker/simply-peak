import { writeFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import noble from '@stoprocent/noble';
import 'node:crypto';

/**
 * Puffco Peak Pro "Lorax" protocol constants (firmware X and later). Sources: puff.social commons, Fr0st3h's
 * PuffcoBLE and reverse-engineering write-up. UUIDs are in noble's form: lower case, no dashes.
 */
const strip = (uuid) => uuid.toLowerCase().replace(/-/g, "");
strip("e276967f-ea8a-478a-a92e-d78f5dd15dd5");
/** Pre-Lorax ("pikachu") service, advertised by older firmware. Not supported, but used to recognise a Peak. */
strip("06caf9c0-74d3-454f-9be9-e30cd999c17a");
strip("0000180a-0000-1000-8000-00805f9b34fb");
({
    VERSION: strip("05434bca-cc7f-4ef6-bbb3-b1c520b9800c"),
    COMMAND: strip("60133d5c-5727-4f2c-9697-d842c5292a3c"),
    REPLY: strip("8dc5ec05-8f7d-45ad-99db-3fbde65dbd9c"),
    EVENT: strip("43312cd1-7d34-46ce-a7d3-0a98fd9b4cb8"),
});
Buffer.from("ZMZFYlbyb1scoSc3pd1x+w==", "base64");
var OperatingState;
(function (OperatingState) {
    OperatingState[OperatingState["INIT_MEMORY"] = 0] = "INIT_MEMORY";
    OperatingState[OperatingState["INIT_VERSION_DISP"] = 1] = "INIT_VERSION_DISP";
    OperatingState[OperatingState["INIT_BATTERY_DISP"] = 2] = "INIT_BATTERY_DISP";
    OperatingState[OperatingState["MASTER_OFF"] = 3] = "MASTER_OFF";
    OperatingState[OperatingState["SLEEP"] = 4] = "SLEEP";
    OperatingState[OperatingState["IDLE"] = 5] = "IDLE";
    OperatingState[OperatingState["TEMP_SELECT"] = 6] = "TEMP_SELECT";
    OperatingState[OperatingState["HEAT_CYCLE_PREHEAT"] = 7] = "HEAT_CYCLE_PREHEAT";
    OperatingState[OperatingState["HEAT_CYCLE_ACTIVE"] = 8] = "HEAT_CYCLE_ACTIVE";
    OperatingState[OperatingState["HEAT_CYCLE_FADE"] = 9] = "HEAT_CYCLE_FADE";
    OperatingState[OperatingState["VERSION_DISP"] = 10] = "VERSION_DISP";
    OperatingState[OperatingState["BATTERY_DISP"] = 11] = "BATTERY_DISP";
    OperatingState[OperatingState["FACTORY_TEST"] = 12] = "FACTORY_TEST";
    OperatingState[OperatingState["BLE_BONDING"] = 13] = "BLE_BONDING";
})(OperatingState || (OperatingState = {}));
var ChargeState;
(function (ChargeState) {
    ChargeState[ChargeState["BULK"] = 0] = "BULK";
    ChargeState[ChargeState["TOPUP"] = 1] = "TOPUP";
    ChargeState[ChargeState["FULL"] = 2] = "FULL";
    ChargeState[ChargeState["TEMP_STOP"] = 3] = "TEMP_STOP";
    ChargeState[ChargeState["DISCONNECTED"] = 4] = "DISCONNECTED";
})(ChargeState || (ChargeState = {}));

/**
 * Thin wrapper over the BLE binding so the rest of the plugin never touches noble directly. Swapping in a different
 * backend (a custom Node-API addon, for instance) means rewriting only this file.
 */
class Ble extends EventEmitter {
    get state() {
        return noble.state;
    }
    scanning = false;
    constructor() {
        super();
        noble.on("stateChange", (s) => this.emit("state", s));
        noble.on("discover", (p) => {
            this.emit("advert", {
                id: p.id,
                address: p.address,
                name: p.advertisement?.localName ?? "",
                rssi: p.rssi,
                serviceUuids: p.advertisement?.serviceUuids ?? [],
            });
        });
        noble.on("scanStop", () => {
            this.scanning = false;
        });
    }
    async startScan() {
        if (this.scanning)
            return;
        this.scanning = true;
        try {
            await noble.startScanningAsync([], true);
        }
        catch (e) {
            this.scanning = false;
            throw e;
        }
    }
    async stopScan() {
        if (!this.scanning)
            return;
        this.scanning = false;
        await noble.stopScanningAsync().catch(() => { });
    }
    peripheral(id) {
        return noble._peripherals?.[id];
    }
    /** Connect and fetch the characteristics we care about, keyed by their dash-less lower-case UUID. */
    async connect(p, serviceUuids, charUuids) {
        await p.connectAsync();
        const { characteristics } = await p.discoverSomeServicesAndCharacteristicsAsync(serviceUuids, charUuids);
        const map = new Map();
        for (const c of characteristics)
            map.set(c.uuid.toLowerCase(), c);
        return map;
    }
}
new Ble();

/**
 * The Peak Pro as the plugin sees it: scans, connects, authenticates, polls, and exposes commands. Emits "update"
 * whenever anything an action might draw has changed. Reconnects on its own.
 */
const HEATING = new Set([OperatingState.TEMP_SELECT, OperatingState.HEAT_CYCLE_PREHEAT, OperatingState.HEAT_CYCLE_ACTIVE, OperatingState.HEAT_CYCLE_FADE]);
function isHeating(s) {
    return s !== null && HEATING.has(s);
}
const cToF = (c) => c * 1.8 + 32;

/** Key images as SVG data URIs; Stream Deck rasterises them. */
const BG = "#101114";
const FG = "#ffffff";
const MUTED = "#9aa0a6";
const DIM = "#5f6368";
const ORANGE = "#ff7a1a";
const RED = "#ff4f5e";
const GREEN = "#3ad47e";
const BLUE = "#4f8cff";
const GOLD = "#ffc53d";
const PURPLE = "#b06cff";
const FONT = `font-family="Segoe UI, Helvetica Neue, Arial, sans-serif"`;
function escapeXml(s) {
    return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);
}
const toDataUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
function fit(s, max) {
    s = s.trim();
    return s.length > max ? s.slice(0, Math.max(1, max - 1)).trimEnd() + "…" : s;
}
function fmtTemp(c, unit) {
    if (c === null || c === undefined || !Number.isFinite(c))
        return "—";
    return unit === "c" ? `${Math.round(c)}°C` : `${Math.round(cToF(c))}°F`;
}
function fmtTime(s) {
    s = Math.max(0, Math.round(s));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
const wrap = (body, opacity = 1) => `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">${opacity < 1 ? `<g opacity="${opacity}">${body}</g>` : body}</svg>`;
const rect = (fill = BG) => `<rect width="144" height="144" rx="14" fill="${fill}"/>`;
const text = (x, y, size, fill, s, weight = 400, anchor = "middle") => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}" ${FONT}>${escapeXml(s)}</text>`;
const ring = (color, w = 5) => `<rect x="${w / 2 + 1}" y="${w / 2 + 1}" width="${142 - w}" height="${142 - w}" rx="12" fill="none" stroke="${color}" stroke-width="${w}"/>`;
const stripe = (color) => `<path d="M14 0h116a14 14 0 0 1 14 14v4H0v-4A14 14 0 0 1 14 0z" fill="${color}"/>`;
const bar = (pct, color, y = 128) => `<rect x="8" y="${y}" width="128" height="8" rx="4" fill="#ffffff" opacity="0.12"/><rect x="8" y="${y}" width="${Math.round((128 * Math.max(0, Math.min(100, pct))) / 100)}" height="8" rx="4" fill="${color}"/>`;
const glyph = (d, color, scale = 0.4, x = 43, y = 14, stroke = true) => `<g transform="translate(${x} ${y}) scale(${scale})"><path d="${d}" fill="${stroke ? "none" : color}" ${stroke ? `stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"` : ""}/></g>`;
const glyphs = {
    flame: "M72 18c6 20 30 34 30 62a30 30 0 0 1-60 0c0-14 8-22 14-30 2 10 6 14 12 16-2-16 0-32 4-48z",
    bolt: "M80 22L40 80h30l-8 42 44-60H74z",
    lantern: "M72 22v10M48 42h48l-6 60H54zM40 112h64M58 42l14-10 14 10",
    ghost: "M72 24c-24 0-40 18-40 42v52l12-10 14 10 14-10 14 10 14-10 12 10V66c0-24-16-42-40-42zM58 62a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm28 0a6 6 0 1 1 0 12 6 6 0 0 1 0-12z",
    bluetooth: "M44 46l56 52-28 24V22l28 24-56 52"};
function stateLabel(s) {
    switch (s) {
        case OperatingState.HEAT_CYCLE_PREHEAT:
            return "Heating";
        case OperatingState.HEAT_CYCLE_ACTIVE:
            return "Ready";
        case OperatingState.HEAT_CYCLE_FADE:
            return "Cooling";
        case OperatingState.TEMP_SELECT:
            return "Temp select";
        case OperatingState.IDLE:
            return "Idle";
        case OperatingState.SLEEP:
            return "Sleep";
        case OperatingState.MASTER_OFF:
            return "Off";
        case OperatingState.BLE_BONDING:
            return "Pairing";
        case null:
            return "—";
        default:
            return OperatingState[s] ?? String(s);
    }
}
function stateColor(s) {
    switch (s) {
        case OperatingState.HEAT_CYCLE_PREHEAT:
            return ORANGE;
        case OperatingState.HEAT_CYCLE_ACTIVE:
            return GREEN;
        case OperatingState.HEAT_CYCLE_FADE:
            return BLUE;
        default:
            return MUTED;
    }
}
/** Progress of the current cycle, 0..100: temperature climb while preheating, time remaining while active. */
function cycleProgress(d) {
    if (d.opState === OperatingState.HEAT_CYCLE_PREHEAT) {
        if (d.heaterTempC === null || d.targetTempC === null || d.targetTempC <= 20)
            return 0;
        return (100 * Math.max(0, d.heaterTempC - 20)) / Math.max(1, d.targetTempC - 20);
    }
    if (d.opState === OperatingState.HEAT_CYCLE_ACTIVE && d.totalS > 0)
        return (100 * Math.max(0, d.totalS - d.elapsedS)) / d.totalS;
    if (d.opState === OperatingState.HEAT_CYCLE_FADE)
        return 0;
    return 0;
}
const offline = (title, sub, color = DIM, icon = glyphs.bluetooth) => toDataUri(wrap(rect() + glyph(icon, color) + text(72, 98, 16, color, title, 700) + text(72, 122, 12, MUTED, sub), 0.9));
function linkSub(d) {
    switch (d.link) {
        case "adapter-off":
            return ["Bluetooth off", "turn it on in Windows"];
        case "scanning":
            return ["Searching", "power on your Peak"];
        case "connecting":
            return ["Connecting", d.name || ""];
        case "authenticating":
            return ["Pairing", "accept if prompted"];
        case "error":
            return ["Error", fit(d.error, 18)];
        default:
            return ["Connected", d.model];
    }
}
function profileKey(p, slot, active, d, unit) {
    if (!d.link || d.link !== "ready") {
        const [t, s] = linkSub(d);
        return offline(t, s);
    }
    if (!p)
        return offline(`Profile ${slot}`, "not loaded");
    const color = p.color ?? PURPLE;
    const heatingThis = active && isHeating(d.opState);
    const parts = [rect(), stripe(color)];
    if (active)
        parts.push(ring(heatingThis ? stateColor(d.opState) : color, 5));
    parts.push(text(72, 36, 12, MUTED, `PROFILE ${slot}`, 700));
    const name = fit(p.name, 12);
    parts.push(text(72, 66, name.length > 9 ? 17 : 21, FG, name, 700));
    parts.push(text(72, 98, 26, color, fmtTemp(p.tempC, unit), 800));
    parts.push(text(72, 124, 13, MUTED, Number.isFinite(p.timeS) ? fmtTime(p.timeS) : "—"));
    return toDataUri(wrap(parts.join("")));
}
function heatKey(d, unit) {
    if (d.link !== "ready") {
        const [t, s] = linkSub(d);
        return offline(t, s);
    }
    const p = d.profileIndex === null ? null : d.profiles[d.profileIndex];
    const color = stateColor(d.opState);
    const parts = [rect()];
    if (isHeating(d.opState)) {
        parts.push(ring(color, 6));
        parts.push(text(72, 34, 13, color, stateLabel(d.opState).toUpperCase(), 800));
        parts.push(text(72, 82, 38, FG, fmtTemp(d.heaterTempC, unit), 800));
        const sub = d.opState === OperatingState.HEAT_CYCLE_ACTIVE
            ? `${fmtTime(Math.max(0, d.totalS - d.elapsedS))} left`
            : d.opState === OperatingState.HEAT_CYCLE_PREHEAT
                ? `→ ${fmtTemp(d.targetTempC ?? p?.tempC ?? null, unit)}`
                : "tap to stop";
        parts.push(text(72, 108, 13, MUTED, sub));
        parts.push(bar(cycleProgress(d), color));
    }
    else {
        parts.push(glyph(glyphs.flame, ORANGE, 0.42, 42, 12, false));
        parts.push(text(72, 98, 18, FG, "Start", 700));
        parts.push(text(72, 122, 12, MUTED, p ? `${fit(p.name, 10)} · ${fmtTemp(p.tempC, unit)}` : stateLabel(d.opState)));
    }
    return toDataUri(wrap(parts.join("")));
}
function boostKey(d) {
    if (d.link !== "ready") {
        const [t, s] = linkSub(d);
        return offline(t, s);
    }
    const live = d.opState === OperatingState.HEAT_CYCLE_ACTIVE;
    const color = live ? GOLD : DIM;
    return toDataUri(wrap(rect() + glyph(glyphs.bolt, color, 0.42, 42, 14, false) + text(72, 102, 18, live ? FG : MUTED, "Boost", 700) + text(72, 124, 12, MUTED, live ? "tap for extra time" : "during a session")));
}
function batteryKey(d) {
    if (d.link !== "ready") {
        const [t, s] = linkSub(d);
        return offline(t, s);
    }
    const pct = d.battery ?? 0;
    const charging = d.charge === ChargeState.BULK || d.charge === ChargeState.TOPUP;
    const color = charging ? BLUE : pct <= 15 ? RED : pct <= 35 ? GOLD : GREEN;
    const parts = [rect()];
    // Battery outline with fill.
    parts.push(`<rect x="24" y="34" width="84" height="40" rx="8" fill="none" stroke="${MUTED}" stroke-width="5"/><rect x="110" y="46" width="10" height="16" rx="3" fill="${MUTED}"/>`);
    parts.push(`<rect x="30" y="40" width="${Math.round((72 * pct) / 100)}" height="28" rx="4" fill="${color}"/>`);
    if (charging)
        parts.push(glyph(glyphs.bolt, "#000", 0.22, 56, 38, false));
    parts.push(text(72, 106, 28, FG, `${pct}%`, 800));
    const sub = charging ? "charging" : d.charge === ChargeState.FULL ? "full" : d.dabsRemaining ? `≈ ${d.dabsRemaining} dabs left` : "";
    parts.push(text(72, 128, 12, MUTED, sub));
    return toDataUri(wrap(parts.join("")));
}
function toggleKey(d, label, on, icon, onColor) {
    if (d.link !== "ready") {
        const [t, s] = linkSub(d);
        return offline(t, s);
    }
    const color = on ? onColor : DIM;
    return toDataUri(wrap(rect() + (on ? ring(onColor, 4) : "") + glyph(icon, color, 0.42, 42, 14, false) + text(72, 104, 18, on ? FG : MUTED, label, 700) + text(72, 124, 12, MUTED, on === null ? "" : on ? "on" : "off")));
}
function statusKey(d) {
    const [t, s] = linkSub(d);
    if (d.link !== "ready")
        return offline(t, s, d.link === "error" ? RED : d.link === "adapter-off" ? RED : BLUE);
    const parts = [rect(), glyph(glyphs.bluetooth, GREEN, 0.34, 48, 10, false)];
    parts.push(text(72, 84, 15, FG, fit(d.name || d.model, 16), 700));
    parts.push(text(72, 104, 12, MUTED, fit(d.model, 20)));
    parts.push(text(72, 124, 12, MUTED, d.chamber ? `${d.chamber} chamber` : stateLabel(d.opState)));
    return toDataUri(wrap(parts.join("")));
}

/** Renders every key state to an HTML page for a visual check without a device. Bundled by scripts/preview.mjs. */
const out = process.argv[2] ?? "preview.html";
const profiles = [
    { index: 0, name: "Low & Slow", tempC: 232, timeS: 90, color: "#3ad47e" },
    { index: 1, name: "Daily", tempC: 260, timeS: 75, color: "#4f8cff" },
    { index: 2, name: "Flavor Town", tempC: 246, timeS: 100, color: "#ff7a1a" },
    { index: 3, name: "Nuke", tempC: 310, timeS: 60, color: "#ff4f5e" },
];
function st(p) {
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
const keys = [
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

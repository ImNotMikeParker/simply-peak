/** Key images as SVG data URIs; Stream Deck rasterises them. */
import { ChargeState, OperatingState } from "../puffco/constants";
import { cToF, isHeating, type DeviceState, type Profile } from "../puffco/device";

export const BG = "#101114";
export const FG = "#ffffff";
export const MUTED = "#9aa0a6";
export const DIM = "#5f6368";
export const ORANGE = "#ff7a1a";
export const RED = "#ff4f5e";
export const GREEN = "#3ad47e";
export const BLUE = "#4f8cff";
export const GOLD = "#ffc53d";
export const PURPLE = "#b06cff";

const FONT = `font-family="Segoe UI, Helvetica Neue, Arial, sans-serif"`;
export type Unit = "f" | "c";

export function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}
export const toDataUri = (svg: string): string => `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
export function fit(s: string, max: number): string {
  s = s.trim();
  return s.length > max ? s.slice(0, Math.max(1, max - 1)).trimEnd() + "…" : s;
}
export function fmtTemp(c: number | null | undefined, unit: Unit): string {
  if (c === null || c === undefined || !Number.isFinite(c)) return "—";
  return unit === "c" ? `${Math.round(c)}°C` : `${Math.round(cToF(c))}°F`;
}
export function fmtTime(s: number): string {
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const wrap = (body: string, opacity = 1) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">${opacity < 1 ? `<g opacity="${opacity}">${body}</g>` : body}</svg>`;
const rect = (fill = BG) => `<rect width="144" height="144" rx="14" fill="${fill}"/>`;
const text = (x: number, y: number, size: number, fill: string, s: string, weight = 400, anchor = "middle") =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}" ${FONT}>${escapeXml(s)}</text>`;
const ring = (color: string, w = 5) => `<rect x="${w / 2 + 1}" y="${w / 2 + 1}" width="${142 - w}" height="${142 - w}" rx="12" fill="none" stroke="${color}" stroke-width="${w}"/>`;
const stripe = (color: string) => `<path d="M14 0h116a14 14 0 0 1 14 14v4H0v-4A14 14 0 0 1 14 0z" fill="${color}"/>`;
const bar = (pct: number, color: string, y = 128) =>
  `<rect x="8" y="${y}" width="128" height="8" rx="4" fill="#ffffff" opacity="0.12"/><rect x="8" y="${y}" width="${Math.round((128 * Math.max(0, Math.min(100, pct))) / 100)}" height="8" rx="4" fill="${color}"/>`;
const glyph = (d: string, color: string, scale = 0.4, x = 43, y = 14, stroke = true) =>
  `<g transform="translate(${x} ${y}) scale(${scale})"><path d="${d}" fill="${stroke ? "none" : color}" ${stroke ? `stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"` : ""}/></g>`;

export const glyphs = {
  flame: "M72 18c6 20 30 34 30 62a30 30 0 0 1-60 0c0-14 8-22 14-30 2 10 6 14 12 16-2-16 0-32 4-48z",
  bolt: "M80 22L40 80h30l-8 42 44-60H74z",
  battery: "M26 48h80v48H26zM106 62h12v20h-12",
  lantern: "M72 22v10M48 42h48l-6 60H54zM40 112h64M58 42l14-10 14 10",
  ghost: "M72 24c-24 0-40 18-40 42v52l12-10 14 10 14-10 14 10 14-10 12 10V66c0-24-16-42-40-42zM58 62a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm28 0a6 6 0 1 1 0 12 6 6 0 0 1 0-12z",
  link: "M58 86l-10 10a18 18 0 0 1-26-26l18-18a18 18 0 0 1 26 0M86 58l10-10a18 18 0 0 1 26 26l-18 18a18 18 0 0 1-26 0",
  bluetooth: "M44 46l56 52-28 24V22l28 24-56 52",
  dial: "M72 24a48 48 0 1 0 0 96 48 48 0 1 0 0-96zM72 40v32l20 12",
  thermo: "M62 28a10 10 0 0 1 20 0v50a20 20 0 1 1-20 0z",
  power: "M72 26v46M46 44a38 38 0 1 0 52 0",
  stats: "M28 112V74M52 112V46M76 112V60M100 112V32M124 112V80",
  sun: "M72 50a22 22 0 1 0 0 44 22 22 0 1 0 0-44zM72 22v12M72 110v12M22 72h12M110 72h12M37 37l8 8M99 99l8 8M37 107l8-8M99 45l8-8",
} as const;

export function iconSvg(d: string, color = FG, stroke = true): string {
  return toDataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">${glyph(d, color, 0.8, 14, 14, stroke)}</svg>`);
}

export function stateLabel(s: OperatingState | null): string {
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

export function stateColor(s: OperatingState | null): string {
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
export function cycleProgress(d: DeviceState): number {
  if (d.opState === OperatingState.HEAT_CYCLE_PREHEAT) {
    if (d.heaterTempC === null || d.targetTempC === null || d.targetTempC <= 20) return 0;
    return (100 * Math.max(0, d.heaterTempC - 20)) / Math.max(1, d.targetTempC - 20);
  }
  if (d.opState === OperatingState.HEAT_CYCLE_ACTIVE && d.totalS > 0) return (100 * Math.max(0, d.totalS - d.elapsedS)) / d.totalS;
  if (d.opState === OperatingState.HEAT_CYCLE_FADE) return 0;
  return 0;
}

const offline = (title: string, sub: string, color = DIM, icon = glyphs.bluetooth) =>
  toDataUri(wrap(rect() + glyph(icon, color) + text(72, 98, 16, color, title, 700) + text(72, 122, 12, MUTED, sub), 0.9));

export function linkSub(d: DeviceState): [string, string] {
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

export function profileKey(p: Profile | null, slot: number, active: boolean, d: DeviceState, unit: Unit): string {
  if (!d.link || d.link !== "ready") {
    const [t, s] = linkSub(d);
    return offline(t, s);
  }
  if (!p) return offline(`Profile ${slot}`, "not loaded");
  const color = p.color ?? PURPLE;
  const heatingThis = active && isHeating(d.opState);
  const parts = [rect(), stripe(color)];
  if (active) parts.push(ring(heatingThis ? stateColor(d.opState) : color, 5));
  parts.push(text(72, 36, 12, MUTED, `PROFILE ${slot}`, 700));
  const name = fit(p.name, 12);
  parts.push(text(72, 66, name.length > 9 ? 17 : 21, FG, name, 700));
  parts.push(text(72, 98, 26, color, fmtTemp(p.tempC, unit), 800));
  parts.push(text(72, 124, 13, MUTED, Number.isFinite(p.timeS) ? fmtTime(p.timeS) : "—"));
  return toDataUri(wrap(parts.join("")));
}

export function heatKey(d: DeviceState, unit: Unit, hold = true): string {
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
    const sub =
      d.opState === OperatingState.HEAT_CYCLE_ACTIVE
        ? `${fmtTime(Math.max(0, d.totalS - d.elapsedS))} left`
        : d.opState === OperatingState.HEAT_CYCLE_PREHEAT
          ? `→ ${fmtTemp(d.targetTempC ?? p?.tempC ?? null, unit)}`
          : "tap to stop";
    parts.push(text(72, 108, 13, MUTED, sub));
    parts.push(bar(cycleProgress(d), color));
  } else {
    parts.push(glyph(glyphs.flame, ORANGE, 0.42, 42, 12, false));
    parts.push(text(72, 98, 18, FG, hold ? "Hold to start" : "Start", 700));
    parts.push(text(72, 122, 12, MUTED, p ? `${fit(p.name, 10)} · ${fmtTemp(p.tempC, unit)}` : stateLabel(d.opState)));
  }
  return toDataUri(wrap(parts.join("")));
}

export function boostKey(d: DeviceState): string {
  if (d.link !== "ready") {
    const [t, s] = linkSub(d);
    return offline(t, s);
  }
  const live = d.opState === OperatingState.HEAT_CYCLE_ACTIVE;
  const color = live ? GOLD : DIM;
  return toDataUri(wrap(rect() + glyph(glyphs.bolt, color, 0.42, 42, 14, false) + text(72, 102, 18, live ? FG : MUTED, "Boost", 700) + text(72, 124, 12, MUTED, live ? "tap for extra time" : "during a session")));
}

export function batteryKey(d: DeviceState): string {
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
  if (charging) parts.push(glyph(glyphs.bolt, "#000", 0.22, 56, 38, false));
  parts.push(text(72, 106, 28, FG, `${pct}%`, 800));
  const sub = charging ? "charging" : d.charge === ChargeState.FULL ? "full" : d.dabsRemaining ? `≈ ${d.dabsRemaining} dabs left` : "";
  parts.push(text(72, 128, 12, MUTED, sub));
  return toDataUri(wrap(parts.join("")));
}

export function toggleKey(d: DeviceState, label: string, on: boolean | null, icon: string, onColor: string): string {
  if (d.link !== "ready") {
    const [t, s] = linkSub(d);
    return offline(t, s);
  }
  const color = on ? onColor : DIM;
  return toDataUri(wrap(rect() + (on ? ring(onColor, 4) : "") + glyph(icon, color, 0.42, 42, 14, false) + text(72, 104, 18, on ? FG : MUTED, label, 700) + text(72, 124, 12, MUTED, on === null ? "" : on ? "on" : "off")));
}

export function statusKey(d: DeviceState): string {
  const [t, s] = linkSub(d);
  if (d.link !== "ready") return offline(t, s, d.link === "error" ? RED : d.link === "adapter-off" ? RED : BLUE);
  const parts = [rect(), glyph(glyphs.bluetooth, GREEN, 0.34, 48, 10, false)];
  parts.push(text(72, 84, 15, FG, fit(d.name || d.model, 16), 700));
  parts.push(text(72, 104, 12, MUTED, fit(d.model, 20)));
  parts.push(text(72, 124, 12, MUTED, d.chamber ? `${d.chamber} chamber` : stateLabel(d.opState)));
  return toDataUri(wrap(parts.join("")));
}

export function sessionStatsKey(d: DeviceState): string {
  if (d.link !== "ready") {
    const [t, s] = linkSub(d);
    return offline(t, s);
  }
  const parts = [rect()];
  parts.push(text(72, 30, 12, MUTED, "SESSIONS", 700));
  parts.push(text(72, 78, 40, FG, d.dabsTotal === null ? "—" : String(d.dabsTotal), 800));
  parts.push(text(72, 104, 13, MUTED, d.dabsPerDay === null ? "" : `≈ ${d.dabsPerDay} per day`));
  parts.push(text(72, 126, 13, d.dabsRemaining !== null && d.dabsRemaining <= 3 ? RED : MUTED, d.dabsRemaining === null ? "" : `≈ ${d.dabsRemaining} left on battery`));
  return toDataUri(wrap(parts.join("")));
}

export function powerKey(d: DeviceState, mode: "sleep" | "off", hold: boolean): string {
  if (d.link !== "ready") {
    const [t, s] = linkSub(d);
    return offline(t, s);
  }
  const label = mode === "off" ? "Power off" : "Sleep";
  return toDataUri(wrap(rect() + glyph(glyphs.power, mode === "off" ? RED : BLUE, 0.42, 42, 14) + text(72, 104, 18, FG, label, 700) + text(72, 124, 12, MUTED, hold ? "hold" : "press")));
}

export function placeholderKey(label: string, icon: string, color = ORANGE): string {
  return wrap(rect() + glyph(icon, color, 0.42, 42, 14, false) + text(72, 110, 16, FG, label, 700));
}

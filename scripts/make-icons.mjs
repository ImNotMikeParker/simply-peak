/**
 * Generates every static image: action icons and default keys (SVG), category icon (SVG), marketplace icon (PNG).
 * No image libraries: PNG is written by hand (RGBA + zlib).
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const plugin = join(root, "com.mjp.simplypuffco.sdPlugin");
const BG = "#101114";
const ORANGE = "#ff7a1a";

// Filled glyphs on a 144 grid (kept in sync by hand with src/render/svg.ts).
const glyphs = {
  profile: { d: "M30 30h84v84H30z M44 44h56v12H44z M44 66h40v12H44z M44 88h28v12H44z", stroke: false },
  heat: { d: "M72 18c6 20 30 34 30 62a30 30 0 0 1-60 0c0-14 8-22 14-30 2 10 6 14 12 16-2-16 0-32 4-48z", stroke: false },
  boost: { d: "M80 22L40 80h30l-8 42 44-60H74z", stroke: false },
  battery: { d: "M26 48h80v48H26zM106 62h12v20h-12", stroke: true },
  lantern: { d: "M72 22v10M48 42h48l-6 60H54zM40 112h64M58 42l14-10 14 10", stroke: true },
  stealth: { d: "M72 24c-24 0-40 18-40 42v52l12-10 14 10 14-10 14 10 14-10 12 10V66c0-24-16-42-40-42zM58 62a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm28 0a6 6 0 1 1 0 12 6 6 0 0 1 0-12z", stroke: false },
  status: { d: "M44 46l56 52-28 24V22l28 24-56 52", stroke: true },
  session: { d: "M72 24a48 48 0 1 0 0 96 48 48 0 1 0 0-96zM72 40v32l20 12", stroke: true },
  stats: { d: "M28 112V74M52 112V46M76 112V60M100 112V32M124 112V80", stroke: true },
  power: { d: "M72 26v46M46 44a38 38 0 1 0 52 0", stroke: true },
  brightness: { d: "M72 50a22 22 0 1 0 0 44 22 22 0 1 0 0-44zM72 22v12M72 110v12M22 72h12M110 72h12M37 37l8 8M99 99l8 8M37 107l8-8M99 45l8-8", stroke: true },
  strip: { d: "M16 56h112v32H16zM16 56v32M48 56v32M80 56v32M112 56v32", stroke: true },
};
const labels = {
  profile: ["Profile", "tap to select"],
  heat: ["Start", "/ stop"],
  boost: ["Boost", ""],
  battery: ["Battery", ""],
  lantern: ["Lantern", ""],
  stealth: ["Stealth", ""],
  status: ["Peak Pro", "connection"],
  session: ["Session", "dial"],
  strip: ["Session", "strip"],
  stats: ["Sessions", ""],
  power: ["Sleep", "hold"],
  brightness: ["Brightness", "dial"],
};

const path = (g, color, w = 10) =>
  g.stroke
    ? `<path d="${g.d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="${g.d}" fill="${color}"/>`;

for (const [name, g] of Object.entries(glyphs)) {
  const dir = join(plugin, "imgs/actions", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "icon.svg"), `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 144 144"><g transform="translate(14 14) scale(0.8)">${path(g, "#ffffff", 12)}</g></svg>`);
  const [l1, l2] = labels[name];
  writeFileSync(
    join(dir, "key.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="14" fill="${BG}"/><g transform="translate(42 14) scale(0.42)">${path(g, ORANGE)}</g><text x="72" y="104" text-anchor="middle" font-size="18" font-weight="700" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif">${l1}</text><text x="72" y="126" text-anchor="middle" font-size="13" fill="#9aa0a6" font-family="Segoe UI, Arial, sans-serif">${l2}</text></svg>`,
  );
}

mkdirSync(join(plugin, "imgs/plugin"), { recursive: true });
// Category icon: the same flame as the wordmark and the Start key, monochrome. The marketplace PNGs come from
// scripts/make-logo.mjs (a rendered wordmark), not from here.
writeFileSync(
  join(plugin, "imgs/plugin/category-icon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 144 144">${path(glyphs.heat, "#ffffff")}</svg>`,
);

// ---- Minimal PNG writer ------------------------------------------------------
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/** Logo: dark rounded square, orange flame built from two circles and a triangle, 4x supersampled. */
function logo(size) {
  const SS = 4;
  const rgba = Buffer.alloc(size * size * 4);
  const r = size / 2;
  const inside = (x, y) => {
    const rad = size * 0.22;
    const dx = Math.max(Math.abs(x - r) - (r - rad), 0);
    const dy = Math.max(Math.abs(y - r) - (r - rad), 0);
    if (Math.hypot(dx, dy) > rad) return null;
    // "Simply Peak": a mountain peak whose summit is a little flame. Mountain: two overlapping triangles,
    // the taller one orange with a gold snow cap, the shorter one a darker grey ridge behind it.
    const ORANGE = [255, 122, 26], GOLD = [255, 197, 61], RIDGE = [52, 56, 64];
    const inTri = (ax, ay, bx, by, cx2, cy2) => {
      const s1 = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      const s2 = (cx2 - bx) * (y - by) - (cy2 - by) * (x - bx);
      const s3 = (ax - cx2) * (y - cy2) - (ay - cy2) * (x - cx2);
      return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
    };
    const base = size * 0.8;
    // Flame on the summit: a teardrop (circle + tip) above the main peak.
    // Flame sits on the summit: its round base overlaps the peak's tip, with a gold core.
    const px = size * 0.46, py = size * 0.38;
    const fx = px, fy = py - size * 0.045, fr = size * 0.075;
    if (inTri(fx - fr * 0.95, fy - fr * 0.2, fx + fr * 0.95, fy - fr * 0.2, fx + fr * 0.4, fy - fr * 2.7)) return ORANGE;
    if (Math.hypot(x - fx, y - (fy + fr * 0.3)) < fr * 0.45) return GOLD;
    if (Math.hypot(x - fx, y - fy) < fr) return ORANGE;
    // Main peak (orange) with a jagged gold snow cap.
    if (inTri(px, py, size * 0.16, base, size * 0.76, base)) {
      const zig = Math.abs((((x - px) / (size * 0.05)) % 2 + 2) % 2 - 1) * size * 0.04;
      if (y < py + size * 0.07 + zig) return GOLD;
      return ORANGE;
    }
    // Background ridge (darker) to the right.
    if (inTri(size * 0.68, size * 0.5, size * 0.46, base, size * 0.9, base)) return RIDGE;
    return [16, 17, 20];
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rr = 0, gg = 0, bb = 0, n = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const px = inside(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
          if (px) {
            rr += px[0];
            gg += px[1];
            bb += px[2];
            n++;
          }
        }
      const i = (y * size + x) * 4;
      if (n) {
        rgba[i] = rr / n;
        rgba[i + 1] = gg / n;
        rgba[i + 2] = bb / n;
      }
      rgba[i + 3] = (255 * n) / (SS * SS);
    }
  }
  return png(size, size, rgba);
}
void logo; // kept for reference; the shipped marketplace icon is the wordmark from make-logo.mjs
console.log("icons written");

/**
 * Marketplace logo: flat wordmark "PEAK" in a monospaced face with the plugin's flame glyph as the last character,
 * on the same dark rounded square as Simply Spotify. Rendered by headless Chrome (system fonts), so the PNGs are
 * self-contained. Writes imgs/plugin/marketplace.png (288) and marketplace@2x.png (576).
 *   node scripts/make-logo.mjs [--open]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "com.mjp.simplypuffco.sdPlugin", "imgs", "plugin");
const tmp = join(root, "assets", "logo");
mkdirSync(tmp, { recursive: true });
mkdirSync(out, { recursive: true });

// Same flame as the Start key and the category icon (144-unit grid).
const FLAME = "M72 18c6 20 30 34 30 62a30 30 0 0 1-60 0c0-14 8-22 14-30 2 10 6 14 12 16-2-16 0-32 4-48z";

function svg(size) {
  const s = size / 576; // design at 576
  const letters = ["P", "E", "A", "K"];
  const fontSize = 150 * s;
  const advance = 90 * s; // Cascadia Mono advance at this size, hand-tuned
  const x0 = 54 * s;
  const baseline = 346 * s;
  const text = letters
    .map((ch, i) => `<text x="${x0 + i * advance}" y="${baseline}" font-family="Cascadia Mono, Consolas, monospace" font-weight="700" font-size="${fontSize}" fill="#ffffff">${ch}</text>`)
    .join("");
  // Flame as the fifth "character": scaled so its height matches the cap height, sitting on the baseline.
  const fs = (fontSize * 0.98) / 108; // glyph spans y 18..126 (108 units)
  const fx = x0 + 4 * advance - 36 * fs; // glyph starts at x≈42 on its grid; tuck it in next to the K
  const fy = baseline - 126 * fs + 8 * s; // the rounded base sits a hair below the baseline, like a descender
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="#121212"/>
  ${text}
  <g transform="translate(${fx} ${fy}) scale(${fs})"><path d="${FLAME}" fill="#ff7a1a"/></g>
</svg>`;
}

const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find(existsSync);
if (!chrome) throw new Error("Chrome not found; it renders the wordmark with system fonts");

for (const [size, name] of [
  [576, "marketplace@2x.png"],
  [288, "marketplace.png"],
]) {
  const html = join(tmp, `logo-${size}.html`);
  writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent;width:${size}px;height:${size}px;overflow:hidden}</style></head><body>${svg(size)}</body></html>`);
  const png = join(out, name);
  execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--default-background-color=00000000", `--window-size=${size},${size}`, `--screenshot=${png}`, `file:///${html.replace(/\\/g, "/")}`], { stdio: "ignore" });
  console.log(`wrote ${png}`);
}
writeFileSync(join(tmp, "logo.svg"), svg(576));

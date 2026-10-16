/**
 * Renders the Maker Console listing images (1920 x 960 PNG) with headless Chrome:
 *   assets/marketplace/thumbnail.png, gallery-1.png .. gallery-4.png, app-icon-288.png
 * The pages are built by src/marketing.ts from the plugin's real key renderer.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "assets", "marketplace");
const tmp = join(root, "assets", "marketplace", "build");
mkdirSync(tmp, { recursive: true });

const logo = join(root, "com.mjp.simplypuffco.sdPlugin", "imgs", "plugin", "marketplace.png");
copyFileSync(logo, join(out, "app-icon-288.png"));

const bundle = join(tmp, "marketing.js");
execFileSync("npx", ["rollup", "src/marketing.ts", "--file", bundle, "--format", "es", "--external", "@stoprocent/noble", "-p", "typescript", "-p", "node-resolve", "-p", "commonjs", "--silent"], { cwd: root, stdio: "inherit", shell: true });
writeFileSync(join(tmp, "package.json"), `{ "type": "module" }`);
execFileSync(process.execPath, [bundle, tmp, logo], { stdio: "inherit" });

const browser = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
if (!browser) throw new Error("No Chrome/Edge found for headless rendering");

for (const name of ["thumbnail", "gallery-1", "gallery-2", "gallery-3", "gallery-4"]) {
  const html = join(tmp, `${name}.html`);
  const png = join(out, `${name}.png`);
  const r = spawnSync(browser, ["--headless=new", `--user-data-dir=${join(tmp, "profile-" + name)}`, "--no-first-run", "--disable-gpu", "--hide-scrollbars", "--virtual-time-budget=8000", "--force-device-scale-factor=1", "--window-size=1920,960", `--screenshot=${png}`, pathToFileURL(html).href], { stdio: "ignore", timeout: 60000 });
  if (r.status !== 0 || !existsSync(png)) throw new Error(`Rendering ${name} failed (status ${r.status})`);
  console.log("wrote", png);
}

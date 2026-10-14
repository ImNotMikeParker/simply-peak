/**
 * Bundles src/preview.ts, runs it to produce preview.html, and screenshots it with headless Chrome if available.
 *   node scripts/preview.mjs [outDir]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(process.argv[2] ?? join(root, "assets", "preview"));
mkdirSync(outDir, { recursive: true });
const bundle = join(outDir, "preview.js");
const html = join(outDir, "preview.html");
const png = join(outDir, "preview.png");

execFileSync(
  "npx",
  ["rollup", "src/preview.ts", "--file", bundle, "--format", "es", "--external", "@stoprocent/noble", "-p", "typescript", "-p", "node-resolve", "-p", "commonjs", "--silent"],
  { cwd: root, stdio: "inherit", shell: true },
);
execFileSync(process.execPath, [bundle, html], { stdio: "inherit" });

const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find(existsSync);
if (!chrome) {
  console.log(`open ${html} in a browser (Chrome not found for a screenshot)`);
} else {
  execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1220,760", `--screenshot=${png}`, `file:///${html.replace(/\\/g, "/")}`], { stdio: "ignore" });
  console.log(`screenshot: ${png}`);
}

/** Bundles src/probe.ts and runs it with the native BLE binding from the plugin folder. Args pass through. */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "com.mjp.simplypuffco.sdPlugin", "bin");
mkdirSync(outDir, { recursive: true });
const bundle = join(outDir, "probe.js");
execFileSync(
  "npx",
  ["rollup", "src/probe.ts", "--file", bundle, "--format", "es", "--external", "@stoprocent/noble", "-p", "typescript", "-p", "node-resolve", "-p", "commonjs", "--silent"],
  { cwd: root, stdio: "inherit", shell: true },
);
execFileSync(process.execPath, [bundle, ...process.argv.slice(2)], { stdio: "inherit", cwd: join(root, "com.mjp.simplypuffco.sdPlugin") });

/**
 * Standalone test harness, no Stream Deck needed. Bundled by scripts/probe.mjs.
 *
 *   npm run probe                 scan, connect, read everything, poll for 30 s
 *   npm run probe -- --start      also start a heat cycle (and stop it after 15 s)
 *   npm run probe -- --name XYZ   match devices whose name contains XYZ
 *   npm run probe -- --scan       only list every advertising device for 15 s
 */
import { ble } from "./ble";
import { OperatingState } from "./puffco/constants";
import { PeakPro, cToF } from "./puffco/device";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);

const log = {
  info: (m: string) => console.log(`[info] ${m}`),
  warn: (m: string) => console.log(`[warn] ${m}`),
  debug: (m: string) => console.log(`[dbg ] ${m}`),
};

console.log(`adapter: ${ble.state}`);
ble.on("state", (s) => console.log(`adapter: ${s}`));

const t0 = Date.now();
const ts = () => `${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s`;
const whenOn = (fn: () => void) => (ble.state === "poweredOn" ? fn() : ble.once("state", (s) => s === "poweredOn" && fn()));

if (flag("--scan")) {
  const seen = new Map<string, { name: string; count: number; last: number; rssi: number }>();
  ble.on("advert", (a) => {
    const e = seen.get(a.id);
    if (e) {
      e.count++;
      e.last = Date.now();
      e.rssi = a.rssi;
      return;
    }
    seen.set(a.id, { name: a.name, count: 1, last: Date.now(), rssi: a.rssi });
    console.log(`${ts()}  ${a.id}  rssi ${a.rssi}  ${JSON.stringify(a.name)}  services [${a.serviceUuids.join(", ")}]`);
  });
  whenOn(async () => {
    console.log("scanning for 15 s…");
    await ble.startScan();
    setTimeout(async () => {
      await ble.stopScan();
      for (const [id, e] of seen) if (e.name) console.log(`  ${JSON.stringify(e.name)} (${id}): ${e.count} adverts, last at ${((e.last - t0) / 1000).toFixed(1)}s, rssi ${e.rssi}`);
      console.log(`${seen.size} devices`);
      process.exit(0);
    }, 15000);
  });
} else if (flag("--once")) {
  // Low-level diagnostic: one connection attempt with every step timed, no retries, no plugin logic.
  const want = (opt("--name") ?? "").toLowerCase();
  let picked = false;
  ble.on("advert", async (a) => {
    if (picked || !a.name || (want ? !a.name.toLowerCase().includes(want) : !/peak|puffco|plasma/i.test(a.name))) return;
    picked = true;
    const p = ble.peripheral(a.id)!;
    console.log(`${ts()} picked ${JSON.stringify(a.name)} rssi ${a.rssi}`);
    await ble.stopScan();
    p.on("disconnect", (reason: unknown) => console.log(`${ts()} DISCONNECT event (${String(reason)})`));
    try {
      console.log(`${ts()} connectAsync…`);
      await p.connectAsync();
      console.log(`${ts()} connected, state=${p.state}`);
      if (flag("--pair-first")) console.log(`${ts()} ${await ble.pair(p)}`);
      console.log(`${ts()} discoverAll…`);
      const { services, characteristics } = await p.discoverAllServicesAndCharacteristicsAsync();
      console.log(`${ts()} services: ${services.map((s) => s.uuid).join(", ")}`);
      console.log(`${ts()} ${characteristics.length} characteristics`);
      const version = characteristics.find((c) => c.uuid.toLowerCase() === "05434bcacc7f4ef6bbb3b1c520b9800c");
      if (version) {
        try {
          console.log(`${ts()} read VERSION… -> ${(await version.readAsync()).toString("hex")}`);
        } catch (e) {
          console.log(`${ts()} read VERSION failed: ${(e as Error).message}`);
          console.log(`${ts()} ${await ble.pair(p)}`);
          console.log(`${ts()} read VERSION again -> ${(await version.readAsync()).toString("hex")}`);
        }
      } else console.log(`${ts()} no Lorax VERSION characteristic`);
      await new Promise((r) => setTimeout(r, 3000));
      console.log(`${ts()} state=${p.state}, disconnecting`);
      await p.disconnectAsync();
    } catch (e) {
      console.log(`${ts()} FAILED: ${(e as Error).message}`);
    }
    process.exit(0);
  });
  whenOn(() => void ble.startScan());
  setTimeout(() => {
    console.log("no matching device in 30 s");
    process.exit(1);
  }, 30000);
} else {
  const device = new PeakPro(log);
  let last = "";
  device.on("update", () => {
    const s = device.state;
    const line =
      `${s.link}${s.error ? ` (${s.error})` : ""} | ${s.model || s.name} | bat ${s.battery ?? "?"}% chg ${s.charge ?? "?"} | ` +
      `state ${s.opState === null ? "?" : OperatingState[s.opState]} | temp ${s.heaterTempC === null ? "?" : Math.round(cToF(s.heaterTempC)) + "F"} ` +
      `target ${s.targetTempC === null ? "?" : Math.round(cToF(s.targetTempC)) + "F"} | ${Math.round(s.elapsedS)}/${Math.round(s.totalS)}s | ` +
      `profile ${s.profileIndex === null ? "?" : s.profileIndex + 1} ${device.profile()?.name ?? ""} ${device.profile() ? Math.round(cToF(device.profile()!.tempC)) + "F " + Math.round(device.profile()!.timeS) + "s " + (device.profile()!.color ?? "") : ""}`;
    if (line !== last) {
      last = line;
      console.log(line);
    }
  });
  device.start({ nameFilter: opt("--name"), deviceId: opt("--id") });

  let started = false;
  const t0 = Date.now();
  const tick = setInterval(async () => {
    const elapsed = Date.now() - t0;
    if (device.connected && flag("--start") && !started) {
      started = true;
      console.log("profiles:", device.state.profiles.map((p) => `${p.index + 1}:${p.name} ${Math.round(cToF(p.tempC))}F/${Math.round(p.timeS)}s ${p.color ?? ""}`).join("  "));
      console.log(">> starting heat cycle");
      await device.startHeat().catch((e) => console.log("start failed:", e.message));
      setTimeout(async () => {
        console.log(">> stopping heat cycle");
        await device.stopHeat().catch((e) => console.log("stop failed:", e.message));
      }, 15000);
    }
    if (elapsed > 90000) {
      clearInterval(tick);
      console.log("done");
      await device.stop();
      process.exit(0);
    }
  }, 500);
}

/**
 * The Peak Pro as the plugin sees it: scans, connects, authenticates, polls, and exposes commands. Emits "update"
 * whenever anything an action might draw has changed. Reconnects on its own.
 */
import { EventEmitter } from "node:events";
import { ble, type Advert, type AdapterState, type Characteristic, type Peripheral } from "../ble";
import { decodeCbor, firstColor } from "./cbor";
import { ChamberType, ChargeState, DEVICE_INFO_SERVICE, LEGACY_SERVICE, LORAX_SERVICE, LoraxChar, ModeCommand, OperatingState, PRODUCT_NAMES, Path } from "./constants";
import { Lorax, LoraxError } from "./lorax";

export type Link = "adapter-off" | "scanning" | "connecting" | "authenticating" | "ready" | "error";

export type Profile = { index: number; name: string; tempC: number; timeS: number; color: string | null };

export type DeviceState = {
  link: Link;
  adapter: AdapterState;
  error: string;
  id: string;
  name: string;
  model: string;
  battery: number | null;
  charge: ChargeState | null;
  chamber: string;
  opState: OperatingState | null;
  heaterTempC: number | null;
  targetTempC: number | null;
  elapsedS: number;
  totalS: number;
  profileIndex: number | null;
  profiles: Profile[];
  lantern: boolean | null;
  stealth: boolean | null;
  dabsRemaining: number | null;
  dabsTotal: number | null;
  dabsPerDay: number | null;
  /** LED brightness 0..255 (the four LED groups are kept in step). */
  brightness: number | null;
  lastSeen: Advert | null;
  seen: Advert[];
};

export type Options = {
  /** Match on this peripheral id/address first; otherwise any Peak Pro. */
  deviceId?: string;
  /** Substring (case-insensitive) a device name must contain when the adverts carry no service UUIDs. */
  nameFilter?: string;
};

const HEATING = new Set([OperatingState.TEMP_SELECT, OperatingState.HEAT_CYCLE_PREHEAT, OperatingState.HEAT_CYCLE_ACTIVE, OperatingState.HEAT_CYCLE_FADE]);

export function isHeating(s: OperatingState | null): boolean {
  return s !== null && HEATING.has(s);
}

type Log = { info(m: string): void; warn(m: string): void; debug(m: string): void };

export class PeakPro extends EventEmitter {
  state: DeviceState = {
    link: "adapter-off",
    adapter: "unknown",
    error: "",
    id: "",
    name: "",
    model: "",
    battery: null,
    charge: null,
    chamber: "",
    opState: null,
    heaterTempC: null,
    targetTempC: null,
    elapsedS: 0,
    totalS: 0,
    profileIndex: null,
    profiles: [],
    lantern: null,
    stealth: null,
    dabsRemaining: null,
    dabsTotal: null,
    dabsPerDay: null,
    brightness: null,
    lastSeen: null,
    seen: [],
  };
  options: Options = {};
  private lorax: Lorax | null = null;
  private peripheral: Peripheral | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private slowTick = 0;
  private wanted = false;
  private busy = false;
  private pending: NodeJS.Timeout | null = null;

  constructor(private log: Log) {
    super();
    ble.on("state", (s: AdapterState) => {
      this.state.adapter = s;
      if (s === "poweredOn" && this.wanted) void this.scan();
      else if (s !== "poweredOn") {
        this.state.link = "adapter-off";
        void this.teardown("adapter " + s);
      }
      this.changed();
    });
    ble.on("advert", (a: Advert) => this.onAdvert(a));
  }

  private changed(): void {
    if (this.pending) return;
    this.pending = setTimeout(() => {
      this.pending = null;
      this.emit("update");
    }, 50);
  }

  get connected(): boolean {
    return this.state.link === "ready";
  }

  /** Start looking for the device and keep it connected until stop(). */
  start(options: Options = {}): void {
    this.options = options;
    this.wanted = true;
    this.state.adapter = ble.state;
    if (ble.state === "poweredOn") void this.scan();
    else this.state.link = "adapter-off";
    this.changed();
  }

  async stop(): Promise<void> {
    this.wanted = false;
    await this.teardown("stopped");
  }

  // ---------------------------------------------------------------------------
  // Discovery and connection
  // ---------------------------------------------------------------------------

  private async scan(): Promise<void> {
    if (this.peripheral || this.busy) return;
    this.state.link = "scanning";
    this.state.error = "";
    this.scanStartedAt = Date.now();
    this.changed();
    try {
      await ble.startScan();
    } catch (e) {
      this.fail(`scan failed: ${msg(e)}`);
      return;
    }
    if (this.trialTimer) clearTimeout(this.trialTimer);
    this.trialTimer = setTimeout(() => this.tryCandidates(), 6000);
  }

  private trialTimer: NodeJS.Timeout | null = null;

  /**
   * Some Peaks advertise only once in a while, so waiting for a second advert can take forever. After the grace
   * period, try the strongest named device we have already seen that is not known to be something else.
   */
  private tryCandidates(): void {
    this.trialTimer = null;
    if (!this.wanted || this.peripheral || this.busy || this.state.link !== "scanning" || this.options.nameFilter?.trim()) return;
    const candidates = this.state.seen.filter((a) => a.name && !this.rejected.has(a.id)).sort((a, b) => b.rssi - a.rssi);
    const next = candidates[0];
    if (!next) {
      this.trialTimer = setTimeout(() => this.tryCandidates(), 3000);
      return;
    }
    const p = ble.peripheral(next.id);
    if (!p) {
      this.log.warn(`no peripheral object for ${next.name} (${next.id}); skipping`);
      this.rejected.add(next.id);
      this.trialTimer = setTimeout(() => this.tryCandidates(), 1000);
      return;
    }
    this.state.lastSeen = next;
    void this.connect(p, true);
  }

  private looksLikePeak(a: Advert): boolean {
    if (this.options.deviceId && (a.id === this.options.deviceId || a.address === this.options.deviceId)) return true;
    if (a.serviceUuids.some((u) => u === LORAX_SERVICE || u === LEGACY_SERVICE)) return true;
    const filter = this.options.nameFilter?.trim().toLowerCase();
    if (filter) return a.name.toLowerCase().includes(filter);
    return /peak|puffco/i.test(a.name);
  }

  /** Devices we connected to and found no Lorax service on: never try them again this session. */
  private rejected = new Set<string>();
  private scanStartedAt = 0;

  private onAdvert(a: Advert): void {
    if (a.name && !this.state.seen.some((s) => s.id === a.id)) {
      this.state.seen = [...this.state.seen.slice(-19), a];
      this.log.info(`seen ${JSON.stringify(a.name)} (${a.id}, ${a.serviceUuids.length} service uuids)`);
      this.changed();
    }
    if (!this.wanted || this.peripheral || this.busy || this.state.link !== "scanning") return;
    let trial = false;
    if (!this.looksLikePeak(a)) {
      // A renamed Peak advertises its custom name and no service UUIDs, so nothing identifies it from the advert.
      // After a few seconds without a match, try every named device once and keep the one that speaks Lorax.
      const waited = Date.now() - this.scanStartedAt;
      if (!a.name || this.rejected.has(a.id) || waited < 6000 || this.options.nameFilter?.trim()) return;
      trial = true;
    }
    const p = ble.peripheral(a.id);
    if (!p) return;
    this.state.lastSeen = a;
    void this.connect(p, trial);
  }

  private async connect(p: Peripheral, trial = false): Promise<void> {
    this.busy = true;
    this.peripheral = p;
    this.state.link = "connecting";
    this.state.id = p.id;
    this.state.name = p.advertisement?.localName || this.state.name || "Peak Pro";
    this.changed();
    try {
      await ble.stopScan();
      this.log.info(`${trial ? "trying" : "connecting to"} ${this.state.name} (${p.id})`);
      let { services, chars } = await ble.connect(p, (m) => this.log.info(m));
      this.log.info(`${this.state.name}: services [${services.join(", ")}], ${chars.size} characteristics`);
      if (services.includes(LORAX_SERVICE) && !chars.has(LoraxChar.COMMAND)) {
        // Lorax service present but its characteristics withheld: Windows does that before the link is bonded.
        this.log.warn("Lorax service found without characteristics; pairing and rediscovering");
        this.log.info(await ble.pair(p));
        ({ services, chars } = await ble.discover(p, (m) => this.log.info(m)));
      }
      if (!chars.has(LoraxChar.COMMAND)) {
        if (services.includes(LEGACY_SERVICE)) {
          // Pre-Lorax firmware: a Peak, but not one we can drive. Keep it so the status key can say so.
          this.log.warn(`${this.state.name} runs pre-X firmware (legacy service only); update it in the Puffco app`);
          await this.teardown("Peak firmware too old: update it in the Puffco app", false);
          this.state.link = "error";
          this.state.error = "firmware too old";
          this.changed();
          return;
        }
        this.rejected.add(p.id);
        this.log.info(`${this.state.name} has no Lorax service, skipping`);
        await this.teardown("not a Peak Pro", true);
        return;
      }
      p.once("disconnect", () => {
        this.log.info("device disconnected");
        void this.teardown("disconnected", true);
      });
      this.state.link = "authenticating";
      this.changed();
      const lorax = new Lorax(chars);
      try {
        await lorax.open();
      } catch (e) {
        // The Peak wants an encrypted, bonded link; on an unbonded Windows link the first protected access fails
        // (or the device drops the link). Bond once, then try again.
        this.log.warn(`first open failed (${msg(e)}); pairing and retrying`);
        lorax.close();
        this.log.info(await ble.pair(p));
        await lorax.open();
      }
      this.lorax = lorax;
      await this.loadStatic();
      await this.loadProfiles();
      await this.pollFast();
      await this.pollSlow();
      this.state.link = "ready";
      this.state.error = "";
      this.log.info(`ready: ${this.state.model || this.state.name}, battery ${this.state.battery}%`);
      this.changed();
      this.schedulePoll();
    } catch (e) {
      this.log.warn(`connect failed: ${msg(e)}`);
      await this.teardown(`connect failed: ${msg(e)}`, true);
    } finally {
      this.busy = false;
    }
  }

  private fail(error: string): void {
    this.state.link = "error";
    this.state.error = error;
    this.changed();
  }

  private async teardown(reason: string, retry = false): Promise<void> {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    if (this.trialTimer) clearTimeout(this.trialTimer);
    this.trialTimer = null;
    this.lorax?.close();
    this.lorax = null;
    const p = this.peripheral;
    this.peripheral = null;
    if (p) await p.disconnectAsync().catch(() => {});
    Object.assign(this.state, { opState: null, heaterTempC: null, targetTempC: null, elapsedS: 0, totalS: 0 });
    if (this.state.link !== "adapter-off") {
      this.state.link = this.wanted ? "scanning" : "error";
      this.state.error = this.wanted ? "" : reason;
    }
    this.changed();
    // Give Windows and the device time to fully drop the old link; immediate retries overlap it and fail.
    if (retry && this.wanted && ble.state === "poweredOn") setTimeout(() => void this.scan(), 4000);
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  private async loadStatic(): Promise<void> {
    const l = this.lorax!;
    const name = await l.readString(Path.DEVICE_NAME).catch(() => "");
    if (name) this.state.name = name;
    const model = await l.readU32(Path.MODEL_CODE).catch(() => -1);
    this.state.model = PRODUCT_NAMES[model] ?? (model >= 0 ? `Peak Pro (model ${model})` : "Peak Pro");
    const chamber = await l.readU8(Path.CHAMBER_TYPE).catch(() => -1);
    this.state.chamber = ChamberType[chamber] ?? "";
  }

  async loadProfiles(): Promise<void> {
    const l = this.lorax;
    if (!l) return;
    const profiles: Profile[] = [];
    for (let i = 0; i < 4; i++) {
      const name = await l.readString(Path.profileName(i)).catch(() => `Profile ${i + 1}`);
      const tempC = await l.readF32(Path.profileTemp(i)).catch(() => NaN);
      const timeS = await l.readF32(Path.profileTime(i)).catch(() => NaN);
      let color: string | null = null;
      try {
        color = firstColor(decodeCbor(await l.readAll(Path.profileColor(i))));
      } catch {
        color = null;
      }
      profiles.push({ index: i, name: name || `Profile ${i + 1}`, tempC, timeS, color });
    }
    this.state.profiles = profiles;
    this.changed();
  }

  private async pollFast(): Promise<void> {
    const l = this.lorax;
    if (!l) return;
    const s = this.state;
    const prevState = s.opState;
    s.opState = (await l.readU8(Path.OPERATING_STATE)) as OperatingState;
    s.heaterTempC = await l.readF32(Path.HEATER_TEMP);
    if (isHeating(s.opState)) {
      s.targetTempC = await l.readF32(Path.HEATER_TEMP_COMMAND).catch(() => s.targetTempC);
      s.elapsedS = await l.readF32(Path.STATE_ELAPSED);
      s.totalS = await l.readF32(Path.STATE_TOTAL);
    } else {
      s.elapsedS = 0;
      s.totalS = 0;
    }
    if (s.opState === OperatingState.HEAT_CYCLE_ACTIVE && prevState !== OperatingState.HEAT_CYCLE_ACTIVE) this.emit("ready");
    const idx = await l.readU8(Path.PROFILE_CURRENT);
    if (idx !== s.profileIndex) {
      s.profileIndex = idx;
      // Profile edits made on the device or in the app show up here; refresh lazily.
      setTimeout(() => void this.loadProfiles().catch(() => {}), 0);
    }
    this.changed();
  }

  private async pollSlow(): Promise<void> {
    const l = this.lorax;
    if (!l) return;
    const s = this.state;
    s.battery = Math.round(await l.readF32(Path.BATTERY_SOC));
    s.charge = (await l.readU8(Path.BATTERY_CHARGE_STATE)) as ChargeState;
    s.dabsRemaining = Math.round(await l.readF32(Path.DABS_REMAINING).catch(() => NaN)) || null;
    s.dabsTotal = await l.readU32(Path.DABS_TOTAL).catch(() => null);
    const perDay = await l.readF32(Path.DABS_PER_DAY).catch(() => NaN);
    s.dabsPerDay = Number.isFinite(perDay) ? Math.round(perDay * 10) / 10 : null;
    s.stealth = (await l.readU8(Path.STEALTH).catch(() => -1)) === 1;
    const lbrt = await l.readShort(Path.LED_BRIGHTNESS, 4).catch(() => null);
    if (lbrt && lbrt.length >= 1) s.brightness = Math.max(...lbrt.subarray(0, 4));
    this.changed();
  }

  private schedulePoll(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    const fast = isHeating(this.state.opState);
    this.pollTimer = setTimeout(async () => {
      this.pollTimer = null;
      if (!this.lorax) return;
      try {
        await this.pollFast();
        if (++this.slowTick % (fast ? 20 : 6) === 0) await this.pollSlow();
      } catch (e) {
        this.log.warn(`poll failed: ${msg(e)}`);
        if (!(e instanceof LoraxError)) {
          await this.teardown(`poll failed: ${msg(e)}`, true);
          return;
        }
      }
      this.schedulePoll();
    }, fast ? 400 : 1500);
  }

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------

  private need(): Lorax {
    if (!this.lorax) throw new Error("not connected");
    return this.lorax;
  }

  private async afterCommand(): Promise<void> {
    await new Promise((r) => setTimeout(r, 150));
    await this.pollFast().catch(() => {});
    this.schedulePoll();
  }

  async command(cmd: number): Promise<void> {
    await this.need().writeU8(Path.COMMAND, cmd);
    await this.afterCommand();
  }
  startHeat(): Promise<void> {
    return this.command(ModeCommand.HEAT_CYCLE_START);
  }
  stopHeat(): Promise<void> {
    return this.command(ModeCommand.HEAT_CYCLE_ABORT);
  }
  boost(): Promise<void> {
    return this.command(ModeCommand.HEAT_CYCLE_BOOST);
  }
  /** Start if idle, stop if a cycle is running. */
  async toggleHeat(): Promise<void> {
    return isHeating(this.state.opState) ? this.stopHeat() : this.startHeat();
  }
  async selectProfile(index: number): Promise<void> {
    await this.need().writeU8(Path.PROFILE_CURRENT, index & 3);
    this.state.profileIndex = index & 3;
    await this.afterCommand();
  }
  async setProfileTemp(index: number, tempC: number): Promise<void> {
    const t = Math.max(120, Math.min(320, tempC));
    await this.need().writeF32(Path.profileTemp(index), t);
    const p = this.state.profiles[index];
    if (p) p.tempC = t;
    this.changed();
  }
  async setProfileTime(index: number, seconds: number): Promise<void> {
    const t = Math.max(30, Math.min(180, seconds));
    await this.need().writeF32(Path.profileTime(index), t);
    const p = this.state.profiles[index];
    if (p) p.timeS = t;
    this.changed();
  }
  async setLantern(on: boolean): Promise<void> {
    await this.need().writeU8(Path.LANTERN_CMD, on ? 1 : 0);
    this.state.lantern = on;
    this.changed();
  }
  async setStealth(on: boolean): Promise<void> {
    await this.need().writeU8(Path.STEALTH, on ? 1 : 0);
    this.state.stealth = on;
    this.changed();
  }
  showBattery(): Promise<void> {
    return this.command(ModeCommand.SHOW_BATTERY);
  }
  sleep(): Promise<void> {
    return this.command(ModeCommand.SLEEP);
  }
  powerOff(): Promise<void> {
    return this.command(ModeCommand.MASTER_OFF);
  }
  /** 0..255 applied to all four LED groups (ring, under-glass, main, battery). */
  async setBrightness(level: number): Promise<void> {
    const v = Math.max(0, Math.min(255, Math.round(level)));
    await this.need().writeShort(Path.LED_BRIGHTNESS, Buffer.from([v, v, v, v]));
    this.state.brightness = v;
    this.changed();
  }
  /** Cycle to the next profile (wraps). */
  async nextProfile(step = 1): Promise<void> {
    const cur = this.state.profileIndex ?? 0;
    await this.selectProfile((((cur + step) % 4) + 4) % 4);
  }

  /** Active profile, if known. */
  profile(): Profile | null {
    return this.state.profileIndex === null ? null : (this.state.profiles[this.state.profileIndex] ?? null);
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const cToF = (c: number): number => c * 1.8 + 32;
export const fToC = (f: number): number => (f - 32) / 1.8;

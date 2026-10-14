import { action, type KeyDownEvent, type KeyUpEvent } from "@elgato/streamdeck";
import { isHeating } from "../puffco/device";
import { batteryKey, boostKey, GOLD, glyphs, heatKey, powerKey, profileKey, PURPLE, sessionStatsKey, statusKey, toggleKey } from "../render/svg";
import { device, globals } from "../shared";
import { PuffcoAction, type AnyAction } from "./base";

type ProfileSettings = { slot?: string; press?: "select" | "select-start" };

@action({ UUID: "com.mjp.simplypuffco.profile" })
export class ProfileKey extends PuffcoAction<ProfileSettings> {
  private slot(s: ProfileSettings): number {
    return Math.max(1, Math.min(4, Number(s.slot) || 1));
  }
  protected override async render(a: AnyAction<ProfileSettings>, s: ProfileSettings): Promise<void> {
    if (a.isDial()) return;
    const slot = this.slot(s);
    const d = device.state;
    await a.setImage(profileKey(d.profiles[slot - 1] ?? null, slot, d.profileIndex === slot - 1, d, globals.unit));
  }
  override async onKeyDown(ev: KeyDownEvent<ProfileSettings>): Promise<void> {
    const s = ev.payload.settings ?? {};
    const idx = this.slot(s) - 1;
    await this.run(ev.action, async () => {
      if (device.state.profileIndex !== idx) await device.selectProfile(idx);
      if (s.press === "select-start") await device.startHeat();
    });
  }
}

type HeatSettings = { hold?: boolean };

/** How long Start must be held, so a brushed key never lights the chamber. Stop is always instant. */
export const HOLD_MS = 600;

@action({ UUID: "com.mjp.simplypuffco.heat" })
export class HeatKey extends PuffcoAction<HeatSettings> {
  private holds = new Map<string, NodeJS.Timeout>();

  constructor() {
    super();
    // Chamber just reached temperature: flash a tick on every Start key so you notice without looking at the Peak.
    device.on("ready", () => {
      for (const a of this.actions) if (a.isKey()) void a.showOk();
    });
  }

  protected override async render(a: AnyAction<HeatSettings>, s: HeatSettings): Promise<void> {
    if (a.isDial()) return;
    await a.setImage(heatKey(device.state, globals.unit, s.hold !== false && !this.holds.has(a.id)));
  }

  override async onKeyDown(ev: KeyDownEvent<HeatSettings>): Promise<void> {
    const s = ev.payload.settings ?? {};
    if (isHeating(device.state.opState) || s.hold === false) {
      await this.run(ev.action, () => device.toggleHeat());
      return;
    }
    const id = ev.action.id;
    this.holds.set(
      id,
      setTimeout(() => {
        this.holds.delete(id);
        void this.run(ev.action, () => device.startHeat());
      }, HOLD_MS),
    );
  }

  override async onKeyUp(ev: KeyUpEvent<HeatSettings>): Promise<void> {
    const t = this.holds.get(ev.action.id);
    if (!t) return;
    clearTimeout(t);
    this.holds.delete(ev.action.id);
    await ev.action.showAlert(); // released too early: the key says "hold to start"
  }
}

@action({ UUID: "com.mjp.simplypuffco.boost" })
export class BoostKey extends PuffcoAction {
  protected override async render(a: AnyAction<never>): Promise<void> {
    if (a.isDial()) return;
    await a.setImage(boostKey(device.state));
  }
  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    await this.run(ev.action, () => device.boost());
  }
}

@action({ UUID: "com.mjp.simplypuffco.battery" })
export class BatteryKey extends PuffcoAction {
  protected override async render(a: AnyAction<never>): Promise<void> {
    if (a.isDial()) return;
    await a.setImage(batteryKey(device.state));
  }
  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    await this.run(ev.action, () => device.showBattery());
  }
}

@action({ UUID: "com.mjp.simplypuffco.lantern" })
export class LanternKey extends PuffcoAction {
  protected override async render(a: AnyAction<never>): Promise<void> {
    if (a.isDial()) return;
    await a.setImage(toggleKey(device.state, "Lantern", device.state.lantern, glyphs.lantern, GOLD));
  }
  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    await this.run(ev.action, () => device.setLantern(!device.state.lantern));
  }
}

@action({ UUID: "com.mjp.simplypuffco.stealth" })
export class StealthKey extends PuffcoAction {
  protected override async render(a: AnyAction<never>): Promise<void> {
    if (a.isDial()) return;
    await a.setImage(toggleKey(device.state, "Stealth", device.state.stealth, glyphs.ghost, PURPLE));
  }
  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    await this.run(ev.action, () => device.setStealth(!device.state.stealth));
  }
}

@action({ UUID: "com.mjp.simplypuffco.stats" })
export class StatsKey extends PuffcoAction {
  protected override async render(a: AnyAction<never>): Promise<void> {
    if (a.isDial()) return;
    await a.setImage(sessionStatsKey(device.state));
  }
}

type PowerSettings = { mode?: "sleep" | "off"; hold?: boolean };

@action({ UUID: "com.mjp.simplypuffco.power" })
export class PowerKey extends PuffcoAction<PowerSettings> {
  private holds = new Map<string, NodeJS.Timeout>();

  protected override async render(a: AnyAction<PowerSettings>, s: PowerSettings): Promise<void> {
    if (a.isDial()) return;
    await a.setImage(powerKey(device.state, s.mode === "off" ? "off" : "sleep", s.hold !== false));
  }

  private async fire(a: AnyAction<PowerSettings>, s: PowerSettings): Promise<void> {
    await this.run(a, () => (s.mode === "off" ? device.powerOff() : device.sleep()));
  }

  override async onKeyDown(ev: KeyDownEvent<PowerSettings>): Promise<void> {
    const s = ev.payload.settings ?? {};
    if (s.hold === false) return this.fire(ev.action, s);
    const id = ev.action.id;
    this.holds.set(
      id,
      setTimeout(() => {
        this.holds.delete(id);
        void this.fire(ev.action, s);
      }, HOLD_MS),
    );
  }

  override async onKeyUp(ev: KeyUpEvent<PowerSettings>): Promise<void> {
    const t = this.holds.get(ev.action.id);
    if (!t) return;
    clearTimeout(t);
    this.holds.delete(ev.action.id);
    await ev.action.showAlert();
  }
}

@action({ UUID: "com.mjp.simplypuffco.status" })
export class StatusKey extends PuffcoAction {
  protected override async render(a: AnyAction<never>): Promise<void> {
    if (a.isDial()) return;
    await a.setImage(statusKey(device.state));
  }
  /** Press: drop the connection and search again (useful after the phone app had the device). */
  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    await device.stop();
    device.start({ nameFilter: globals.value.nameFilter, deviceId: globals.value.deviceId });
    await ev.action.showOk();
  }
}

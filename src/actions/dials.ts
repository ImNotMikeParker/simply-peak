/** Stream Deck + dials: a session panel (temp, countdown, rotate to adjust the profile) and a battery panel. */
import { action, type DialDownEvent, type DialRotateEvent, type DialUpEvent, type TouchTapEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { ChargeState, OperatingState } from "../puffco/constants";
import { cToF, fToC, isHeating } from "../puffco/device";
import { BLUE, cycleProgress, DIM, fmtTemp, fmtTime, FG, GOLD, GREEN, linkSub, MUTED, ORANGE, PURPLE, RED, stateColor, stateLabel, fit } from "../render/svg";
import { device, globals } from "../shared";
import { PuffcoAction, type AnyAction } from "./base";
import { HOLD_MS } from "./keys";

type SessionSettings = { step?: string; tap?: "boost" | "none"; hold?: boolean; rotate?: "temp" | "time" | "profile" };

@action({ UUID: "com.mjp.simplypuffco.dial-session" })
export class SessionDial extends PuffcoAction<SessionSettings> {
  private pendingTemp = new Map<number, { tempC: number; timer: NodeJS.Timeout }>();
  private pendingTime = new Map<number, NodeJS.Timeout>();
  private flashUntil = 0;
  private flashText = "";

  protected override async render(a: AnyAction<SessionSettings>): Promise<void> {
    if (!a.isDial()) return;
    const d = device.state;
    const unit = globals.unit;
    if (d.link !== "ready") {
      const [t, s] = linkSub(d);
      await a.setFeedback({ title: { value: "SIMPLY PUFFCO", color: DIM }, temp: { value: t, color: d.link === "error" || d.link === "adapter-off" ? RED : MUTED }, sub: { value: s, color: DIM }, bar: 0 });
      return;
    }
    const p = device.profile();
    const color = p?.color ?? PURPLE;
    const heating = isHeating(d.opState);
    const flashing = Date.now() < this.flashUntil;
    const title = `${p ? fit(p.name, 14) : "No profile"}${d.profileIndex !== null ? `  ·  P${d.profileIndex + 1}` : ""}`;
    let temp: string;
    let sub: string;
    let subColor = MUTED;
    if (flashing) {
      temp = this.flashText;
      sub = "profile temperature";
      subColor = color;
    } else if (heating) {
      temp = fmtTemp(d.heaterTempC, unit);
      sub =
        d.opState === OperatingState.HEAT_CYCLE_ACTIVE
          ? `${stateLabel(d.opState)}  ·  ${fmtTime(Math.max(0, d.totalS - d.elapsedS))} left`
          : d.opState === OperatingState.HEAT_CYCLE_PREHEAT
            ? `Heating to ${fmtTemp(d.targetTempC ?? p?.tempC ?? null, unit)}`
            : stateLabel(d.opState);
      subColor = stateColor(d.opState);
    } else {
      temp = p ? fmtTemp(p.tempC, unit) : "—";
      sub = p ? `${fmtTime(p.timeS)}  ·  press to start` : stateLabel(d.opState);
    }
    await a.setFeedback({
      title: { value: title, color },
      temp: { value: temp, color: heating && !flashing ? FG : color },
      sub: { value: sub, color: subColor },
      bar: { value: heating ? Math.round(cycleProgress(d)) : 0, bar_fill_c: heating ? stateColor(d.opState) : color },
    });
  }

  private lastProfileTurn = 0;

  override async onDialRotate(ev: DialRotateEvent<SessionSettings>): Promise<void> {
    const s = ev.payload.settings ?? {};
    const p = device.profile();
    if (!device.connected || !p) return ev.action.showAlert();
    const unit = globals.unit;
    if (s.rotate === "profile") {
      // One profile per detent, but a fast spin should not race the device: at most one switch every 300 ms.
      const now = Date.now();
      if (now - this.lastProfileTurn < 300) return;
      this.lastProfileTurn = now;
      await this.run(ev.action, () => device.nextProfile(Math.sign(ev.payload.ticks) || 1));
      return;
    }
    if (s.rotate === "time") {
      const next = Math.max(30, Math.min(180, Math.round(p.timeS) + ev.payload.ticks * 5));
      p.timeS = next;
      this.flashText = fmtTime(next);
      this.flashUntil = Date.now() + 1200;
      const prev = this.pendingTime.get(p.index);
      if (prev) clearTimeout(prev);
      this.pendingTime.set(
        p.index,
        setTimeout(() => {
          this.pendingTime.delete(p.index);
          device.setProfileTime(p.index, next).catch(() => void ev.action.showAlert());
        }, 500),
      );
      setTimeout(() => void this.renderAll(), 1300);
      await this.render(ev.action);
      return;
    }
    const stepF = Number(s.step) || 5;
    const cur = unit === "c" ? Math.round(p.tempC) : Math.round(cToF(p.tempC));
    const next = cur + ev.payload.ticks * (unit === "c" ? Math.max(1, Math.round(stepF / 1.8)) : stepF);
    const tempC = unit === "c" ? next : fToC(next);
    p.tempC = tempC;
    this.flashText = fmtTemp(tempC, unit);
    this.flashUntil = Date.now() + 1200;
    // Debounce the write: dials spin fast, the device does not need every tick.
    const prev = this.pendingTemp.get(p.index);
    if (prev) clearTimeout(prev.timer);
    this.pendingTemp.set(p.index, {
      tempC,
      timer: setTimeout(() => {
        this.pendingTemp.delete(p.index);
        device.setProfileTemp(p.index, tempC).catch(() => void ev.action.showAlert());
      }, 500),
    });
    setTimeout(() => void this.renderAll(), 1300);
    await this.render(ev.action);
  }

  private holds = new Map<string, NodeJS.Timeout>();

  /** Press: stop instantly if a session is running; otherwise hold for a moment to start (unless hold is off). */
  override async onDialDown(ev: DialDownEvent<SessionSettings>): Promise<void> {
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

  override async onDialUp(ev: DialUpEvent<SessionSettings>): Promise<void> {
    const t = this.holds.get(ev.action.id);
    if (!t) return;
    clearTimeout(t);
    this.holds.delete(ev.action.id);
    this.flashText = "hold to start";
    this.flashUntil = Date.now() + 1200;
    setTimeout(() => void this.renderAll(), 1300);
    await this.render(ev.action);
  }

  override async onTouchTap(ev: TouchTapEvent<SessionSettings>): Promise<void> {
    if ((ev.payload.settings?.tap ?? "boost") === "none") return;
    await this.run(ev.action, () => device.boost());
  }
}

// ---------------------------------------------------------------------------
// Full-width session strip: the same action on all four dials, each drawing its quarter of one 800 px bar that
// fills while the chamber heats and drains while the session runs. Rotate / press / tap behave like the Session dial.
// ---------------------------------------------------------------------------

type StripSettings = SessionSettings & { segment?: "auto" | "1" | "2" | "3" | "4" };

@action({ UUID: "com.mjp.simplypuffco.dial-strip" })
export class SessionStrip extends SessionDial {
  private columnById = new Map<string, number>();

  override async onWillAppear(ev: Parameters<SessionDial["onWillAppear"]>[0]): Promise<void> {
    const col = (ev.payload as { coordinates?: { column?: number } }).coordinates?.column;
    if (typeof col === "number") this.columnById.set(ev.action.id, col);
    await super.onWillAppear(ev);
  }

  override onWillDisappear(ev: Parameters<SessionDial["onWillDisappear"]>[0]): void {
    this.columnById.delete(ev.action.id);
    super.onWillDisappear(ev);
  }

  private segment(a: AnyAction<SessionSettings>, s: StripSettings): number {
    const fixed = Number(s.segment);
    if (fixed >= 1 && fixed <= 4) return fixed - 1;
    return Math.max(0, Math.min(3, this.columnById.get(a.id) ?? 0));
  }

  protected override async render(a: AnyAction<SessionSettings>): Promise<void> {
    if (!a.isDial()) return;
    const s = (this.settingsById.get(a.id) ?? {}) as StripSettings;
    const seg = this.segment(a, s);
    const d = device.state;
    const unit = globals.unit;
    const p = device.profile();
    const color = p?.color ?? PURPLE;

    // Overall fill 0..1 across the whole strip, then this segment's share of it.
    let fill = 0;
    let barColor = color;
    const heating = d.link === "ready" && isHeating(d.opState);
    if (heating) {
      fill = cycleProgress(d) / 100;
      barColor = stateColor(d.opState);
    } else if (d.link === "ready") {
      fill = 1; // a full, idle bar in the profile colour: "loaded and ready"
    }
    const local = Math.max(0, Math.min(1, fill * 4 - seg));

    // Text: profile on the far left, state on the far right, temperature and time on the inner two.
    let top = "";
    let topRight = "";
    let bottom = "";
    if (d.link !== "ready") {
      const [t, sub] = linkSub(d);
      if (seg === 0) top = "SIMPLY PUFFCO";
      if (seg === 1) bottom = t;
      if (seg === 2) bottom = sub;
    } else {
      const remaining = Math.max(0, d.totalS - d.elapsedS);
      switch (seg) {
        case 0:
          top = p ? fit(p.name, 18) : "No profile";
          bottom = p ? `${fmtTemp(p.tempC, unit)}  ·  ${fmtTime(p.timeS)}` : "";
          break;
        case 1:
          bottom = heating ? fmtTemp(d.heaterTempC, unit) : "press to start";
          break;
        case 2:
          bottom = heating ? stateLabel(d.opState) : d.battery !== null ? `${d.battery}% battery` : "";
          break;
        case 3:
          topRight = d.opState === OperatingState.HEAT_CYCLE_ACTIVE ? `${fmtTime(remaining)} left` : d.opState === OperatingState.HEAT_CYCLE_PREHEAT ? `→ ${fmtTemp(d.targetTempC ?? p?.tempC ?? null, unit)}` : "";
          bottom = heating ? "tap: boost" : "turn: temp";
          break;
      }
    }
    await a.setFeedback({
      top: { value: top, color: MUTED },
      topRight: { value: topRight, color: heating ? stateColor(d.opState) : MUTED },
      bar: { value: Math.round(local * 1000), bar_fill_c: barColor },
      bottom: { value: bottom, color: seg === 1 && heating ? FG : MUTED },
    });
  }
}

@action({ UUID: "com.mjp.simplypuffco.dial-brightness" })
export class BrightnessDial extends PuffcoAction {
  private pending: NodeJS.Timeout | null = null;
  private target: number | null = null;

  protected override async render(a: AnyAction<JsonObject>): Promise<void> {
    if (!a.isDial()) return;
    const d = device.state;
    if (d.link !== "ready") {
      const [t, s] = linkSub(d);
      await a.setFeedback({ title: { value: "LED BRIGHTNESS", color: DIM }, pct: { value: t, color: MUTED }, sub: { value: s, color: DIM }, bar: 0 });
      return;
    }
    const level = this.target ?? d.brightness ?? 0;
    const pct = Math.round((100 * level) / 255);
    await a.setFeedback({
      title: { value: "LED BRIGHTNESS", color: MUTED },
      pct: { value: d.stealth ? "stealth" : `${pct}%`, color: d.stealth ? PURPLE : FG },
      sub: { value: d.stealth ? "press to light up" : "turn to adjust  ·  press for stealth", color: MUTED },
      bar: { value: d.stealth ? 0 : pct, bar_fill_c: GOLD },
    });
  }

  override async onDialRotate(ev: DialRotateEvent): Promise<void> {
    if (!device.connected) return ev.action.showAlert();
    const cur = this.target ?? device.state.brightness ?? 255;
    this.target = Math.max(0, Math.min(255, cur + ev.payload.ticks * 13)); // ≈5 % per detent
    if (this.pending) clearTimeout(this.pending);
    this.pending = setTimeout(() => {
      const v = this.target ?? cur;
      this.pending = null;
      this.target = null;
      device.setBrightness(v).catch(() => void ev.action.showAlert());
    }, 400);
    await this.render(ev.action);
  }

  override async onDialDown(ev: DialDownEvent): Promise<void> {
    await this.run(ev.action, () => device.setStealth(!device.state.stealth));
  }
}

@action({ UUID: "com.mjp.simplypuffco.dial-battery" })
export class BatteryDial extends PuffcoAction {
  protected override async render(a: AnyAction<never>): Promise<void> {
    if (!a.isDial()) return;
    const d = device.state;
    if (d.link !== "ready") {
      const [t, s] = linkSub(d);
      await a.setFeedback({ title: { value: "PEAK PRO", color: DIM }, pct: { value: t, color: MUTED }, sub: { value: s, color: DIM }, bar: 0 });
      return;
    }
    const pct = d.battery ?? 0;
    const charging = d.charge === ChargeState.BULK || d.charge === ChargeState.TOPUP;
    const color = charging ? BLUE : pct <= 15 ? RED : pct <= 35 ? GOLD : GREEN;
    const sub = charging ? "Charging" : d.charge === ChargeState.FULL ? "Fully charged" : d.dabsRemaining ? `≈ ${d.dabsRemaining} sessions left` : d.chamber ? `${d.chamber} chamber` : "";
    await a.setFeedback({
      title: { value: fit(d.model || d.name, 24), color: MUTED },
      pct: { value: `${pct}%`, color: FG },
      sub: { value: `${sub}${d.dabsTotal ? `  ·  ${d.dabsTotal} total` : ""}`, color: charging ? BLUE : MUTED },
      bar: { value: pct, bar_fill_c: color },
    });
  }
  override async onDialDown(ev: DialDownEvent): Promise<void> {
    await this.run(ev.action, () => device.showBattery());
  }
}

export { ORANGE };

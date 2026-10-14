import streamDeck, {
  SingletonAction,
  type Action,
  type DialAction,
  type DidReceiveSettingsEvent,
  type KeyAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { device, globals } from "../shared";

const logger = streamDeck.logger.createScope("actions");

export type AnyAction<T extends JsonObject> = KeyAction<T> | DialAction<T>;

function asRenderable<T extends JsonObject>(a: Action<T>): AnyAction<T> | null {
  return a.isNeoInfobar() ? null : a;
}

/** Shared plumbing: settings per instance, redraw on every device update, error containment. */
export abstract class PuffcoAction<T extends JsonObject = JsonObject> extends SingletonAction<T> {
  protected readonly settingsById = new Map<string, T>();

  constructor() {
    super();
    device.on("update", () => void this.renderAll());
    globals.on("change", () => void this.renderAll());
  }

  protected abstract render(action: AnyAction<T>, settings: T): Promise<void>;

  override async onWillAppear(ev: WillAppearEvent<T>): Promise<void> {
    const settings = ev.payload.settings ?? ({} as T);
    this.settingsById.set(ev.action.id, settings);
    const a = asRenderable(ev.action);
    if (a) await this.safeRender(a, settings);
  }

  override onWillDisappear(ev: WillDisappearEvent<T>): void {
    this.settingsById.delete(ev.action.id);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<T>): Promise<void> {
    const settings = ev.payload.settings ?? ({} as T);
    this.settingsById.set(ev.action.id, settings);
    const a = asRenderable(ev.action);
    if (a) await this.safeRender(a, settings);
  }

  protected async renderAll(): Promise<void> {
    for (const action of this.actions) {
      const a = asRenderable(action);
      if (a) await this.safeRender(a, this.settingsById.get(a.id) ?? ({} as T));
    }
  }

  protected async safeRender(a: AnyAction<T>, s: T): Promise<void> {
    try {
      await this.render(a, s);
    } catch (e) {
      logger.warn(`render failed for ${a.manifestId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Run a device command from a key press: alert on failure, tick on success. */
  protected async run(a: AnyAction<T>, fn: () => Promise<void>): Promise<void> {
    if (!device.connected) {
      await a.showAlert();
      return;
    }
    try {
      await fn();
    } catch (e) {
      logger.warn(`${a.manifestId}: ${e instanceof Error ? e.message : String(e)}`);
      await a.showAlert();
    }
  }
}

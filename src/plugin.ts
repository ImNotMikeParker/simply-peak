import streamDeck from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { BatteryDial, BrightnessDial, SessionDial, SessionStrip } from "./actions/dials";
import { BatteryKey, BoostKey, HeatKey, LanternKey, PowerKey, ProfileKey, StatsKey, StatusKey, StealthKey } from "./actions/keys";
import { device, globals, type GlobalSettings } from "./shared";

streamDeck.logger.setLevel("info");
const logger = streamDeck.logger.createScope("plugin");

for (const a of [new ProfileKey(), new HeatKey(), new BoostKey(), new BatteryKey(), new LanternKey(), new StealthKey(), new StatusKey(), new StatsKey(), new PowerKey(), new SessionDial(), new SessionStrip(), new BatteryDial(), new BrightnessDial()]) {
  streamDeck.actions.registerAction(a);
}

// ---------------------------------------------------------------------------
// Property inspector messaging
// ---------------------------------------------------------------------------

function sendStatus(): void {
  if (!streamDeck.ui.action) return;
  const d = device.state;
  streamDeck.ui
    .sendToPropertyInspector({
      event: "status",
      link: d.link,
      adapter: d.adapter,
      error: d.error,
      name: d.name,
      model: d.model,
      battery: d.battery,
      opState: d.opState,
      seen: d.seen.map((a) => ({ id: a.id, name: a.name, rssi: a.rssi })),
    })
    .catch((e) => logger.warn(`sendToPropertyInspector failed: ${e}`));
}

streamDeck.ui.onDidAppear(() => sendStatus());
streamDeck.ui.onSendToPlugin<JsonValue>(async (ev) => {
  const msg = ev.payload as { event?: string } | null;
  if (msg?.event === "get-status") sendStatus();
  if (msg?.event === "reconnect") {
    await device.stop();
    device.start({ nameFilter: globals.value.nameFilter, deviceId: globals.value.deviceId });
  }
});
device.on("update", sendStatus);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>(async (ev) => {
  const before = globals.value;
  globals.set(ev.settings);
  if (before.nameFilter !== ev.settings.nameFilter || before.deviceId !== ev.settings.deviceId) {
    await device.stop();
    device.start({ nameFilter: ev.settings.nameFilter, deviceId: ev.settings.deviceId });
  }
});

await streamDeck.connect();
globals.set(await streamDeck.settings.getGlobalSettings<GlobalSettings>());
device.start({ nameFilter: globals.value.nameFilter, deviceId: globals.value.deviceId });
logger.info(`Simply Puffco ready (adapter ${device.state.adapter})`);

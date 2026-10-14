# Simply Peak

Control a Puffco Peak Pro from an Elgato Stream Deck over Bluetooth LE. Profiles, sessions, boost, battery, lights,
and a full-width session bar on the Stream Deck + touch strip. Windows, firmware X or later.

Not affiliated with Puffco. For adults 21+.

## Actions

**Keys**

- **Profile** (place four): name, temperature, time and the profile's own colour. The active one is outlined, and the
  outline follows the session colour while heating. Press to select, or select and start.
- **Start / Stop**: hold for a moment to start, press to stop. Live temperature while heating, countdown while ready,
  a progress bar through both, and a tick on every Start key the instant the chamber is ready.
- **Boost**, **Battery** (level, charging, sessions left), **Session Stats** (lifetime count, per day, left on
  battery), **Lantern** and **Stealth** toggles, **Sleep / Power Off** (hold), **Connection** (state, model,
  chamber; press to reconnect; holds the device and unit settings).

**Stream Deck + dials**

- **Session**: temperature and countdown on the strip. Rotate for the active profile's temperature, time, or to
  switch profile. Hold to start, press to stop, tap to boost.
- **Session Strip**: put it on all four dials for one bar across the whole strip that fills while the chamber heats
  and drains through the session. Same controls as Session.
- **Brightness**: LED brightness; press for stealth.
- **Battery**.

Temperature in °F or °C from any action's settings. Everything the plugin writes to the device goes through the
device's own limits: it cannot heat beyond what the Puffco app allows.

## Setup

1. Turn Bluetooth on. Power on the Peak and make sure the Puffco app is not connected to it (the Peak talks to one
   controller at a time).
2. Place any Simply Peak action. The plugin finds the Peak, bonds with Windows the first time (it may take a couple
   of attempts; accept any prompt), and connects. From then on it reconnects whenever the Peak wakes.
3. If you have more than one Peak, type part of your device's name in the Connection key's settings.

If nothing is found for a long time and the Peak is right there, check the PC's Bluetooth antenna. A desktop board
with the Wi-Fi/Bluetooth antenna left unplugged sees every device at the noise floor and can never hold a link.

## How it works

Firmware X and later speak Puffco's "Lorax" protocol: a small virtual filesystem over three BLE characteristics,
framed commands matched to replies by sequence number, and a SHA-256 challenge on connect. The protocol was
reverse-engineered publicly by [Fr0st3h](https://github.com/Fr0st3h/Puffco-Reverse-Engineering-Writeup) and is
implemented in [PuffcoBLE](https://github.com/Fr0st3h/PuffcoBLE) (Python) and [puff.social](https://github.com/puff-social/web).
This plugin re-implements it in TypeScript:

- `src/puffco/lorax.ts`: command framing, sequence-matched replies, authentication, typed path reads and writes.
- `src/puffco/device.ts`: scan, connect, bond, poll (1.5 s idle, 0.4 s while heating), profiles, commands, reconnect.
- `src/puffco/constants.ts`: UUIDs, opcodes, paths, enums. `src/puffco/cbor.ts`: decoder for profile colour documents.
- `src/ble.ts`: the only file that touches Bluetooth, through `@stoprocent/noble`'s prebuilt Node-API binding
  (WinRT). Pairing passes WinRT's own `DevicePairingKinds` values because noble's constants are shifted.

Pre-Lorax firmware (the original characteristics) is not supported; the Connection key says so if it finds one.

## Development

```bash
npm install && npm run deps       # deps: the native BLE binding, installed inside the plugin folder
npm run icons && npm run ui       # regenerate images (including the logo) and settings pages
npm run build
npm run link                      # then restart the Stream Deck app once
npm run restart:force
npm run validate
npm run probe                     # find a Peak, connect, print state for 90 s (no Stream Deck needed)
npm run probe -- --scan           # list every advertising BLE device with advert counts and RSSI
npm run probe -- --once           # one timed connection attempt, every step logged
node scripts/preview.mjs          # render every key state to assets/preview/preview.png
npm run pack                      # build the .streamDeckPlugin
```

Logs: `com.mjp.simplypuffco.sdPlugin/logs/`.

## Credits and AI disclosure

Protocol knowledge comes from the projects linked above. The plugin was designed, tested on hardware, and debugged by
Mike Parker with Claude (Anthropic) writing most of the code under direction. License: MIT.

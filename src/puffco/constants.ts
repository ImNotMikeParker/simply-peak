/**
 * Puffco Peak Pro "Lorax" protocol constants (firmware X and later). Sources: puff.social commons, Fr0st3h's
 * PuffcoBLE and reverse-engineering write-up. UUIDs are in noble's form: lower case, no dashes.
 */
export const strip = (uuid: string): string => uuid.toLowerCase().replace(/-/g, "");

export const LORAX_SERVICE = strip("e276967f-ea8a-478a-a92e-d78f5dd15dd5");
/** Pre-Lorax ("pikachu") service, advertised by older firmware. Not supported, but used to recognise a Peak. */
export const LEGACY_SERVICE = strip("06caf9c0-74d3-454f-9be9-e30cd999c17a");
export const DEVICE_INFO_SERVICE = strip("0000180a-0000-1000-8000-00805f9b34fb");

export const LoraxChar = {
  VERSION: strip("05434bca-cc7f-4ef6-bbb3-b1c520b9800c"),
  COMMAND: strip("60133d5c-5727-4f2c-9697-d842c5292a3c"),
  REPLY: strip("8dc5ec05-8f7d-45ad-99db-3fbde65dbd9c"),
  EVENT: strip("43312cd1-7d34-46ce-a7d3-0a98fd9b4cb8"),
} as const;

export const LORAX_HANDSHAKE_KEY = Buffer.from("ZMZFYlbyb1scoSc3pd1x+w==", "base64");

export const Op = {
  GET_ACCESS_SEED: 0x00,
  UNLOCK_ACCESS: 0x01,
  GET_LIMITS: 0x02,
  ACK_EVENTS: 0x03,
  READ_SHORT: 0x10,
  WRITE_SHORT: 0x11,
  STAT_SHORT: 0x12,
  UNLINK: 0x13,
  OPEN: 0x20,
  READ: 0x21,
  WRITE: 0x22,
  WATCH: 0x23,
  UNWATCH: 0x24,
  STAT: 0x25,
  CLOSE: 0x26,
} as const;

/** Lorax "paths" (the device exposes a little virtual filesystem). */
export const Path = {
  BATTERY_SOC: "/p/bat/soc", // float32, percent
  BATTERY_CHARGE_STATE: "/p/bat/chg/stat", // uint8, ChargeState
  BATTERY_CHARGE_SOURCE: "/p/bat/chg/src", // uint8
  BATTERY_CHARGE_ETF: "/p/bat/chg/etf", // float32, seconds to full
  OPERATING_STATE: "/p/app/stat/id", // uint8, OperatingState
  STATE_ELAPSED: "/p/app/stat/elap", // float32, seconds
  STATE_TOTAL: "/p/app/stat/tott", // float32, seconds
  HEATER_TEMP: "/p/app/htr/temp", // float32, celsius
  HEATER_TEMP_COMMAND: "/p/app/htr/tcmd", // float32, celsius target
  COMMAND: "/p/app/mc", // uint8, ModeCommand
  PROFILE_CURRENT: "/p/app/hcs", // uint8, 0..3
  CURRENT_PROFILE_NAME: "/p/app/thc/name", // string
  CURRENT_PROFILE_TEMP: "/p/app/thc/temp", // float32 celsius
  CURRENT_PROFILE_TIME: "/p/app/thc/time", // float32 seconds
  CURRENT_PROFILE_COLOR: "/p/app/thc/colr", // cbor
  CHAMBER_TYPE: "/p/htr/chmt", // uint8, ChamberType
  LANTERN_CMD: "/p/app/ltrn/cmd", // uint8 0/1
  STEALTH: "/u/app/ui/stlm", // uint8 0/1
  LED_BRIGHTNESS: "/u/app/ui/lbrt", // 4 x uint8
  DEVICE_NAME: "/u/sys/name", // string
  DABS_REMAINING: "/p/app/info/drem", // float32
  DABS_TOTAL: "/p/app/info/dtot", // uint32
  DABS_PER_DAY: "/p/app/info/dpd", // float32
  FIRMWARE: "/p/sys/fw/ver",
  MODEL_CODE: "/p/sys/hw/mdcd", // uint32
  SERIAL: "/p/sys/hw/ser",
  profileName: (i: number) => `/u/app/hc/${i}/name`,
  profileTemp: (i: number) => `/u/app/hc/${i}/temp`,
  profileTime: (i: number) => `/u/app/hc/${i}/time`,
  profileColor: (i: number) => `/u/app/hc/${i}/colr`,
  profileBoostTemp: (i: number) => `/u/app/hc/${i}/btmp`,
  profileBoostTime: (i: number) => `/u/app/hc/${i}/btim`,
} as const;

export const ModeCommand = {
  MASTER_OFF: 0,
  SLEEP: 1,
  IDLE: 2,
  TEMP_SELECT_BEGIN: 3,
  TEMP_SELECT_END: 4,
  SHOW_BATTERY: 5,
  SHOW_VERSION: 6,
  HEAT_CYCLE_START: 7,
  HEAT_CYCLE_ABORT: 8,
  HEAT_CYCLE_BOOST: 9,
  FACTORY_TEST: 10,
  BONDING: 11,
} as const;

export enum OperatingState {
  INIT_MEMORY = 0,
  INIT_VERSION_DISP = 1,
  INIT_BATTERY_DISP = 2,
  MASTER_OFF = 3,
  SLEEP = 4,
  IDLE = 5,
  TEMP_SELECT = 6,
  HEAT_CYCLE_PREHEAT = 7,
  HEAT_CYCLE_ACTIVE = 8,
  HEAT_CYCLE_FADE = 9,
  VERSION_DISP = 10,
  BATTERY_DISP = 11,
  FACTORY_TEST = 12,
  BLE_BONDING = 13,
}

export enum ChargeState {
  BULK = 0,
  TOPUP = 1,
  FULL = 2,
  TEMP_STOP = 3,
  DISCONNECTED = 4,
}

export const ChamberType: Record<number, string> = { 0: "No chamber", 1: "Classic", 2: "3DXL", 3: "3D" };

/** Keyed by the value of /p/sys/hw/mdcd. Puffco mixes model codes and product codes here; both are listed. */
export const PRODUCT_NAMES: Record<number, string> = {
  0: "Peak Pro",
  1: "Peak Pro Opal",
  2: "Peak Pro Indiglow",
  4: "Peak Pro Guardian",
  21: "Peak Pro",
  22: "Peak Pro Opal",
  25: "Peak Pro Indiglow",
  26: "Peak Pro Guardian",
  12: "Peak Pro Pearl",
  13: "Peak Pro Onyx",
  15: "Peak Pro Desert",
  17: "Peak Pro Flourish",
  19: "Peak Pro Storm",
  23: "Peak Pro Daybreak",
};

/**
 * Thin wrapper over the BLE binding so the rest of the plugin never touches noble directly. Swapping in a different
 * backend (a custom Node-API addon, for instance) means rewriting only this file.
 */
import noble, { type Characteristic, type Peripheral } from "@stoprocent/noble";
import { EventEmitter } from "node:events";

export type Advert = {
  id: string;
  address: string;
  name: string;
  rssi: number;
  serviceUuids: string[];
};

export type AdapterState = "unknown" | "resetting" | "unsupported" | "unauthorized" | "poweredOff" | "poweredOn";

class Ble extends EventEmitter {
  get state(): AdapterState {
    return noble.state as AdapterState;
  }
  private scanning = false;

  constructor() {
    super();
    noble.on("stateChange", (s) => this.emit("state", s as AdapterState));
    noble.on("discover", (p: Peripheral) => {
      this.emit("advert", {
        id: p.id,
        address: p.address,
        name: p.advertisement?.localName ?? "",
        rssi: p.rssi,
        serviceUuids: p.advertisement?.serviceUuids ?? [],
      } satisfies Advert);
    });
    noble.on("scanStop", () => {
      this.scanning = false;
    });
  }

  async startScan(): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    try {
      await noble.startScanningAsync([], true);
    } catch (e) {
      this.scanning = false;
      throw e;
    }
  }

  async stopScan(): Promise<void> {
    if (!this.scanning) return;
    this.scanning = false;
    await noble.stopScanningAsync().catch(() => {});
  }

  peripheral(id: string): Peripheral | undefined {
    return (noble as unknown as { _peripherals: Map<string, Peripheral> })._peripherals?.get(id);
  }

  /**
   * Connect and fetch every service and characteristic, keyed by dash-less lower-case UUID. Discovering everything
   * (rather than a fixed list) means a device missing one optional service does not fail the whole connection, and
   * lets the caller tell a Lorax Peak from a legacy one.
   */
  async connect(p: Peripheral, log?: (m: string) => void): Promise<{ services: string[]; chars: Map<string, Characteristic> }> {
    await p.connectAsync();
    return this.discover(p, log);
  }

  /** Enumerate services and, per service, characteristics on an already-connected peripheral. */
  async discover(p: Peripheral, log?: (m: string) => void): Promise<{ services: string[]; chars: Map<string, Characteristic> }> {
    const services = await p.discoverServicesAsync([]);
    const chars = new Map<string, Characteristic>();
    // Ask every service for its own characteristics. The all-in-one discovery call on Windows returned only the
    // characteristics of the first few services on a Peak Pro, silently dropping the Lorax ones.
    for (const s of services) {
      try {
        const list = await s.discoverCharacteristicsAsync([]);
        log?.(`service ${s.uuid}: ${list.length} characteristics`);
        for (const c of list) chars.set(c.uuid.toLowerCase(), c);
      } catch (e) {
        log?.(`service ${s.uuid}: characteristic discovery failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { services: services.map((s) => s.uuid.toLowerCase()), chars };
  }

  private pairing = new Set<string>();

  /**
   * Bond with a connected device (Windows only). noble's DevicePairingKinds constants are shifted relative to
   * WinRT's real enum (its "ConfirmOnly" is 8, WinRT's is 1), which makes Windows answer
   * RequiredHandlerNotRegistered for a Just Works device, so WinRT's own values are passed: ConfirmOnly (1) |
   * ConfirmPinMatch (8). Overlapping requests for the same device are collapsed.
   */
  async pair(p: Peripheral): Promise<string> {
    if (this.pairing.has(p.id)) return "pairing already in progress";
    this.pairing.add(p.id);
    try {
      await p.pairAsync((1 | 8) as never);
      return "paired";
    } catch (e) {
      return `pairing failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      this.pairing.delete(p.id);
    }
  }
}

export const ble = new Ble();
export type { Characteristic, Peripheral };

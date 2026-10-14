/** Singletons shared by every action: the device and the global settings. */
import streamDeck from "@elgato/streamdeck";
import { EventEmitter } from "node:events";
import { PeakPro } from "./puffco/device";
import type { Unit } from "./render/svg";

export type GlobalSettings = { unit?: Unit; nameFilter?: string; deviceId?: string };

class Globals extends EventEmitter {
  value: GlobalSettings = {};
  get unit(): Unit {
    return this.value.unit === "c" ? "c" : "f";
  }
  set(v: GlobalSettings): void {
    this.value = v ?? {};
    this.emit("change");
  }
}

export const globals = new Globals();
export const device = new PeakPro(streamDeck.logger.createScope("peak"));

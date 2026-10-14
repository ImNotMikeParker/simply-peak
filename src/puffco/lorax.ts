/**
 * Lorax transport: frames commands on the COMMAND characteristic, matches replies by sequence number on REPLY,
 * authenticates, and offers typed path reads and writes. One command in flight at a time.
 */
import { createHash } from "node:crypto";
import type { Characteristic } from "../ble";
import { LORAX_HANDSHAKE_KEY, LoraxChar, Op } from "./constants";

export class LoraxError extends Error {
  constructor(
    public readonly op: number,
    public readonly code: number,
    public readonly path?: string,
  ) {
    super(`Lorax op 0x${op.toString(16)} ${path ? `on ${path} ` : ""}failed with error ${code}`);
  }
}

type Pending = { resolve: (b: Buffer) => void; reject: (e: Error) => void; timer: NodeJS.Timeout; op: number; path?: string };

export class Lorax {
  private seq = 0;
  private pending = new Map<number, Pending>();
  private queue: Promise<unknown> = Promise.resolve();
  maxPayload = 125;
  private command: Characteristic;
  private reply: Characteristic;
  private event: Characteristic | undefined;
  private version: Characteristic | undefined;
  private onReply = (data: Buffer) => this.handleReply(data);

  constructor(chars: Map<string, Characteristic>) {
    const need = (uuid: string, name: string) => {
      const c = chars.get(uuid);
      if (!c) throw new Error(`Lorax characteristic ${name} not found: is this a Peak Pro on firmware X or later?`);
      return c;
    };
    this.command = need(LoraxChar.COMMAND, "COMMAND");
    this.reply = need(LoraxChar.REPLY, "REPLY");
    this.event = chars.get(LoraxChar.EVENT);
    this.version = chars.get(LoraxChar.VERSION);
  }

  /** Subscribe to replies, nudge bonding, fetch limits, authenticate. */
  async open(): Promise<void> {
    this.reply.on("data", this.onReply);
    await this.reply.subscribeAsync();
    // Reading the version characteristic is what the official app does first; on a fresh device it triggers bonding.
    if (this.version) await this.version.readAsync().catch(() => {});
    const limits = await this.send(Op.GET_LIMITS);
    if (limits.length >= 1) this.maxPayload = Math.max(20, Math.min(255, limits.readUInt8(0)));
    const seed = await this.send(Op.GET_ACCESS_SEED);
    if (seed.length < 16) throw new Error(`access seed too short (${seed.length} bytes)`);
    const buf = Buffer.alloc(32);
    LORAX_HANDSHAKE_KEY.copy(buf, 0, 0, 16);
    seed.copy(buf, 16, 0, 16);
    const key = createHash("sha256").update(buf).digest().subarray(0, 16);
    await this.send(Op.UNLOCK_ACCESS, key);
  }

  close(): void {
    this.reply.removeListener("data", this.onReply);
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("disconnected"));
    }
    this.pending.clear();
  }

  private handleReply(data: Buffer): void {
    if (data.length < 3) return;
    const seq = data.readUInt16LE(0);
    const error = data.readUInt8(2);
    const p = this.pending.get(seq);
    if (!p) return;
    this.pending.delete(seq);
    clearTimeout(p.timer);
    if (error !== 0) p.reject(new LoraxError(p.op, error, p.path));
    else p.resolve(Buffer.from(data.subarray(3)));
  }

  /** Send one framed command and wait for its reply. Serialised: the device handles one at a time. */
  send(op: number, body: Buffer = Buffer.alloc(0), path?: string, timeoutMs = 3000): Promise<Buffer> {
    const run = () =>
      new Promise<Buffer>((resolve, reject) => {
        const seq = this.seq++ & 0xffff;
        const frame = Buffer.alloc(3 + body.length);
        frame.writeUInt16LE(seq, 0);
        frame.writeUInt8(op, 2);
        body.copy(frame, 3);
        const timer = setTimeout(() => {
          this.pending.delete(seq);
          reject(new Error(`Lorax op 0x${op.toString(16)} ${path ?? ""} timed out`));
        }, timeoutMs);
        this.pending.set(seq, { resolve, reject, timer, op, path });
        this.command.writeAsync(frame, true).catch((e) => {
          this.pending.delete(seq);
          clearTimeout(timer);
          reject(e);
        });
      });
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }

  async readShort(path: string, size = this.maxPayload, offset = 0): Promise<Buffer> {
    const head = Buffer.alloc(4);
    head.writeUInt16LE(offset, 0);
    head.writeUInt16LE(Math.min(size, this.maxPayload), 2);
    return this.send(Op.READ_SHORT, Buffer.concat([head, Buffer.from(path, "utf8")]), path);
  }

  async writeShort(path: string, data: Buffer, offset = 0, flags = 0): Promise<void> {
    const head = Buffer.alloc(3);
    head.writeUInt16LE(offset, 0);
    head.writeUInt8(flags, 2);
    await this.send(Op.WRITE_SHORT, Buffer.concat([head, Buffer.from(path, "utf8"), Buffer.from([0]), data]), path);
  }

  /** Read a whole value in maxPayload-sized chunks (profile colour documents are CBOR and can exceed one chunk). */
  async readAll(path: string, cap = 4096): Promise<Buffer> {
    const parts: Buffer[] = [];
    let total = 0;
    for (;;) {
      const chunk = await this.readShort(path, this.maxPayload, total);
      if (!chunk.length) break;
      parts.push(chunk);
      total += chunk.length;
      if (chunk.length < this.maxPayload || total >= cap) break;
    }
    return Buffer.concat(parts);
  }

  async readU8(path: string): Promise<number> {
    return (await this.readShort(path, 1)).readUInt8(0);
  }
  async readU32(path: string): Promise<number> {
    return (await this.readShort(path, 4)).readUInt32LE(0);
  }
  async readF32(path: string): Promise<number> {
    return (await this.readShort(path, 4)).readFloatLE(0);
  }
  async readString(path: string, size = 32): Promise<string> {
    const b = await this.readShort(path, size);
    const end = b.indexOf(0);
    return b.subarray(0, end < 0 ? b.length : end).toString("utf8").trim();
  }
  async writeU8(path: string, v: number): Promise<void> {
    await this.writeShort(path, Buffer.from([v & 0xff]));
  }
  async writeF32(path: string, v: number): Promise<void> {
    const b = Buffer.alloc(4);
    b.writeFloatLE(v, 0);
    await this.writeShort(path, b);
  }
}

/**
 * Minimal CBOR decoder: enough for the Peak Pro's profile colour payloads (maps, arrays, text, bytes, ints, floats).
 */
export type CborValue = number | string | boolean | null | undefined | Uint8Array | CborValue[] | { [k: string]: CborValue };

export function decodeCbor(buf: Uint8Array): CborValue {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 0;

  function readLen(ai: number): number {
    if (ai < 24) return ai;
    if (ai === 24) return view.getUint8(pos++);
    if (ai === 25) {
      const v = view.getUint16(pos);
      pos += 2;
      return v;
    }
    if (ai === 26) {
      const v = view.getUint32(pos);
      pos += 4;
      return v;
    }
    if (ai === 27) {
      const v = Number(view.getBigUint64(pos));
      pos += 8;
      return v;
    }
    if (ai === 31) return -1; // indefinite
    throw new Error(`CBOR: bad additional info ${ai}`);
  }

  function item(): CborValue {
    const ib = view.getUint8(pos++);
    const major = ib >> 5;
    const ai = ib & 0x1f;
    switch (major) {
      case 0:
        return readLen(ai);
      case 1:
        return -1 - readLen(ai);
      case 2: {
        const n = readLen(ai);
        if (n < 0) {
          const parts: Uint8Array[] = [];
          while (view.getUint8(pos) !== 0xff) parts.push(item() as Uint8Array);
          pos++;
          const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
          let o = 0;
          for (const p of parts) {
            out.set(p, o);
            o += p.length;
          }
          return out;
        }
        const b = buf.subarray(pos, pos + n);
        pos += n;
        return b;
      }
      case 3: {
        const n = readLen(ai);
        if (n < 0) {
          let s = "";
          while (view.getUint8(pos) !== 0xff) s += item() as string;
          pos++;
          return s;
        }
        const s = new TextDecoder().decode(buf.subarray(pos, pos + n));
        pos += n;
        return s;
      }
      case 4: {
        const n = readLen(ai);
        const arr: CborValue[] = [];
        if (n < 0) {
          while (view.getUint8(pos) !== 0xff) arr.push(item());
          pos++;
        } else for (let i = 0; i < n; i++) arr.push(item());
        return arr;
      }
      case 5: {
        const n = readLen(ai);
        const obj: { [k: string]: CborValue } = {};
        const put = () => {
          const k = item();
          obj[String(k)] = item();
        };
        if (n < 0) {
          while (view.getUint8(pos) !== 0xff) put();
          pos++;
        } else for (let i = 0; i < n; i++) put();
        return obj;
      }
      case 6:
        readLen(ai); // tag: ignore
        return item();
      case 7:
        switch (ai) {
          case 20:
            return false;
          case 21:
            return true;
          case 22:
            return null;
          case 23:
            return undefined;
          case 25: {
            const v = half(view.getUint16(pos));
            pos += 2;
            return v;
          }
          case 26: {
            const v = view.getFloat32(pos);
            pos += 4;
            return v;
          }
          case 27: {
            const v = view.getFloat64(pos);
            pos += 8;
            return v;
          }
          default:
            return readLen(ai);
        }
    }
    throw new Error("CBOR: unreachable");
  }

  function half(h: number): number {
    const exp = (h >> 10) & 0x1f;
    const mant = h & 0x3ff;
    let v: number;
    if (exp === 0) v = mant * 2 ** -24;
    else if (exp !== 31) v = (mant + 1024) * 2 ** (exp - 25);
    else v = mant ? NaN : Infinity;
    return h & 0x8000 ? -v : v;
  }

  return item();
}

/** First RGB colour found in a decoded profile colour document, as "#rrggbb", or null. */
export function firstColor(v: CborValue): string | null {
  if (v instanceof Uint8Array) return v.length >= 3 ? `#${[...v.subarray(0, 3)].map((b) => b.toString(16).padStart(2, "0")).join("")}` : null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const c = firstColor(x);
      if (c) return c;
    }
    return null;
  }
  if (v && typeof v === "object") {
    const o = v as { [k: string]: CborValue };
    if (o.color !== undefined) {
      const c = firstColor(o.color);
      if (c) return c;
    }
    for (const k of Object.keys(o)) {
      const c = firstColor(o[k]);
      if (c) return c;
    }
  }
  return null;
}

// Odczyt archiwów ZIP (także 3MF z Bambu Studio): katalog centralny + rozpakowanie (store / deflate).
// Deflate rozpakowuje DecompressionStream('deflate-raw') — jest w przeglądarkach, WebView2 i Node 18+.

export interface UnzipEntry { name: string; method: number; size: number; csize: number; offset: number }

function u16(b: Uint8Array, o: number) { return b[o] | (b[o + 1] << 8); }
function u32(b: Uint8Array, o: number) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

/** Lista plików w archiwum (bez rozpakowywania). Rzuca błąd, gdy to nie jest ZIP. */
export function zipEntries(buf: Uint8Array): UnzipEntry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (u32(buf, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('to nie jest archiwum ZIP/3MF');
  let n = u16(buf, eocd + 10), cd = u32(buf, eocd + 16);
  // ZIP64 (bardzo duże pliki): katalog centralny opisany w rekordzie ZIP64
  if (cd === 0xffffffff || n === 0xffff) {
    const loc = eocd - 20;
    if (loc >= 0 && u32(buf, loc) === 0x07064b50) {
      const z = Number(new DataView(buf.buffer, buf.byteOffset).getBigUint64(loc + 8, true));
      n = Number(new DataView(buf.buffer, buf.byteOffset).getBigUint64(z + 32, true));
      cd = Number(new DataView(buf.buffer, buf.byteOffset).getBigUint64(z + 48, true));
    }
  }
  const out: UnzipEntry[] = [], dec = new TextDecoder();
  let p = cd;
  for (let k = 0; k < n; k++) {
    if (u32(buf, p) !== 0x02014b50) throw new Error('uszkodzony katalog archiwum');
    const method = u16(buf, p + 10), nl = u16(buf, p + 28), xl = u16(buf, p + 30), cl = u16(buf, p + 32);
    let csize = u32(buf, p + 20), size = u32(buf, p + 24), offset = u32(buf, p + 42);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nl));
    // pola ZIP64 w „extra”
    let x = p + 46 + nl; const xe = x + xl;
    while (x + 4 <= xe) {
      const id = u16(buf, x), len = u16(buf, x + 2);
      if (id === 0x0001) {
        const dv = new DataView(buf.buffer, buf.byteOffset); let q = x + 4;
        if (size === 0xffffffff) { size = Number(dv.getBigUint64(q, true)); q += 8; }
        if (csize === 0xffffffff) { csize = Number(dv.getBigUint64(q, true)); q += 8; }
        if (offset === 0xffffffff) { offset = Number(dv.getBigUint64(q, true)); q += 8; }
      }
      x += 4 + len;
    }
    out.push({ name, method, size, csize, offset });
    p += 46 + nl + xl + cl;
  }
  return out;
}

/** Rozpakowuje jeden plik z archiwum. */
export async function zipRead(buf: Uint8Array, e: UnzipEntry): Promise<Uint8Array> {
  if (u32(buf, e.offset) !== 0x04034b50) throw new Error('uszkodzony plik w archiwum: ' + e.name);
  const start = e.offset + 30 + u16(buf, e.offset + 26) + u16(buf, e.offset + 28), data = buf.subarray(start, start + e.csize);
  if (e.method === 0) return data;
  if (e.method !== 8) throw new Error(`nieobsługiwana kompresja (${e.method}): ${e.name}`);
  const ds = new (globalThis as any).DecompressionStream('deflate-raw');
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

/** Rozpakowuje plik o podanej nazwie (bez względu na wielkość liter) jako tekst albo null. */
export async function zipText(buf: Uint8Array, name: string): Promise<string | null> {
  const e = zipEntries(buf).find(x => x.name.toLowerCase() === name.toLowerCase());
  return e ? new TextDecoder().decode(await zipRead(buf, e)) : null;
}

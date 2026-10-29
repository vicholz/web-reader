/* Web Reader — GPL-3.0-or-later. See LICENSE. */

const EOCD = 0x06054b50;
const ZIP64_EOCD = 0x06064b50;
const ZIP64_LOC = 0x07064b50;
const CENTRAL = 0x02014b50;

function findEocd(bytes) {
  const min = Math.max(0, bytes.length - 22 - 0x10000);
  for (let i = bytes.length - 22; i >= min; i--) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      return i;
    }
  }
  return -1;
}

function read64(view, offset) {
  const lo = view.getUint32(offset, true);
  const hi = view.getUint32(offset + 4, true);
  return hi * 0x100000000 + lo;
}

function zip64Sizes(extra, flags) {
  const out = {};
  let p = 0;
  const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
  while (p + 4 <= extra.length) {
    const id = view.getUint16(p, true);
    const size = view.getUint16(p + 2, true);
    const start = p + 4;
    p = start + size;
    if (id !== 1 || start + size > extra.length) continue;
    let o = start;
    const take = () => {
      const n = read64(view, o);
      o += 8;
      return n;
    };
    if (flags.uncomp) out.uncomp = take();
    if (flags.comp) out.comp = take();
    if (flags.offset) out.offset = take();
    break;
  }
  return out;
}

async function inflateRaw(compressed) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('This browser cannot inflate ZIP entries.');
  }
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Read a ZIP (STORE or DEFLATE, including Zip64) into {name, data} entries.
 * @param {Uint8Array|ArrayBuffer} input
 */
export async function unzip(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 22) throw new Error('This file is not a ZIP archive.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(bytes);
  if (eocd < 0) throw new Error('This file is not a ZIP archive.');

  let count = view.getUint16(eocd + 8, true) || view.getUint16(eocd + 10, true);
  let cdOffset = view.getUint32(eocd + 16, true);

  if (count === 0xffff || cdOffset === 0xffffffff) {
    const loc = eocd - 20;
    if (loc < 0 || view.getUint32(loc, true) !== ZIP64_LOC) {
      throw new Error('This ZIP archive uses Zip64 in a way the reader could not follow.');
    }
    const z64 = read64(view, loc + 8);
    if (view.getUint32(z64, true) !== ZIP64_EOCD) throw new Error('Broken Zip64 directory.');
    count = read64(view, z64 + 32);
    cdOffset = read64(view, z64 + 48);
  }

  const files = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== CENTRAL) {
      throw new Error('This ZIP archive has a broken directory.');
    }
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    let compSize = view.getUint32(p + 20, true);
    let uncompSize = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    let localOffset = view.getUint32(p + 42, true);
    const nameBytes = bytes.subarray(p + 46, p + 46 + nameLen);
    const extra = bytes.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (flags & 1) throw new Error('This archive is password-protected.');
    const big = zip64Sizes(extra, {
      uncomp: uncompSize === 0xffffffff,
      comp: compSize === 0xffffffff,
      offset: localOffset === 0xffffffff,
    });
    if (big.uncomp != null) uncompSize = big.uncomp;
    if (big.comp != null) compSize = big.comp;
    if (big.offset != null) localOffset = big.offset;

    const name = new TextDecoder('utf-8').decode(nameBytes).replaceAll('\\', '/');
    if (!name || name.endsWith('/')) continue;

    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new Error(`Broken ZIP entry: ${name}`);
    }
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = bytes.subarray(dataStart, dataStart + compSize);
    let data;
    if (method === 0) data = compressed;
    else if (method === 8) data = await inflateRaw(compressed);
    else throw new Error(`Unsupported compression in ${name}.`);
    if (uncompSize && data.length !== uncompSize && method === 0) {
      data = compressed.subarray(0, uncompSize);
    }
    files.push({ name: name.replace(/^\/+/, ''), data });
  }
  return files;
}

export function zipMap(entries) {
  const map = new Map();
  for (const entry of entries) map.set(entry.name, entry.data);
  return map;
}

export function zipGet(map, path) {
  if (!path) return null;
  const clean = path.replace(/^\/+/, '');
  if (map.has(clean)) return map.get(clean);
  const lower = clean.toLowerCase();
  for (const [name, data] of map) {
    if (name.toLowerCase() === lower) return data;
  }
  return null;
}

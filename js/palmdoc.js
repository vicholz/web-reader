/* Web Reader — GPL-3.0-or-later. See LICENSE. */

function latin1(bytes) {
  let out = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    out += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return out;
}

export function pdbIdentity(bytes) {
  if (!bytes || bytes.length < 78) return null;
  const type = latin1(bytes.subarray(0x3c, 0x40));
  const creator = latin1(bytes.subarray(0x40, 0x44));
  return { type, creator };
}

export function palmdocDecompress(data) {
  const out = [];
  let i = 0;
  while (i < data.length) {
    const c = data[i++];
    if (c === 0) {
      out.push(0);
    } else if (c <= 8) {
      const end = Math.min(data.length, i + c);
      for (; i < end; i++) out.push(data[i]);
    } else if (c <= 0x7f) {
      out.push(c);
    } else if (c <= 0xbf) {
      if (i >= data.length) break;
      const c2 = data[i++];
      const distance = (((c << 8) | c2) >> 3) & 0x7ff;
      const length = (c2 & 7) + 3;
      if (!distance || distance > out.length) break;
      for (let n = 0; n < length; n++) out.push(out[out.length - distance]);
    } else {
      out.push(0x20);
      out.push(c ^ 0x80);
    }
  }
  return Uint8Array.from(out);
}

function concat(chunks, total) {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Read an uncompressed or PalmDOC-compressed PRC text database.
 * @param {Uint8Array} bytes
 */
export function readPalmDoc(bytes) {
  if (bytes.length < 80) throw new Error('This PRC file is too small to be a book.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const title = latin1(bytes.subarray(0, 32)).replace(/\0.*/, '').trim() || 'Untitled';
  const count = view.getUint16(0x4c, false);
  if (count < 1 || 0x4e + count * 8 > bytes.length) {
    throw new Error('This PRC file is incomplete.');
  }
  const offsets = [];
  for (let i = 0; i < count; i++) offsets.push(view.getUint32(0x4e + i * 8, false));
  offsets.push(bytes.length);
  for (let i = 0; i < count; i++) {
    if (offsets[i] > bytes.length || offsets[i + 1] < offsets[i]) {
      throw new Error('This PRC file has a broken record index.');
    }
  }

  const rec0 = bytes.subarray(offsets[0], offsets[1]);
  if (rec0.length < 16) throw new Error('This PRC file has no PalmDOC header.');
  const head = new DataView(rec0.buffer, rec0.byteOffset, rec0.byteLength);
  const compression = head.getUint16(0, false);
  const textLength = head.getUint32(4, false);
  if (compression === 17480) {
    throw new Error('This PRC uses Huffman compression. Open the MOBI or EPUB edition instead.');
  }
  if (compression !== 1 && compression !== 2) {
    throw new Error('This PRC compression is not supported.');
  }

  const parts = [];
  let total = 0;
  for (let i = 1; i < count; i++) {
    let chunk = bytes.subarray(offsets[i], offsets[i + 1]);
    if (compression === 2) chunk = palmdocDecompress(chunk);
    parts.push(chunk);
    total += chunk.length;
  }
  let text = latin1(concat(parts, total));
  if (textLength > 0 && textLength < text.length) text = text.slice(0, textLength);
  text = text.replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim();
  if (!text) throw new Error('This PRC file has no text.');
  return { title, text };
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function plainTextToHtml(text) {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

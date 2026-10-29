/* Web Reader — GPL-3.0-or-later. See LICENSE. */

import libarchiveFactory from '../vendor/libarchive/libarchive.js';

const FILE_TYPE = 32768;
const DIR_TYPE = 16384;
const MAX_ENTRY = 80 * 1024 * 1024;
const MAX_TOTAL = 1024 * 1024 * 1024;

let modulePromise = null;

function loadModule() {
  if (!modulePromise) {
    const wasmUrl = new URL('../vendor/libarchive/libarchive.wasm', import.meta.url);
    modulePromise = libarchiveFactory({
      locateFile(path) {
        if (String(path).endsWith('.wasm')) return wasmUrl.href;
        return path;
      },
    }).catch((err) => {
      modulePromise = null;
      throw err;
    });
  }
  return modulePromise;
}

function bind(module) {
  const cwrap = module.cwrap.bind(module);
  const errorString = cwrap('archive_error_string', 'string', ['number']);
  const readData = cwrap('archive_read_data', 'number', ['number', 'number', 'number']);
  const skipData = cwrap('archive_read_data_skip', 'number', ['number']);
  return {
    module,
    open: cwrap('archive_read_new_memory', 'number', ['number', 'number', 'string']),
    next: cwrap('archive_read_next_entry', 'number', ['number']),
    pathname: cwrap('archive_entry_pathname_utf8', 'string', ['number']),
    size: cwrap('archive_entry_size', 'number', ['number']),
    filetype: cwrap('archive_entry_filetype', 'number', ['number']),
    encrypted: cwrap('archive_entry_is_encrypted', 'number', ['number']),
    errorString,
    read(archive, ptr, size) {
      const n = readData(archive, ptr, size);
      if (n < 0) throw new Error(errorString(archive) || 'Could not read a file in this archive.');
      return n;
    },
    skip(archive) {
      if (skipData(archive) !== 0) {
        throw new Error(errorString(archive) || 'Could not skip a file in this archive.');
      }
    },
    free: cwrap('archive_read_free', 'number', ['number']),
  };
}

function readEntry(lib, archive, size) {
  const malloc = lib.module._malloc;
  const free = lib.module._free;
  if (size > MAX_ENTRY) throw new Error('A file in this archive is larger than 80 MB.');
  if (size > 0) {
    const ptr = malloc(size);
    try {
      const n = lib.read(archive, ptr, size);
      return lib.module.HEAPU8.slice(ptr, ptr + Math.max(0, n));
    } finally {
      free(ptr);
    }
  }
  const chunkSize = 256 * 1024;
  const ptr = malloc(chunkSize);
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const n = lib.read(archive, ptr, chunkSize);
      if (!n) break;
      if (total + n > MAX_ENTRY) throw new Error('A file in this archive is larger than 80 MB.');
      chunks.push(lib.module.HEAPU8.slice(ptr, ptr + n));
      total += n;
    }
  } finally {
    free(ptr);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Extract files from a RAR or ZIP archive with libarchive.
 * @param {Uint8Array} bytes
 * @returns {Promise<{name: string, data: Uint8Array}[]>}
 */
export async function extractArchive(bytes) {
  const module = await loadModule();
  const lib = bind(module);
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!data.length) throw new Error('This archive is empty.');
  const ptr = lib.module._malloc(data.length);
  lib.module.HEAPU8.set(data, ptr);
  let archive = 0;
  const entries = [];
  let total = 0;
  try {
    archive = lib.open(ptr, data.length, null);
    if (!archive) throw new Error('Could not open this archive.');
    for (;;) {
      const entry = lib.next(archive);
      if (!entry) {
        const message = lib.errorString(archive) || '';
        if (/encrypt|password|passphrase/i.test(message)) {
          throw new Error('This archive is password-protected.');
        }
        if (message && !/end of file/i.test(message)) throw new Error(message);
        break;
      }
      const path = (lib.pathname(entry) || '').replaceAll('\\', '/').replace(/^\/+/, '');
      const filetype = lib.filetype(entry) >>> 0;
      if (lib.encrypted(entry)) throw new Error('This archive is password-protected.');
      const isDir = filetype === DIR_TYPE || path.endsWith('/');
      const isFile = filetype === FILE_TYPE || filetype === 0;
      if (!path || isDir || !isFile) {
        lib.skip(archive);
        continue;
      }
      const size = lib.size(entry);
      const fileBytes = readEntry(lib, archive, size > 0 ? size : 0);
      total += fileBytes.length;
      if (total > MAX_TOTAL) throw new Error('This archive is larger than 1 GB uncompressed.');
      entries.push({ name: path, data: fileBytes });
    }
  } finally {
    if (archive) {
      try {
        lib.free(archive);
      } catch {
        /* discarded either way */
      }
    }
    lib.module._free(ptr);
  }
  return entries;
}

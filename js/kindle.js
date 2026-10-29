/* Web Reader — GPL-3.0-or-later. See LICENSE. */

let worker = null;
let seq = 0;
const pending = new Map();

function workerError(message) {
  for (const job of pending.values()) job.reject(new Error(message));
  pending.clear();
  worker = null;
}

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./convert-worker.js', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event) => {
      const { id, bytes, error } = event.data || {};
      const job = pending.get(id);
      if (!job) return;
      pending.delete(id);
      if (error) job.reject(new Error(friendlyKindleError(error)));
      else job.resolve(new Uint8Array(bytes));
    });
    worker.addEventListener('error', () => {
      workerError('The Kindle converter failed to load. Serve this folder over HTTP.');
    });
  }
  return worker;
}

export function friendlyKindleError(message) {
  const text = String(message || 'Could not read this Kindle book.');
  if (/drm|encrypt|kindle edition|voucher/i.test(text)) {
    return 'This Kindle book is DRM-protected and cannot be opened.';
  }
  return text;
}

/**
 * Convert MOBI, PRC, AZW, or AZW3 bytes to EPUB with the vendored boko engine.
 * @param {Uint8Array} bytes
 * @param {'mobi'|'azw3'} from
 */
export function convertToEpub(bytes, from) {
  const id = ++seq;
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ type: 'convert', id, bytes: copy, from }, [copy]);
  });
}

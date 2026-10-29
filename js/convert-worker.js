/* Web Reader — GPL-3.0-or-later. See LICENSE. */

import initWasm, { convert, init } from '../vendor/boko/boko.js';

let ready = null;

function ensureReady() {
  if (!ready) {
    ready = initWasm()
      .then(() => {
        init();
      })
      .catch((err) => {
        ready = null;
        throw err;
      });
  }
  return ready;
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  if (msg.type !== 'convert') return;
  try {
    await ensureReady();
    const output = convert(new Uint8Array(msg.bytes), msg.from, 'epub');
    const copy = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
    self.postMessage({ id: msg.id, bytes: copy }, [copy]);
  } catch (err) {
    self.postMessage({
      id: msg.id,
      error: err && err.message ? err.message : String(err),
    });
  }
};

import { readFileSync, writeFileSync } from 'node:fs';
import { unzip } from '../js/zip.js';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initSync, convert, init } from '../vendor/boko/boko.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const python = spawnSync('python3', [join(root, 'scripts/make-book.py')], { stdio: 'inherit' });
if (python.status) process.exit(python.status);

const wasm = readFileSync(join(root, 'vendor/boko/boko_bg.wasm'));
initSync(wasm);
init();

const epub = new Uint8Array(readFileSync(join(root, 'samples/lantern-room.epub')));
const mobi = new Uint8Array(readFileSync(join(root, 'samples/lantern-room.mobi')));
const azw3 = convert(epub, 'epub', 'azw3');
writeFileSync(join(root, 'samples/lantern-room.azw'), mobi);
writeFileSync(join(root, 'samples/lantern-room.prc'), mobi);
writeFileSync(join(root, 'samples/lantern-room.azw3'), azw3);

async function textOf(bytes) {
  const entries = await unzip(bytes);
  return entries.map((entry) => Buffer.from(entry.data).toString('utf8')).join('\n');
}
const mobiText = await textOf(convert(mobi, 'mobi', 'epub'));
const azw3Text = await textOf(convert(azw3, 'azw3', 'epub'));
if (!/lantern was still warm/i.test(mobiText) || !/Second Shelf/i.test(mobiText)) {
  console.error('MOBI import did not contain the book text.');
  process.exit(1);
}
if (!/lantern/i.test(azw3Text)) {
  console.error('AZW3 round-trip did not contain the book text.');
  process.exit(1);
}
console.log(`mobi ${mobi.length} bytes, azw3 ${azw3.length} bytes, import ok`);

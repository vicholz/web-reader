import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzip } from '../js/zip.js';
import { readPalmDoc, palmdocDecompress } from '../js/palmdoc.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const epub = new Uint8Array(readFileSync(join(root, 'samples/lantern-room.epub')));
const entries = await unzip(epub);
const names = entries.map((entry) => entry.name);
if (!names.includes('mimetype')) throw new Error('missing mimetype');
if (!names.some((name) => name.endsWith('chap2.xhtml'))) throw new Error('missing chapter');
const chapter = Buffer.from(entries.find((entry) => entry.name.endsWith('chap1.xhtml')).data).toString('utf8');
if (!chapter.includes('The lantern was still warm')) throw new Error('chapter text missing');

const note = readPalmDoc(new Uint8Array(readFileSync(join(root, 'samples/pocket-note.prc'))));
if (!note.text.includes('pocket note survived')) throw new Error(`unexpected palmdoc text: ${note.text}`);
if (note.title !== 'Pocket Note') throw new Error(note.title);

const compressed = palmdocDecompress(Uint8Array.from([0x48, 0x69, 0xc0 | 0x21]));
const text = Buffer.from(compressed).toString('latin1');
if (!text.startsWith('Hi')) throw new Error(text);

const cbz = await unzip(new Uint8Array(readFileSync(join(root, 'samples/paper-boats.cbz'))));
const pages = cbz.filter((entry) => entry.name.endsWith('.png'));
if (pages.length !== 4) throw new Error(`expected 4 comic pages, got ${pages.length}`);
console.log('self-check ok', names.length, 'epub entries');

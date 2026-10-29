/* Web Reader — GPL-3.0-or-later. See LICENSE. */

import { parseEpub } from './epub.js';
import { parseComic } from './comic.js';
import { pdbIdentity, plainTextToHtml, readPalmDoc } from './palmdoc.js';
import { convertToEpub, friendlyKindleError } from './kindle.js';
import { getDerived, putDerived } from './storage.js';

export const FORMATS = ['epub', 'mobi', 'prc', 'azw', 'azw3', 'cbz', 'cbr'];

export function extensionOf(name) {
  const parts = String(name || '').toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

export function formatOf(name) {
  const ext = extensionOf(name);
  return FORMATS.includes(ext) ? ext : '';
}

function kindleFormat(ext, bytes) {
  if (ext === 'azw3') return 'azw3';
  if (ext === 'mobi' || ext === 'azw') return 'mobi';
  if (ext === 'prc') {
    const id = pdbIdentity(bytes);
    if (id && id.type === 'TEXt' && id.creator === 'REAd') return '';
    return 'mobi';
  }
  return '';
}

function bookFromEpub(parsed, format) {
  return {
    format,
    kind: 'text',
    title: parsed.title,
    author: parsed.author,
    language: parsed.language,
    coverBlob: parsed.coverBlob,
    chapters: parsed.chapters,
    toc: parsed.toc,
    pages: [],
    summary: '',
    revoke() {
      for (const url of parsed.urls) URL.revokeObjectURL(url);
    },
  };
}

/**
 * Turn file bytes into a book model the pager can render.
 * @param {Uint8Array} bytes
 * @param {string} filename
 * @param {{id?: string, onStatus?: (message: string) => void}} [options]
 */
export async function openBook(bytes, filename, options = {}) {
  const format = formatOf(filename);
  if (!format) {
    throw new Error('Use an EPUB, MOBI, PRC, AZW, AZW3, CBZ, or CBR file.');
  }
  const onStatus = options.onStatus || (() => {});

  if (format === 'cbz' || format === 'cbr') {
    onStatus('Reading comic…');
    const comic = await parseComic(bytes, format, filename);
    return {
      format,
      kind: 'comic',
      title: comic.title,
      author: comic.author,
      language: 'en',
      coverBlob: comic.coverBlob,
      chapters: [],
      toc: comic.pages.map((page, index) => ({ title: page.title, chapterIndex: index, fragment: '' })),
      pages: comic.pages,
      summary: comic.summary,
      revoke() {
        for (const url of comic.urls) URL.revokeObjectURL(url);
      },
    };
  }

  if (format === 'prc') {
    const id = pdbIdentity(bytes);
    if (id && id.type === 'TEXt' && id.creator === 'REAd') {
      onStatus('Reading PalmDOC…');
      const note = readPalmDoc(bytes);
      return {
        format,
        kind: 'text',
        title: note.title,
        author: '',
        language: 'en',
        coverBlob: null,
        chapters: [{ href: 'note', title: note.title, html: plainTextToHtml(note.text) }],
        toc: [{ title: note.title, chapterIndex: 0, fragment: '' }],
        pages: [],
        summary: '',
        revoke() {},
      };
    }
  }

  let epubBytes = bytes;
  if (format !== 'epub') {
    const from = kindleFormat(format, bytes);
    if (!from) throw new Error('This PRC file is not a MOBI or PalmDOC book.');
    if (options.id) {
      const cached = await getDerived(options.id);
      if (cached) epubBytes = cached;
    }
    if (epubBytes === bytes) {
      onStatus(`Converting ${format.toUpperCase()}…`);
      try {
        epubBytes = await convertToEpub(bytes, from);
      } catch (err) {
        if (format === 'prc' || format === 'mobi') {
          try {
            const note = readPalmDoc(bytes);
            return {
              format,
              kind: 'text',
              title: note.title,
              author: '',
              language: 'en',
              coverBlob: null,
              chapters: [{ href: 'note', title: note.title, html: plainTextToHtml(note.text) }],
              toc: [{ title: note.title, chapterIndex: 0, fragment: '' }],
              pages: [],
              summary: '',
              revoke() {},
            };
          } catch {
            /* fall through to the converter error */
          }
        }
        throw new Error(friendlyKindleError(err.message));
      }
      if (options.id) {
        try {
          await putDerived(options.id, epubBytes);
        } catch {
          /* the original file is still saved */
        }
      }
    }
  }

  onStatus('Reading book…');
  const parsed = await parseEpub(epubBytes);
  return bookFromEpub(parsed, format);
}

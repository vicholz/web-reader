/* Web Reader — GPL-3.0-or-later. See LICENSE. */

import { unzip } from './zip.js';
import { extractArchive } from './archive.js';

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif']);

function baseName(path) {
  const parts = String(path).split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function hidden(path) {
  return path.split('/').filter(Boolean).some((part) => part.startsWith('.') || part === '__MACOSX');
}

function extension(path) {
  const base = baseName(path).toLowerCase();
  return base.includes('.') ? base.split('.').pop() : '';
}

function sniff(bytes) {
  if (!bytes || bytes.length < 12) return '';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45) return 'image/webp';
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp';
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 64)));
  if (head.includes('ftypavif') || head.includes('ftypavis')) return 'image/avif';
  return '';
}

function mimeFromExt(ext) {
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'bmp') return 'image/bmp';
  if (ext === 'avif') return 'image/avif';
  return '';
}

function decodeText(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  return new TextDecoder('utf-8').decode(bytes);
}

function tagText(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!match) return '';
  return match[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseComicInfo(bytes) {
  const xml = decodeText(bytes);
  const authors = [];
  for (const tag of ['Writer', 'Penciller', 'Inker', 'Colorist', 'Letterer']) {
    const value = tagText(xml, tag);
    if (value && !authors.includes(value)) authors.push(value);
  }
  return {
    title: tagText(xml, 'Title'),
    series: tagText(xml, 'Series'),
    number: tagText(xml, 'Number'),
    summary: tagText(xml, 'Summary'),
    authors,
  };
}

function comicTitle(meta, fallback) {
  const series = meta.series;
  const number = meta.number ? meta.number.replace(/^#/, '') : '';
  if (series && number) {
    if (meta.title && meta.title.toLowerCase() !== series.toLowerCase()) return `${series} #${number}: ${meta.title}`;
    return `${series} #${number}`;
  }
  return meta.title || series || fallback;
}

function natural(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

async function entriesOf(bytes, format) {
  if (format === 'cbr') {
    try {
      return await extractArchive(bytes);
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      if (/password|encrypt/i.test(message)) throw new Error('This comic is password-protected.');
      throw new Error('Could not read this CBR archive.');
    }
  }
  try {
    return await unzip(bytes);
  } catch (err) {
    try {
      return await extractArchive(bytes);
    } catch {
      throw err;
    }
  }
}

/**
 * Read a CBZ or CBR comic into ordered page blobs.
 * @param {Uint8Array} bytes
 * @param {'cbz'|'cbr'} format
 * @param {string} filename
 */
export async function parseComic(bytes, format, filename) {
  const entries = await entriesOf(bytes, format);
  let meta = { title: '', series: '', number: '', summary: '', authors: [] };
  const images = [];
  for (const entry of entries) {
    const path = entry.name || '';
    if (!path || hidden(path)) continue;
    if (baseName(path).toLowerCase() === 'comicinfo.xml') {
      try {
        meta = parseComicInfo(entry.data);
      } catch {
        /* metadata is optional */
      }
      continue;
    }
    const ext = extension(path);
    if (ext && !IMAGE_EXT.has(ext) && ext !== 'xml') continue;
    const type = sniff(entry.data) || mimeFromExt(ext);
    if (!type) continue;
    images.push({ path, data: entry.data, type });
  }
  images.sort((a, b) => natural(a.path, b.path));
  if (!images.length) throw new Error('This comic has no readable images.');
  if (images.length > 2000) throw new Error('This comic has more than 2000 pages.');

  const urls = [];
  const pages = images.map((image, index) => {
    const blob = new Blob([image.data], { type: image.type });
    const url = URL.createObjectURL(blob);
    urls.push(url);
    return {
      title: index === 0 ? 'Cover' : `Page ${index + 1}`,
      url,
      blob,
      type: image.type,
    };
  });
  const fallback = filename.replace(/\.[^/.]+$/, '').replace(/[_]+/g, ' ').trim() || 'Comic';
  return {
    title: comicTitle(meta, fallback),
    author: (meta.authors || []).join(', '),
    summary: meta.summary || '',
    coverBlob: pages[0].blob,
    pages,
    urls,
  };
}

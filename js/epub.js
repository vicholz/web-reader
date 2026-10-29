/* Web Reader — GPL-3.0-or-later. See LICENSE. */

import { unzip, zipGet, zipMap } from './zip.js';

const XML = 'application/xml';

function textOf(bytes) {
  if (!bytes) return '';
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes);
  }
  let start = 0;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3;
  return new TextDecoder('utf-8').decode(bytes.subarray(start));
}

function parseXml(bytes) {
  const doc = new DOMParser().parseFromString(textOf(bytes), XML);
  if (doc.querySelector('parsererror')) throw new Error('This EPUB has unreadable XML.');
  return doc;
}

function els(root, name) {
  return root ? [...root.getElementsByTagNameNS('*', name)] : [];
}

function attr(el, name) {
  if (!el) return '';
  return el.getAttribute(name) || el.getAttributeNS('*', name) || '';
}

export function resolvePath(baseDir, rel) {
  if (!rel) return '';
  let path = String(rel).trim().replaceAll('\\', '/');
  try {
    path = decodeURIComponent(path);
  } catch {
    /* keep the raw path */
  }
  path = path.split('#')[0].split('?')[0];
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return '';
  const parts = path.startsWith('/') ? [] : String(baseDir || '').split('/').filter(Boolean);
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

function dirname(path) {
  const parts = String(path || '').split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

function mimeFor(name, bytes) {
  const ext = String(name).split('.').pop().toLowerCase();
  const known = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    avif: 'image/avif',
  };
  if (known[ext]) return known[ext];
  if (bytes && bytes.length >= 8) {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
    if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
  }
  return 'application/octet-stream';
}

function blobUrl(bytes, type, urls) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  urls.push(url);
  return url;
}

function sanitize(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, link, iframe, object, embed, meta, base, form, input, button, textarea, select, noscript').forEach((node) => {
    node.remove();
  });
  doc.querySelectorAll('*').forEach((el) => {
    for (const attribute of [...el.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value || '';
      if (name.startsWith('on') || name === 'srcset' || name === 'formaction') el.removeAttribute(attribute.name);
      if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(value)) el.removeAttribute(attribute.name);
      if (name === 'style' && /url\s*\(|expression\s*\(|javascript:/i.test(value)) el.removeAttribute(attribute.name);
    }
  });
  return doc;
}

function rewriteImages(doc, baseDir, files, urls) {
  const nodes = [
    ...doc.querySelectorAll('img'),
    ...doc.querySelectorAll('image'),
  ];
  for (const el of nodes) {
    const raw = el.getAttribute('src') || el.getAttribute('href') || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) continue;
    const path = resolvePath(baseDir, raw);
    const data = zipGet(files, path);
    if (!data) {
      el.removeAttribute('src');
      continue;
    }
    const url = blobUrl(data, mimeFor(path, data), urls);
    if (el.tagName.toLowerCase() === 'img') el.setAttribute('src', url);
    else {
      el.setAttribute('href', url);
      el.setAttributeNS('http://www.w3.org/1999/xlink', 'href', url);
    }
  }
}

function innerTitle(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const heading = doc.querySelector('h1, h2, h3');
  return heading ? heading.textContent.replace(/\s+/g, ' ').trim() : '';
}

function tocFromNav(navDoc, navDir, spinePaths) {
  const nav = [...navDoc.getElementsByTagNameNS('*', 'nav')].find((node) => {
    const type = `${attr(node, 'epub:type')} ${attr(node, 'type')}`.toLowerCase();
    return type.includes('toc') || node.id === 'toc';
  }) || navDoc.getElementsByTagNameNS('*', 'nav')[0];
  if (!nav) return [];
  const items = [];
  for (const link of nav.getElementsByTagNameNS('*', 'a')) {
    const href = link.getAttribute('href') || '';
    const title = link.textContent.replace(/\s+/g, ' ').trim();
    if (!href || !title) continue;
    const hash = href.includes('#') ? decodeHash(href.split('#').slice(1).join('#')) : '';
    const full = resolvePath(navDir, href);
    const chapterIndex = spinePaths.findIndex((item) => item === full);
    if (chapterIndex < 0 && !hash) continue;
    items.push({ title, chapterIndex: Math.max(0, chapterIndex), fragment: hash });
  }
  return items;
}

function decodeHash(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function tocFromNcx(ncxDoc, ncxDir, spinePaths) {
  const items = [];
  for (const point of ncxDoc.getElementsByTagNameNS('*', 'navPoint')) {
    const label = els(point, 'text')[0];
    const content = els(point, 'content')[0];
    const title = label ? label.textContent.replace(/\s+/g, ' ').trim() : '';
    const href = content ? attr(content, 'src') : '';
    if (!title || !href) continue;
    const hash = href.includes('#') ? decodeHash(href.split('#').slice(1).join('#')) : '';
    const full = resolvePath(ncxDir, href);
    const chapterIndex = spinePaths.findIndex((item) => item === full);
    if (chapterIndex < 0) continue;
    items.push({ title, chapterIndex, fragment: hash });
  }
  return items;
}

/**
 * Parse an EPUB into chapters, a table of contents, and a cover blob.
 * @param {Uint8Array|ArrayBuffer} input
 */
export async function parseEpub(input) {
  const entries = await unzip(input);
  const files = zipMap(entries);
  const urls = [];
  const container = zipGet(files, 'META-INF/container.xml');
  if (!container) throw new Error('This EPUB is missing META-INF/container.xml.');
  const containerDoc = parseXml(container);
  const root = els(containerDoc, 'rootfile')[0];
  const opfPath = attr(root, 'full-path');
  if (!opfPath) throw new Error('This EPUB does not point at a package file.');
  const opfBytes = zipGet(files, opfPath);
  if (!opfBytes) throw new Error('This EPUB package file is missing.');
  const opfDir = dirname(opfPath);
  const opf = parseXml(opfBytes);

  const title = (els(opf, 'title')[0]?.textContent || '').replace(/\s+/g, ' ').trim();
  const authors = els(opf, 'creator')
    .map((node) => node.textContent.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const language = (els(opf, 'language')[0]?.textContent || '').trim();

  const manifest = new Map();
  for (const item of els(opf, 'item')) {
    const id = attr(item, 'id');
    const href = attr(item, 'href');
    if (!id || !href) continue;
    manifest.set(id, {
      href,
      path: resolvePath(opfDir, href),
      type: (attr(item, 'media-type') || '').toLowerCase(),
      props: (attr(item, 'properties') || '').toLowerCase(),
    });
  }

  const spine = [];
  for (const itemref of els(opf, 'itemref')) {
    const idref = attr(itemref, 'idref');
    const item = manifest.get(idref);
    if (!item) continue;
    if ((attr(itemref, 'linear') || 'yes').toLowerCase() === 'no' && item.props.includes('nav')) continue;
    spine.push(item);
  }
  if (!spine.length) throw new Error('This EPUB has no chapters.');

  let coverBlob = null;
  const coverMeta = [...els(opf, 'meta')].find((node) => attr(node, 'name') === 'cover');
  const coverId = coverMeta ? attr(coverMeta, 'content') : '';
  const coverItem =
    (coverId && manifest.get(coverId)) ||
    [...manifest.values()].find((item) => item.props.includes('cover-image'));
  if (coverItem) {
    const data = zipGet(files, coverItem.path);
    if (data) coverBlob = new Blob([data], { type: mimeFor(coverItem.path, data) });
  }

  const chapters = [];
  for (const item of spine) {
    const data = zipGet(files, item.path);
    if (!data) continue;
    const base = dirname(item.path);
    let html = '';
    if (item.type.startsWith('image/') || /^(png|jpe?g|gif|webp|svg)$/i.test(item.path.split('.').pop())) {
      const url = blobUrl(data, item.type || mimeFor(item.path, data), urls);
      html = `<p><img alt="" src="${url}"></p>`;
      if (!coverBlob) coverBlob = new Blob([data], { type: item.type || mimeFor(item.path, data) });
    } else {
      const doc = sanitize(textOf(data));
      rewriteImages(doc, base, files, urls);
      html = doc.body.innerHTML.trim();
    }
    if (!html) continue;
    chapters.push({
      href: item.path,
      html,
      title: '',
    });
  }
  if (!chapters.length) throw new Error('This EPUB has no readable chapters.');

  const spinePaths = chapters.map((chapter) => chapter.href);
  let toc = [];
  const navItem = [...manifest.values()].find((item) => item.props.includes('nav'));
  if (navItem) {
    const navBytes = zipGet(files, navItem.path);
    if (navBytes) toc = tocFromNav(parseXml(navBytes), dirname(navItem.path), spinePaths);
  }
  if (!toc.length) {
    const ncxItem = [...manifest.values()].find((item) => item.type.includes('dtbncx') || item.href.endsWith('.ncx'));
    if (ncxItem) {
      const ncxBytes = zipGet(files, ncxItem.path);
      if (ncxBytes) toc = tocFromNcx(parseXml(ncxBytes), dirname(ncxItem.path), spinePaths);
    }
  }

  chapters.forEach((chapter, index) => {
    const fromToc = toc.find((item) => item.chapterIndex === index && !item.fragment);
    chapter.title = fromToc?.title || innerTitle(chapter.html) || `Chapter ${index + 1}`;
  });
  const covered = new Set(toc.filter((item) => !item.fragment).map((item) => item.chapterIndex));
  chapters.forEach((chapter, index) => {
    if (!covered.has(index)) toc.push({ title: chapter.title, chapterIndex: index, fragment: '' });
  });
  if (!toc.length) {
    toc = chapters.map((chapter, index) => ({ title: chapter.title, chapterIndex: index, fragment: '' }));
  }

  return {
    title: title || chapters[0].title || 'Untitled',
    author: authors.join(', '),
    language: language || 'en',
    coverBlob,
    chapters,
    toc,
    urls,
  };
}

/* Web Reader — GPL-3.0-or-later. See LICENSE. */

import { createPager } from './pages.js';
import { formatOf, openBook } from './open.js';
import { clampFont, deleteBook, listBooks, loadSettings, saveBook, saveSettings, sha256, getFile } from './storage.js';
import { generatedCover, thumbnail } from './cover.js';

const TEXT_SAMPLES = [
  ['lantern-room.epub', 'EPUB'],
  ['lantern-room.mobi', 'MOBI'],
  ['lantern-room.prc', 'PRC'],
  ['lantern-room.azw', 'AZW'],
  ['lantern-room.azw3', 'AZW3'],
];
const COMIC_SAMPLES = [
  ['paper-boats.cbz', 'CBZ'],
  ['paper-boats.cbr', 'CBR'],
];
const NOTE_SAMPLES = [['pocket-note.prc', 'PRC']];

const libraryView = document.getElementById('library-view');
const readerView = document.getElementById('reader-view');
const fileInput = document.getElementById('file-input');
const grid = document.getElementById('library-grid');
const emptyNote = document.getElementById('library-empty');
const banner = document.getElementById('banner');
const stage = document.getElementById('stage');
const bookTitle = document.getElementById('book-title');
const bookFormat = document.getElementById('book-format');
const pageLabel = document.getElementById('page-label');
const progressBar = document.getElementById('progress-bar');
const ribbon = document.getElementById('ribbon');
const statusEl = document.getElementById('status');
const statusText = document.getElementById('status-text');
const toastEl = document.getElementById('toast');
const panel = document.getElementById('panel');
const panes = {
  contents: document.getElementById('pane-contents'),
  search: document.getElementById('pane-search'),
  bookmarks: document.getElementById('pane-bookmarks'),
};
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

const buttons = {
  back: document.getElementById('btn-back'),
  fontDec: document.getElementById('btn-font-dec'),
  fontInc: document.getElementById('btn-font-inc'),
  theme: document.getElementById('btn-theme'),
  spread: document.getElementById('btn-spread'),
  bookmark: document.getElementById('btn-bookmark'),
  panel: document.getElementById('btn-panel'),
  panelClose: document.getElementById('panel-close'),
  libraryTheme: document.getElementById('library-theme'),
};

let settings = loadSettings();
let current = null;
let pageState = { page: 0, pageCount: 1, spread: 1, bid: '', text: '', chapterPage: [] };
let toastTimer = 0;
let saveTimer = 0;
let thumbUrls = [];
let panelTab = 'contents';

const pager = createPager(stage, (state) => {
  pageState = state;
  paintChrome(state);
  scheduleSave();
});

function frame() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function resolvedSpread() {
  if (settings.spread === '1') return 1;
  if (settings.spread === '2') return 2;
  const w = window.innerWidth;
  const h = window.innerHeight;
  return w >= 900 && w > h ? 2 : 1;
}

function syncShell() {
  const overlay = window.innerWidth < 820;
  const spread = resolvedSpread();
  readerView.classList.toggle('overlay-chrome', overlay);
  readerView.classList.toggle('single', spread === 1);
  readerView.classList.toggle('spread', spread === 2);
  updateSpreadButton(spread);
  buttons.theme.textContent = settings.theme === 'dark' ? 'Light' : 'Dark';
  buttons.libraryTheme.textContent = settings.theme === 'dark' ? 'Light theme' : 'Dark theme';
}

function updateSpreadButton(spread) {
  const label = settings.spread === 'auto' ? `Auto ${spread}` : spread === 1 ? '1 page' : '2 pages';
  buttons.spread.textContent = settings.spread === 'auto' ? 'Auto' : String(spread);
  buttons.spread.setAttribute('aria-label', `Page layout: ${label}. Activate to change.`);
}

function applyTheme(theme) {
  settings.theme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = settings.theme;
  saveSettings(settings);
  syncShell();
}

function showBanner(message) {
  if (!message) {
    banner.hidden = true;
    banner.textContent = '';
    return;
  }
  banner.hidden = false;
  banner.textContent = message;
}

function setStatus(message) {
  statusText.textContent = message || 'Opening…';
  statusEl.hidden = false;
}

function clearStatus() {
  statusEl.hidden = true;
}

function toast(message) {
  toastEl.hidden = false;
  toastEl.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.hidden = true;
  }, 1600);
}

function progressFor(id) {
  return settings.books[id] || { page: 0, pageCount: 0, bid: '', bookmarks: [] };
}

function bookmarks() {
  if (!current) return [];
  return progressFor(current.meta.id).bookmarks || [];
}

function paintChrome(state) {
  const end = Math.min(state.pageCount, state.page + state.spread);
  const start = state.page + 1;
  pageLabel.textContent = end > start ? `${start}–${end} / ${state.pageCount}` : `${start} / ${state.pageCount}`;
  const pct = state.pageCount ? (end / state.pageCount) * 100 : 0;
  progressBar.style.width = `${pct}%`;
  const marked = bookmarks().some((item) => item.bid === state.bid);
  buttons.bookmark.setAttribute('aria-pressed', marked ? 'true' : 'false');
  readerView.dataset.marks = String(bookmarks().length);
  ribbon.hidden = !marked;
  readerView.dataset.page = String(state.page);
  readerView.dataset.pages = String(state.pageCount);
  readerView.dataset.spread = String(state.spread);
  if (panelTab === 'bookmarks' && !panel.hidden) renderBookmarks();
  if (panelTab === 'contents' && !panel.hidden) renderContents();
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(persistProgress, 200);
}

function persistProgress() {
  if (!current) return;
  const prev = progressFor(current.meta.id);
  settings.books[current.meta.id] = {
    page: pageState.page,
    pageCount: pageState.pageCount,
    bid: pageState.bid || '',
    bookmarks: prev.bookmarks || [],
    updatedAt: Date.now(),
  };
  saveSettings(settings);
}

function formatBytes(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

async function renderLibrary() {
  const books = await listBooks();
  for (const url of thumbUrls) URL.revokeObjectURL(url);
  thumbUrls = [];
  grid.replaceChildren();
  emptyNote.hidden = books.length > 0;
  for (const meta of books) {
    const card = document.createElement('article');
    card.className = 'card';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'card-open';
    const img = document.createElement('img');
    img.className = 'cover';
    img.alt = '';
    if (meta.thumb) {
      const url = URL.createObjectURL(meta.thumb);
      thumbUrls.push(url);
      img.src = url;
    }
    const title = document.createElement('span');
    title.className = 'card-title';
    title.textContent = meta.title || meta.filename;
    const info = document.createElement('p');
    info.className = 'card-meta';
    const progress = progressFor(meta.id);
    const where = progress.pageCount
      ? `Page ${progress.page + 1} of ${progress.pageCount}`
      : 'Not started';
    const bits = [String(meta.format || '').toUpperCase(), where];
    if (meta.author) bits.push(meta.author);
    bits.push(formatBytes(meta.size || 0));
    info.textContent = bits.join(' · ');
    open.append(img, title, info);
    open.addEventListener('click', () => {
      openStored(meta.id).catch((err) => {
        clearStatus();
        showBanner(err.message || 'Could not open that book.');
      });
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'card-remove';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      if (remove.dataset.arm === '1') {
        removeBook(meta.id).catch((err) => showBanner(err.message));
        return;
      }
      remove.dataset.arm = '1';
      remove.textContent = 'Confirm remove';
      window.setTimeout(() => {
        if (remove.isConnected) {
          remove.dataset.arm = '';
          remove.textContent = 'Remove';
        }
      }, 2500);
    });
    card.append(open, remove);
    grid.append(card);
  }
}

async function removeBook(id) {
  await deleteBook(id);
  delete settings.books[id];
  saveSettings(settings);
  await renderLibrary();
}

async function showReader(book, meta) {
  if (current?.book && current.book !== book) current.book.revoke();
  current = { book, meta };
  closePanel();
  bookTitle.textContent = book.title || meta.title || 'Untitled';
  bookFormat.textContent = (book.format || meta.format || '').toUpperCase();
  readerView.dataset.format = book.format || '';
  readerView.dataset.title = book.title || '';
  libraryView.hidden = true;
  readerView.hidden = false;
  showBanner('');
  syncShell();
  await frame();
  await pager.load(book, { fontSize: settings.fontSize, spread: resolvedSpread() }, progressFor(meta.id));
  clearStatus();
}

async function openStored(id) {
  const books = await listBooks();
  const meta = books.find((item) => item.id === id);
  const bytes = await getFile(id);
  if (!meta || !bytes) throw new Error('That book is no longer stored in this browser.');
  setStatus(`Opening ${meta.title || meta.filename}…`);
  const book = await openBook(bytes, meta.filename || `book.${meta.format}`, {
    id,
    onStatus: setStatus,
  });
  if (book.title && book.title !== meta.title) {
    meta.title = book.title;
    meta.author = book.author || meta.author;
  }
  await showReader(book, meta);
}

async function ingestOne(file) {
  const format = formatOf(file.name);
  if (!format) throw new Error(`${file.name} is not an EPUB, MOBI, PRC, AZW, AZW3, CBZ, or CBR file.`);
  setStatus(`Opening ${file.name}…`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = await sha256(bytes);
  const book = await openBook(bytes, file.name, { id, onStatus: setStatus });
  const thumb = book.coverBlob ? await thumbnail(book.coverBlob) : await generatedCover(book.title, book.author);
  const meta = {
    id,
    filename: file.name,
    format,
    title: book.title || file.name,
    author: book.author || '',
    addedAt: Date.now(),
    size: bytes.byteLength,
    thumb,
  };
  try {
    await saveBook(meta, bytes);
  } catch {
    showBanner('The book opened, but this browser refused to store a copy of it.');
  }
  return { book, meta };
}

async function ingestList(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  showBanner('');
  const opened = [];
  const errors = [];
  for (const file of files) {
    try {
      opened.push(await ingestOne(file));
    } catch (err) {
      errors.push(`${file.name}: ${err.message || 'Could not open this file.'}`);
    }
  }
  clearStatus();
  if (errors.length) showBanner(errors.join(' '));
  if (!opened.length) {
    await renderLibrary();
    return;
  }
  for (const extra of opened.slice(1)) extra.book.revoke();
  await showReader(opened[0].book, opened[0].meta);
}

function closeReader() {
  persistProgress();
  closePanel();
  if (current?.book) current.book.revoke();
  current = null;
  pager.destroy();
  readerView.hidden = true;
  libraryView.hidden = false;
  clearStatus();
  renderLibrary().catch(() => {});
}

function toggleChrome() {
  readerView.classList.toggle('chrome-off');
}

function readingOptions() {
  return { fontSize: settings.fontSize, spread: resolvedSpread() };
}

async function relayout() {
  if (readerView.hidden || !current) return;
  syncShell();
  await frame();
  const anchor = { bid: pageState.bid, page: pageState.page };
  await pager.relayout(readingOptions(), anchor);
}

function toggleBookmark() {
  if (!current) return;
  const state = pager.snapshot();
  if (!state.bid) return;
  const record = progressFor(current.meta.id);
  const list = record.bookmarks || [];
  const index = list.findIndex((item) => item.bid === state.bid);
  if (index >= 0) {
    list.splice(index, 1);
    toast('Bookmark removed');
  } else {
    const label = state.text.replace(/\s+/g, ' ').trim().slice(0, 90) || `Page ${state.page + 1}`;
    list.push({ bid: state.bid, label, createdAt: Date.now() });
    toast('Bookmarked');
  }
  settings.books[current.meta.id] = {
    ...record,
    page: state.page,
    pageCount: state.pageCount,
    bid: state.bid,
    bookmarks: list,
    updatedAt: Date.now(),
  };
  saveSettings(settings);
  paintChrome(state);
}

function setTab(name) {
  panelTab = name;
  for (const key of Object.keys(panes)) {
    const selected = key === name;
    panes[key].hidden = !selected;
    document.getElementById(`tab-${key}`).setAttribute('aria-selected', selected ? 'true' : 'false');
  }
  if (name === 'contents') renderContents();
  if (name === 'bookmarks') renderBookmarks();
  if (name === 'search') searchInput.focus();
}

function openPanel() {
  panel.hidden = false;
  buttons.panel.setAttribute('aria-expanded', 'true');
  setTab(panelTab || 'contents');
}

function closePanel() {
  panel.hidden = true;
  buttons.panel.setAttribute('aria-expanded', 'false');
  pager.clearMarks();
}

function togglePanel() {
  if (panel.hidden) openPanel();
  else closePanel();
}

function renderContents() {
  panes.contents.replaceChildren();
  if (!current) return;
  const toc = current.book.toc.length
    ? current.book.toc
    : current.book.chapters.map((chapter, index) => ({ title: chapter.title, chapterIndex: index, fragment: '' }));
  if (!toc.length) {
    panes.contents.textContent = 'No chapters in this book.';
    return;
  }
  for (const item of toc) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'row';
    const label = document.createElement('strong');
    label.textContent = item.title;
    const pageNo = current.book.kind === 'comic'
      ? item.chapterIndex
      : pageState.chapterPage?.[item.chapterIndex];
    const meta = document.createElement('span');
    meta.textContent = pageNo == null ? '' : String(pageNo + 1);
    row.append(label, meta);
    row.addEventListener('click', () => {
      pager.goToTarget(item);
      closePanel();
    });
    panes.contents.append(row);
  }
}

function renderBookmarks() {
  panes.bookmarks.replaceChildren();
  const list = bookmarks();
  if (!list.length) {
    panes.bookmarks.textContent = 'No bookmarks yet. Press the down arrow to mark this page.';
    return;
  }
  for (const item of list) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'row';
    const label = document.createElement('span');
    const found = pager.pageForBid(item.bid);
    const strong = document.createElement('strong');
    strong.textContent = found == null ? 'Bookmark' : `Page ${found + 1}`;
    const snippet = document.createElement('span');
    snippet.className = 'snippet';
    snippet.textContent = item.label || '';
    label.append(strong, snippet);
    const remove = document.createElement('span');
    remove.textContent = 'Remove';
    row.append(label, remove);
    row.addEventListener('click', () => {
      if (found == null) return;
      pager.goToPage(found);
      closePanel();
    });
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      const record = progressFor(current.meta.id);
      record.bookmarks = (record.bookmarks || []).filter((mark) => mark.bid !== item.bid);
      settings.books[current.meta.id] = record;
      saveSettings(settings);
      paintChrome(pager.snapshot());
      renderBookmarks();
    });
    panes.bookmarks.append(row);
  }
}

function renderSearch(query) {
  searchResults.replaceChildren();
  const results = pager.search(query);
  if (query.trim().length < 2) {
    searchResults.textContent = 'Type at least two letters.';
    return;
  }
  if (!results.length) {
    searchResults.textContent = current?.book.kind === 'comic'
      ? 'No text matched. Comics are searched by page labels.'
      : 'No matches.';
    return;
  }
  const note = document.createElement('p');
  note.className = 'card-meta';
  note.textContent = `${results.length}${results.length === 40 ? '+' : ''} match${results.length === 1 ? '' : 'es'}`;
  searchResults.append(note);
  for (const result of results) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'row';
    row.textContent = result.snippet;
    row.addEventListener('click', () => {
      pager.goToPage(result.page);
      pager.mark(result.page, result.query);
      closePanel();
    });
    searchResults.append(row);
  }
}

function addSampleButtons(container, samples) {
  for (const [file, label] of samples) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = label;
    button.addEventListener('click', () => {
      openSample(file).catch((err) => {
        clearStatus();
        showBanner(err.message || 'Could not open that sample.');
      });
    });
    container.append(button);
  }
}

async function openSample(name) {
  setStatus(`Opening ${name}…`);
  const response = await fetch(`samples/${name}`);
  if (!response.ok) throw new Error(`Could not load samples/${name}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const file = new File([bytes], name);
  const opened = await ingestOne(file);
  await showReader(opened.book, opened.meta);
}

let gesture = null;
stage.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  gesture = {
    x: event.clientX,
    y: event.clientY,
    id: event.pointerId,
    link: Boolean(event.target.closest('a')),
  };
});
stage.addEventListener('pointerup', (event) => {
  if (!gesture || gesture.id !== event.pointerId) return;
  const start = gesture;
  gesture = null;
  if (start.link || event.target.closest('a')) return;
  const dx = event.clientX - start.x;
  const dy = event.clientY - start.y;
  if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
    if (dx < 0) pager.next();
    else pager.prev();
    return;
  }
  if (Math.abs(dx) > 8 || Math.abs(dy) > 8) return;
  const rect = stage.getBoundingClientRect();
  const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0.5;
  if (ratio < 0.28) pager.prev();
  else if (ratio > 0.72) pager.next();
  else toggleChrome();
});
stage.addEventListener('click', (event) => {
  const link = event.target.closest('a');
  if (!link) return;
  const href = link.getAttribute('href') || '';
  if (!href) return;
  event.preventDefault();
  event.stopPropagation();
  if (/^https?:/i.test(href)) {
    window.open(href, '_blank', 'noopener');
    return;
  }
  const hash = href.includes('#') ? href.split('#').slice(1).join('#') : '';
  if (hash) {
    let fragment = hash;
    try { fragment = decodeURIComponent(hash); } catch { /* keep */ }
    pager.goToTarget({ chapterIndex: 0, fragment });
  }
});

fileInput.addEventListener('change', () => {
  const files = [...fileInput.files];
  fileInput.value = '';
  ingestList(files).catch((err) => {
    clearStatus();
    showBanner(err.message || 'Could not open that file.');
  });
});

let dragDepth = 0;
window.addEventListener('dragenter', (event) => {
  event.preventDefault();
  dragDepth += 1;
  document.body.classList.add('dragging');
});
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('dragleave', () => {
  dragDepth -= 1;
  if (dragDepth <= 0) {
    dragDepth = 0;
    document.body.classList.remove('dragging');
  }
});
window.addEventListener('drop', (event) => {
  event.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  if (event.dataTransfer?.files?.length) {
    ingestList(event.dataTransfer.files).catch((err) => {
      clearStatus();
      showBanner(err.message || 'Could not open that file.');
    });
  }
});

buttons.back.addEventListener('click', () => closeReader());
buttons.fontDec.addEventListener('click', () => {
  settings.fontSize = clampFont(settings.fontSize - 2);
  saveSettings(settings);
  relayout();
});
buttons.fontInc.addEventListener('click', () => {
  settings.fontSize = clampFont(settings.fontSize + 2);
  saveSettings(settings);
  relayout();
});
buttons.theme.addEventListener('click', () => applyTheme(settings.theme === 'dark' ? 'light' : 'dark'));
buttons.libraryTheme.addEventListener('click', () => applyTheme(settings.theme === 'dark' ? 'light' : 'dark'));
buttons.spread.addEventListener('click', () => {
  const order = ['auto', '1', '2'];
  const index = order.indexOf(settings.spread);
  settings.spread = order[(index + 1) % order.length];
  saveSettings(settings);
  relayout();
});
buttons.bookmark.addEventListener('click', toggleBookmark);
buttons.panel.addEventListener('click', togglePanel);
buttons.panelClose.addEventListener('click', closePanel);
document.getElementById('tab-contents').addEventListener('click', () => setTab('contents'));
document.getElementById('tab-search').addEventListener('click', () => setTab('search'));
document.getElementById('tab-bookmarks').addEventListener('click', () => setTab('bookmarks'));
document.getElementById('search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  renderSearch(searchInput.value);
});
searchInput.addEventListener('input', () => renderSearch(searchInput.value));

document.addEventListener('keydown', (event) => {
  if (readerView.hidden) return;
  const typing = event.target.closest('input, textarea');
  if (event.key === 'Escape') {
    if (!panel.hidden) closePanel();
    return;
  }
  if (typing) return;
  if (event.key === 'ArrowRight' || event.key === 'PageDown') {
    event.preventDefault();
    pager.next();
  } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
    event.preventDefault();
    pager.prev();
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    toggleBookmark();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    togglePanel();
  } else if (event.key === ' ' && !event.target.closest('button, a')) {
    event.preventDefault();
    pager.next();
  }
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (!readerView.hidden) relayout();
  }, 150);
});

addSampleButtons(document.getElementById('sample-text'), TEXT_SAMPLES);
addSampleButtons(document.getElementById('sample-comic'), COMIC_SAMPLES);
addSampleButtons(document.getElementById('sample-note'), NOTE_SAMPLES);

if (!settings.theme) {
  settings.theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}
applyTheme(settings.theme);
renderLibrary().catch((err) => showBanner(err.message || 'Could not read the library.'));

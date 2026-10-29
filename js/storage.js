/* Web Reader — GPL-3.0-or-later. See LICENSE. */

const DB_NAME = 'web-reader';
const DB_VERSION = 1;
const SETTINGS_KEY = 'web-reader:v1';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('derived')) db.createObjectStore('derived', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open browser storage.'));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Storage request failed.'));
    tx.onabort = () => reject(tx.error || new Error('Storage request was aborted.'));
  });
}

async function withStore(name, mode, fn) {
  const db = await openDb();
  try {
    const tx = db.transaction(name, mode);
    const result = await fn(tx.objectStore(name));
    await txDone(tx);
    return result;
  } finally {
    db.close();
  }
}

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listBooks() {
  const rows = await withStore('meta', 'readonly', (store) => req(store.getAll()));
  return rows.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

export async function getFile(id) {
  const row = await withStore('files', 'readonly', (store) => req(store.get(id)));
  return row ? new Uint8Array(row.bytes) : null;
}

export async function getDerived(id) {
  const row = await withStore('derived', 'readonly', (store) => req(store.get(id)));
  return row ? new Uint8Array(row.bytes) : null;
}

export async function putDerived(id, bytes) {
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  await withStore('derived', 'readwrite', (store) => {
    store.put({ id, bytes: copy });
  });
}

export async function saveBook(meta, bytes) {
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const db = await openDb();
  try {
    const tx = db.transaction(['meta', 'files'], 'readwrite');
    tx.objectStore('meta').put(meta);
    tx.objectStore('files').put({ id: meta.id, bytes: copy });
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function deleteBook(id) {
  const db = await openDb();
  try {
    const tx = db.transaction(['meta', 'files', 'derived'], 'readwrite');
    tx.objectStore('meta').delete(id);
    tx.objectStore('files').delete(id);
    tx.objectStore('derived').delete(id);
    await txDone(tx);
  } finally {
    db.close();
  }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      theme: parsed.theme === 'dark' || parsed.theme === 'light' ? parsed.theme : '',
      fontSize: clampFont(parsed.fontSize),
      spread: parsed.spread === '1' || parsed.spread === '2' || parsed.spread === 'auto' ? parsed.spread : 'auto',
      books: parsed.books && typeof parsed.books === 'object' ? parsed.books : {},
    };
  } catch {
    return { theme: '', fontSize: 19, spread: 'auto', books: {} };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function clampFont(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 19;
  return Math.min(28, Math.max(15, Math.round(n)));
}

export async function sha256(bytes) {
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

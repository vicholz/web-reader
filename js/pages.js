/* Web Reader — GPL-3.0-or-later. See LICENSE. */

const BLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'FIGURE', 'IMG', 'TABLE', 'HR', 'DIV', 'SECTION', 'ARTICLE', 'ASIDE', 'SVG']);

function hasBlockChild(node) {
  return [...node.children].some((child) => BLOCKS.has(child.tagName) && child.tagName !== 'IMG' && child.tagName !== 'SVG');
}

function isEmpty(el) {
  if (!el) return true;
  if (el.querySelector?.('img, svg, hr, table, canvas')) return false;
  if (el.tagName === 'IMG' || el.tagName === 'SVG' || el.tagName === 'HR') return false;
  return !el.textContent || !el.textContent.trim();
}

function collectBlocks(parent, out) {
  for (const node of [...parent.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.trim()) {
        const p = document.createElement('p');
        p.textContent = node.textContent.trim();
        out.push(p);
      }
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = node.tagName;
    if (tag === 'UL' || tag === 'OL') {
      let n = 1;
      for (const li of [...node.children]) {
        if (li.tagName !== 'LI') continue;
        const list = document.createElement(tag.toLowerCase());
        if (tag === 'OL') list.start = String(n);
        list.appendChild(li);
        out.push(list);
        n += 1;
      }
      continue;
    }
    if ((tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE' || tag === 'BLOCKQUOTE') && hasBlockChild(node)) {
      if (tag === 'BLOCKQUOTE') {
        const inner = [];
        collectBlocks(node, inner);
        for (const child of inner) {
          const quote = document.createElement('blockquote');
          quote.appendChild(child);
          out.push(quote);
        }
      } else {
        collectBlocks(node, out);
      }
      continue;
    }
    out.push(node);
  }
}

function waitImages(root) {
  const images = [...root.querySelectorAll('img')];
  return Promise.all(images.map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve())));
}

export function createPager(stage, onChange) {
  const sheet = document.createElement('div');
  sheet.className = 'track';
  const probe = document.createElement('div');
  probe.className = 'leaf probe';
  probe.setAttribute('aria-hidden', 'true');
  const probeInner = document.createElement('div');
  probeInner.className = 'leaf-inner';
  probe.appendChild(probeInner);
  stage.replaceChildren(sheet, probe);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let book = null;
  let fontPx = 19;
  let spread = 1;
  let page = 0;
  let pageCount = 1;
  let stride = 1;
  let col = 1;
  let gap = 0;
  let pageH = 1;
  let limit = 1;
  let gapPx = 14;
  let token = 0;
  const bidToPage = new Map();
  let anchors = [];
  let chapterPage = [];

  function emit() {
    if (onChange) onChange(snapshot());
  }

  function snapshot() {
    const leaf = sheet.querySelector(`.leaf[data-page="${page}"]`);
    const right = spread === 2 ? sheet.querySelector(`.leaf[data-page="${page + 1}"]`) : null;
    return {
      page,
      pageCount,
      spread,
      bid: anchors[page] || leaf?.dataset.bid || '',
      rightBid: right?.dataset.bid || '',
      text: leaf ? leaf.innerText : '',
      chapterPage: chapterPage.slice(),
    };
  }

  function metrics() {
    const viewW = Math.max(1, stage.clientWidth);
    const viewH = Math.max(1, stage.clientHeight);
    const overlay = document.getElementById('reader-view')?.classList.contains('overlay-chrome');
    gap = spread === 2 ? Math.max(22, Math.min(52, Math.round(viewW * 0.035))) : 0;
    col = Math.floor((viewW - gap) / spread);
    if (spread === 2) gap += viewW - (col * 2 + gap);
    else col = viewW;
    pageH = viewH;
    let padTop = overlay ? 118 : 28;
    let padBot = overlay ? 48 : 26;
    const padX = Math.max(12, Math.min(40, Math.round(col * 0.065)));
    limit = pageH - padTop - padBot;
    if (limit < 140) {
      padTop = Math.max(36, Math.round(pageH * 0.08));
      padBot = Math.max(28, Math.round(pageH * 0.06));
      limit = Math.max(80, pageH - padTop - padBot);
    }
    stride = col + gap;
    stage.style.fontSize = `${fontPx}px`;
    stage.style.setProperty('--page-limit', `${Math.max(60, limit - 4)}px`);
    stage.dataset.spread = String(spread);
    probe.style.width = `${col}px`;
    probe.style.padding = `${padTop}px ${padX}px ${padBot}px`;
    return { padTop, padBot, padX };
  }

  function sizeLeaf(leaf, pads, comic) {
    leaf.style.width = `${col}px`;
    leaf.style.height = `${pageH}px`;
    leaf.style.marginRight = `${gap}px`;
    leaf.style.padding = comic ? '0' : `${pads.padTop}px ${pads.padX}px ${pads.padBot}px`;
  }

  function maxPage() {
    if (pageCount <= 1) return 0;
    const last = pageCount - 1;
    return last - (last % spread);
  }

  function snap(value) {
    let next = Math.max(0, value);
    if (spread === 2) next -= next % 2;
    const max = maxPage();
    if (next > max) next = max;
    return next;
  }

  function paint(animate) {
    sheet.style.transition = animate && !reduced.matches ? 'transform 340ms cubic-bezier(.22,.61,.25,1)' : 'none';
    sheet.style.transform = `translate3d(${-page * stride}px,0,0)`;
  }

  function go(next, animate) {
    const target = snap(next);
    const changed = target !== page;
    page = target;
    if (animate && !changed) {
      const sign = page <= 0 ? 1 : -1;
      sheet.style.transition = 'transform 140ms ease';
      sheet.style.transform = `translate3d(${-page * stride + sign * 16}px,0,0)`;
      window.setTimeout(() => paint(true), 140);
    } else {
      paint(animate && changed);
    }
    emit();
  }

  function measure(node) {
    probeInner.appendChild(node);
    return node.offsetHeight;
  }

  function splitTextBlock(block) {
    const text = block.textContent.replace(/\s+/g, ' ').trim();
    if (text.length < 2) return [block];
    const parts = [];
    let rest = text;
    let guard = 0;
    while (rest && guard < 400) {
      guard += 1;
      const sample = document.createElement('p');
      let lo = 1;
      let hi = rest.length;
      let best = 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        sample.textContent = rest.slice(0, mid);
        if (measure(sample) <= limit - 6) {
          best = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      sample.remove();
      let cut = best;
      if (cut < rest.length) {
        const space = rest.lastIndexOf(' ', cut);
        if (space > 24) cut = space;
      }
      const piece = document.createElement('p');
      piece.dataset.split = '1';
      piece.dataset.chapter = block.dataset.chapter || '';
      piece.textContent = rest.slice(0, cut).trim();
      if (!piece.textContent) break;
      piece.dataset.bid = parts.length ? `${block.dataset.bid || 'p'}-${parts.length + 1}` : block.dataset.bid || '';
      parts.push(piece);
      rest = rest.slice(cut).trim();
    }
    return parts.length ? parts : [block];
  }

  async function layoutText(my) {
    const pads = metrics();
    gapPx = 14;
    sheet.replaceChildren();
    bidToPage.clear();
    anchors = [];
    chapterPage = [];
    const host = document.createElement('div');
    host.className = 'source-host';
    host.style.width = `${Math.max(40, col - pads.padX * 2)}px`;
    book.chapters.forEach((chapter, index) => {
      const section = document.createElement('section');
      section.dataset.chapter = String(index);
      section.innerHTML = chapter.html;
      host.appendChild(section);
    });
    stage.appendChild(host);
    await waitImages(host);
    if (my !== token) {
      host.remove();
      return;
    }

    const leaves = [];
    let current = newLeaf();

    function newLeaf() {
      const leaf = document.createElement('section');
      leaf.className = 'leaf';
      const inner = document.createElement('div');
      inner.className = 'leaf-inner';
      leaf.appendChild(inner);
      return { leaf, inner, used: 0, bid: '' };
    }

    function pushCurrent() {
      if (!current.inner.childNodes.length) return;
      sizeLeaf(current.leaf, pads, false);
      current.leaf.dataset.page = String(leaves.length);
      current.leaf.dataset.bid = current.bid || '';
      if (current.bid) bidToPage.set(current.bid, leaves.length);
      for (const node of current.inner.querySelectorAll('[data-bid]')) {
        bidToPage.set(node.dataset.bid, leaves.length);
      }
      anchors[leaves.length] = current.bid || '';
      leaves.push(current);
      sheet.appendChild(current.leaf);
      current = newLeaf();
    }

    function place(block) {
      if (isEmpty(block)) {
        block.remove();
        return;
      }
      let height = measure(block);
      if (height > limit - 6 && !block.dataset.split && !block.querySelector('img, svg, table, pre')) {
        block.remove();
        for (const part of splitTextBlock(block)) place(part);
        return;
      }
      const gapNeed = current.inner.childNodes.length ? gapPx : 0;
      const heading = /^H[1-6]$/.test(block.tagName);
      if (current.inner.childNodes.length && (current.used + gapNeed + height > limit - 6 || (heading && current.used + height + 64 > limit))) {
        pushCurrent();
        height = measure(block);
      }
      const chapter = block.dataset.chapter;
      if (chapter != null && chapter !== '' && chapterPage[chapter] == null) {
        chapterPage[chapter] = leaves.length;
      }
      current.inner.appendChild(block);
      const usedGap = current.inner.childNodes.length > 1 ? gapPx : 0;
      current.used += usedGap + height;
      if (!current.bid && block.dataset.bid) current.bid = block.dataset.bid;
    }

    book.chapters.forEach((chapter, index) => {
      const section = host.children[index];
      if (!section) return;
      if (index > 0 && current.inner.childNodes.length) pushCurrent();
      const blocks = [];
      collectBlocks(section, blocks);
      const hasHeading = blocks.some((el) => /^H[1-6]$/.test(el.tagName));
      if (!hasHeading && chapter.title) {
        const heading = document.createElement('h1');
        heading.textContent = chapter.title;
        blocks.unshift(heading);
      }
      blocks.forEach((block, blockIndex) => {
        block.dataset.chapter = String(index);
        if (!block.dataset.bid) block.dataset.bid = `c${index}b${blockIndex}`;
      });
      for (const block of blocks) place(block);
    });
    pushCurrent();
    host.remove();
    probeInner.replaceChildren();
    if (!leaves.length) {
      current.inner.textContent = 'This book has no readable text.';
      pushCurrent();
    }
    pageCount = Math.max(1, leaves.length);
  }

  function layoutComic() {
    const pads = metrics();
    sheet.replaceChildren();
    bidToPage.clear();
    anchors = [];
    chapterPage = book.pages.map((_, index) => index);
    book.pages.forEach((item, index) => {
      const leaf = document.createElement('section');
      leaf.className = 'leaf comic';
      sizeLeaf(leaf, pads, true);
      leaf.dataset.page = String(index);
      leaf.dataset.bid = `p${index}`;
      const img = document.createElement('img');
      img.alt = item.title || `Page ${index + 1}`;
      img.src = item.url;
      img.draggable = false;
      const caption = document.createElement('p');
      caption.className = 'sr-only';
      caption.textContent = `${item.title || `Page ${index + 1}`}. ${book.title || ''}`;
      leaf.append(img, caption);
      sheet.appendChild(leaf);
      anchors[index] = `p${index}`;
      bidToPage.set(`p${index}`, index);
    });
    pageCount = Math.max(1, book.pages.length);
  }

  function restore(progress) {
    if (progress?.bid && bidToPage.has(progress.bid)) {
      go(bidToPage.get(progress.bid), false);
      return;
    }
    if (progress?.bid) {
      const base = String(progress.bid).replace(/-\d+$/, '');
      if (bidToPage.has(base)) {
        go(bidToPage.get(base), false);
        return;
      }
    }
    go(Number.isFinite(progress?.page) ? progress.page : 0, false);
  }

  function ensureMounted() {
    if (!stage.contains(sheet) || !stage.contains(probe)) stage.replaceChildren(sheet, probe);
  }

  async function layout(progress) {
    const my = ++token;
    if (!book) return;
    ensureMounted();
    if (stage.clientWidth < 2 || stage.clientHeight < 2) return;
    if (book.kind === 'comic') layoutComic();
    else await layoutText(my);
    if (my !== token) return;
    restore(progress);
  }

  return {
    async load(nextBook, options, progress) {
      book = nextBook;
      fontPx = options.fontSize;
      spread = options.spread;
      if (book.language) stage.lang = book.language;
      await layout(progress);
    },
    async relayout(options, progress) {
      fontPx = options.fontSize;
      spread = options.spread;
      const keep = progress || { bid: anchors[page] || '', page };
      await layout(keep);
    },
    next() {
      go(page + spread, true);
    },
    prev() {
      go(page - spread, true);
    },
    goToPage(next) {
      go(next, true);
    },
    goToTarget(target) {
      if (!target) return;
      if (book?.kind === 'comic') {
        go(target.chapterIndex || 0, true);
        return;
      }
      if (target.fragment) {
        const escaped = window.CSS && CSS.escape ? CSS.escape(target.fragment) : target.fragment;
        const el = sheet.querySelector(`[id="${escaped}"]`);
        const leaf = el?.closest('.leaf');
        if (leaf) {
          go(Number(leaf.dataset.page), true);
          return;
        }
      }
      const start = chapterPage[target.chapterIndex];
      if (start != null) go(start, true);
    },
    search(query) {
      const q = query.trim().toLowerCase();
      if (q.length < 2) return [];
      const results = [];
      for (const leaf of sheet.querySelectorAll('.leaf:not(.probe)')) {
        const text = leaf.textContent.replace(/\s+/g, ' ').trim();
        const index = text.toLowerCase().indexOf(q);
        if (index < 0) continue;
        const start = Math.max(0, index - 32);
        results.push({
          page: Number(leaf.dataset.page),
          bid: leaf.dataset.bid || '',
          snippet: `${start > 0 ? '…' : ''}${text.slice(start, index + q.length + 56)}${index + q.length + 56 < text.length ? '…' : ''}`,
          query: q,
        });
        if (results.length >= 40) break;
      }
      return results;
    },
    mark(pageIndex, query) {
      this.clearMarks();
      const leaf = sheet.querySelector(`.leaf[data-page="${pageIndex}"]`);
      if (!leaf || !query) return;
      const walker = document.createTreeWalker(leaf, NodeFilter.SHOW_TEXT);
      const needle = query.toLowerCase();
      let node = walker.nextNode();
      while (node) {
        const index = node.nodeValue.toLowerCase().indexOf(needle);
        if (index >= 0) {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + query.length);
          const mark = document.createElement('mark');
          try {
            range.surroundContents(mark);
          } catch {
            leaf.classList.add('find-hit');
          }
          return;
        }
        node = walker.nextNode();
      }
    },
    clearMarks() {
      sheet.querySelectorAll('mark').forEach((mark) => {
        const text = document.createTextNode(mark.textContent);
        mark.replaceWith(text);
      });
      sheet.querySelectorAll('.find-hit').forEach((el) => el.classList.remove('find-hit'));
    },
    snapshot,
    pageForBid(bid) {
      return bidToPage.has(bid) ? bidToPage.get(bid) : null;
    },
    destroy() {
      token += 1;
      book = null;
      sheet.replaceChildren();
      probeInner.replaceChildren();
      ensureMounted();
    },
  };
}

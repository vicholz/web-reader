# Reader

A private book reader that opens the same files as [toazw3](https://github.com/vicholz/toazw3): EPUB, MOBI, PRC, AZW, AZW3, CBZ, and CBR. It is a static site. Books are stored in this browser and are never uploaded.

## Supported formats

| Extension | What it is | How it is read |
| --- | --- | --- |
| `.epub` | EPUB 2 / EPUB 3 | Unpacked in the browser |
| `.mobi` | Mobipocket | Converted to EPUB locally with [boko](https://github.com/zacharydenton/boko) |
| `.prc` | Mobipocket PRC, or an older PalmDOC PRC | Mobipocket goes through boko. A Palm `TEXt`/`REAd` file is read directly |
| `.azw` | DRM-free Kindle AZW (Mobipocket) | Same path as MOBI |
| `.azw3` | Kindle KF8 | Converted to EPUB locally with boko |
| `.cbz` | Comic book ZIP | One image per page |
| `.cbr` | Comic book RAR | Unpacked with [libarchive](https://github.com/ofk/libarchive-wasm), then one image per page |

Sample files for each of those live in `samples/`. The library page can open them.

These do not open:

- DRM-protected Kindle books, and password-protected CBZ or CBR archives.
- Huffman-compressed PRC (`HUFF`/`CDIC`). Save that book as MOBI or EPUB.
- KFX. toazw3 does not take KFX as an input, and neither does this reader.
- Fixed-layout EPUB is shown as reflowed text. Comics belong in CBZ or CBR, where each image is a page.

## Controls

Open a book with the file picker or by dropping it anywhere on the page.

- **Right side** of the page, **Right arrow**, or **Space**: next page
- **Left side**, or **Left arrow**: previous page
- **Center** tap or click: show or hide the toolbar
- **Swipe** left or right on a touch screen
- **Down arrow**: bookmark or unbookmark the current page
- **Up arrow**: chapters, search, and bookmarks. **Escape** closes that panel
- **A− / A+**: text size
- **Theme**: light or dark paper
- **Auto / 1 / 2**: one page, a two-page spread, or automatic. Automatic uses two pages on wide landscape screens and one page on phones and portrait screens

The toolbar also has the same bookmark, contents, type size, theme, and spread controls.

## Library

The book file is stored in IndexedDB, which is not limited to the few megabytes of `localStorage`. Reading position, bookmarks, type size, theme, and the page-layout choice are stored in `localStorage`. Reopen a book from the library to continue at the last page. Remove deletes the file and its saved place.

## Run locally

ES modules do not load from a `file://` URL. From this directory:

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

Regenerate the samples with `node scripts/make-samples.mjs`.

## GitHub Pages

The site is the repository root, including `.nojekyll`, so Pages can publish it without a build.

1. Open the repository **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Choose branch **main** and folder **/ (root)**, then save.
4. After the deployment finishes, the reader is at [https://vicholz.github.io/web-reader/](https://vicholz.github.io/web-reader/).

## License

GPL-3.0-or-later, because the Kindle converter is boko (GPL-3.0-or-later). See `LICENSE`.

The comic unpacker in `vendor/libarchive/` is libarchive-wasm (MIT) with libarchive (BSD-2-Clause). Those license texts stay next to the files they cover.

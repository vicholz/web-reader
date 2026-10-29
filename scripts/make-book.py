#!/usr/bin/env python3
"""Build the sample EPUB, CBZ, CBR, and PalmDOC PRC used by the reader."""

import binascii
import struct
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "samples"
SAMPLES.mkdir(exist_ok=True)

CHAPTERS = [
    (
        "The Lantern Room",
        "chap1.xhtml",
        """
The lantern was still warm when Mara came back to the reading room. Someone had trimmed the wick and left the glass a little crooked, so the light leaned across the table and stopped just short of the harbor chart. She set her bag down, listened to the building settle, and decided the crooked light could stay.

The room lived above a chandlery that had closed for the season. By day it smelled of paper, rope, and the sweet dust that gathers in the spines of books nobody has borrowed. By night the window kept a thin stripe of the harbor, and the stripe moved whenever a boat changed its mind about leaving.

Mara was not supposed to have a key. The librarian, a patient man named Ivo, had pressed it into her hand at the end of summer and said the lock stuck unless you lifted the door by its copper hinge. She had lifted it. The hinge answered with a small bright sound, and the room agreed to know her.

On the table she found a pencil, a saucer, and a note in Ivo's square hand: the second shelf is for things that are almost true. She read it twice. Almost true was a generous category. It could hold a map with a street that had been planned and never paved, or a story whose ending had been revised by the person who lived it.

She lit nothing new. The lantern was enough. She opened the chart and traced the channel with a finger that still smelled like oranges from the late ferry. A cross mark sat beside a shoal called the Little Sister. Under it, in a paler pencil, someone had written: do not trust the water when it looks like tin.

Mara copied the warning into her notebook, then added a line of her own. The lantern was still warm, and that seemed worth recording, the way a person records the weather before deciding whether to go out in it. Down on the quay a bell rang once. The stripe of harbor on the window widened, then thinned, as if the tide were a page being turned.

She stayed until the wick began to chatter. Before she left she straightened the glass, thought better of it, and set it crooked again. Some rooms keep their character in small refusals. She lifted the door by the copper hinge, and the night met her with salt and a dog barking at nothing in particular.
""".strip(),
    ),
    (
        "The Second Shelf",
        "chap2.xhtml",
        """
The second shelf was lower than Mara expected, as if it had been built for someone who read sitting on the floor. The books there were odd sizes. One was a tide log with the Sundays torn out. One was a cookbook whose margins were full of drawings of knots. One, pressed between them, was not a book at all but a bundle of letters tied with fishing line.

She did not open the letters. Almost true, she thought, did not mean unattended. She slid out the cookbook instead and let it fall open where the string had dented it. The recipe was for a winter soup. In the margin a drawing showed a bowline, and under the bowline a sentence: the harbor keeps what you tie badly.

Mara sat on the rug, because the chair faced the window and she wanted the shelf at eye level. From there the lantern was a high moon and the table was a country she was not in. She read about beans, then about rope, then about a woman named Sera who had run the chandlery and refused to sell chain by the fathom because a fathom was a body and a body should not be a unit of sale.

The story had the feel of a thing told often enough to grow a smooth side. Mara believed the smooth side and also the part that snagged: Sera measuring chain with her arms anyway, when the customer was a child. Almost true, then. True enough to keep.

A floorboard in the hallway spoke. Mara closed the cookbook over her thumb and waited. The building liked to announce nobody. After a while the quiet put its tools away. She retied the fishing line more loosely, so the letters could breathe, and she wrote in her notebook that the second shelf smelled like cedar and oranges, though the oranges were only her hands.

Near the end of the shelf a slim green book had no title on the spine. Inside, every other page was blank, and the written pages were lists of boats. Not names. Colors. Red with a white eye. Blue that went black when it rained. A gray the writer called tin, which made Mara look up, as if the shoal from the chart had followed her across the room.

She added her own line at the bottom of a blank page, small enough to take back later: a lantern, crooked, still warm. Then she put the green book exactly where it had been, because shelves remember the width of things.
""".strip(),
    ),
    (
        "A Door in the Margin",
        "chap3.xhtml",
        """
On the third night the note had a second sentence. It was written under the first in a quicker hand, or in the same hand hurrying: if you find a door in the margin, it is only a way of saying come back tomorrow.

Mara looked for a door and found one, though it was not the kind that swings. In the green book, beside the tin-colored boat, a rectangle had been drawn in ink so fine she had missed it. The rectangle had a tiny knob. She smiled despite herself. A door in the margin is a promise that the page continues somewhere the printer could not afford.

She did come back tomorrow. She brought bread and a better pencil and the intention to copy the boat list before the almost-true things rearranged themselves. The lantern was cold this time. She lit it properly, raised the wick, and set the glass straight. The room looked more like a room and less like a secret, which made her braver.

Ivo was there at dusk, shaking rain off a hat that had lost the fight. He did not seem surprised to see her. He set a parcel of tea on the table, noticed the straightened glass, and tilted it back to the old angle without comment. "The second shelf behave itself?" he asked.

"It told me about chain," Mara said, "and about water that looks like tin."

"Then it told you the useful parts." He nodded at her notebook. "Write the rest however you like. The harbor will correct you if you are decorative instead of careful."

They drank the tea while the rain tried the window and failed to come in. Ivo talked about Sera, who had been his aunt, and about the Little Sister shoal, which was real, and about the door in the margin, which he had drawn for a niece who was learning that books can answer without pretending to be magic. Mara felt the story settle. Almost true, she decided, was not a trick. It was a courtesy. It left room for the person holding the book.

When the wick began to chatter she closed the green book, the cookbook, and the chart. She did not straighten the glass. At the door she lifted by the copper hinge, and Ivo lifted with her, and the two sounds made one. Outside, the harbor was a dark page with a few lamps on it, each lamp a sentence she could read from here and still not finish.
""".strip(),
    ),
]


def fill(width, height, rgb):
    row = bytes([0]) + bytes(rgb) * width
    raw = bytearray(row * height)
    return raw


def rect(raw, width, x, y, rw, rh, rgb, height):
    stride = 1 + width * 3
    color = bytes(rgb)
    x0 = max(0, x)
    y0 = max(0, y)
    x1 = min(width, x + rw)
    y1 = min(height, y + rh)
    for yy in range(y0, y1):
        start = yy * stride + 1 + x0 * 3
        raw[start:start + (x1 - x0) * 3] = color * (x1 - x0)


DIGITS = {
    "0": ["111", "101", "101", "101", "111"],
    "1": ["010", "110", "010", "010", "111"],
    "2": ["111", "001", "111", "100", "111"],
    "3": ["111", "001", "111", "001", "111"],
    "4": ["101", "101", "111", "001", "001"],
}


def blit_digit(raw, width, height, digit, ox, oy, scale, rgb):
    glyph = DIGITS[digit]
    for gy, row in enumerate(glyph):
        for gx, bit in enumerate(row):
            if bit == "1":
                rect(raw, width, ox + gx * scale, oy + gy * scale, scale - 2, scale - 2, rgb, height)


def solid_png(width, height, rgb, marks=()):
    raw = fill(width, height, rgb)
    rect(raw, width, 28, 28, width - 56, height - 56, tuple(min(255, c + 18) for c in rgb), height)
    rect(raw, width, 48, 48, width - 96, 18, (255, 244, 230), height)
    for mark in marks:
        blit_digit(raw, width, height, *mark)
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", binascii.crc32(tag + data) & 0xFFFFFFFF)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    import zlib
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")


def cover_png():
    w, h = 420, 640
    raw = fill(w, h, (110, 52, 42))
    rect(raw, w, 36, 36, w - 72, h - 72, (244, 236, 224), h)
    rect(raw, w, 180, 150, 60, 90, (232, 176, 92), h)
    rect(raw, w, 168, 130, 84, 28, (90, 46, 38), h)
    rect(raw, w, 198, 118, 24, 20, (255, 214, 120), h)
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", binascii.crc32(tag + data) & 0xFFFFFFFF)
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    import zlib
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")


def lantern_png():
    return solid_png(360, 260, (90, 62, 48), marks=(("1", 150, 90, 16, (255, 236, 214)),))


def paragraphs(text):
    return [part.strip() for part in text.split("\n\n") if part.strip()]


def xhtml(title, paragraphs, image=None):
    body = []
    if image:
        body.append(f'<p><img src="{image}" alt="A small drawing of a lantern."/></p>')
    body.append(f"<h1>{title}</h1>")
    body.extend(f"<p>{part}</p>" for part in paragraphs)
    inner = "\n".join(body)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head><title>{title}</title></head>
<body>
{inner}
</body>
</html>
""".encode()


def nav(items):
    links = "\n".join(f'      <li><a href="{href}">{title}</a></li>' for title, href in items)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head><title>Contents</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <ol>
{links}
    </ol>
  </nav>
</body>
</html>
""".encode()


def ncx(items):
    points = []
    for index, (title, href) in enumerate(items, start=1):
        points.append(f"""    <navPoint id="nav{index}" playOrder="{index}">
      <navLabel><text>{title}</text></navLabel>
      <content src="{href}"/>
    </navPoint>""")
    joined = "\n".join(points)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:lantern-room"/>
    <meta name="dtb:depth" content="1"/>
  </head>
  <docTitle><text>The Lantern Room</text></docTitle>
  <navMap>
{joined}
  </navMap>
</ncx>
""".encode()


def opf(manifest, spine):
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:lantern-room</dc:identifier>
    <dc:title>The Lantern Room</dc:title>
    <dc:creator>N. Calder</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
    <meta name="cover" content="cover-img"/>
  </metadata>
  <manifest>
{manifest}
  </manifest>
  <spine>
{spine}
  </spine>
</package>
""".encode()


def write_zip(path, files):
    with zipfile.ZipFile(path, "w") as archive:
        for name, data, stored in files:
            info = zipfile.ZipInfo(filename=name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_STORED if stored else zipfile.ZIP_DEFLATED
            info.flag_bits = 0x800
            archive.writestr(info, data)


def build_epub():
    cover = cover_png()
    lantern = lantern_png()
    chapters = []
    for title, href, text in CHAPTERS:
        image = "images/lantern.png" if href == "chap1.xhtml" else None
        chapters.append((title, href, xhtml(title, paragraphs(text), image)))
    manifest = [
        '    <item id="cover-img" href="images/cover.png" media-type="image/png" properties="cover-image"/>',
        '    <item id="lantern" href="images/lantern.png" media-type="image/png"/>',
        '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        '    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    ]
    spine = []
    for index, (title, href, _) in enumerate(chapters, start=1):
        manifest.append(f'    <item id="c{index}" href="{href}" media-type="application/xhtml+xml"/>')
        spine.append(f'    <itemref idref="c{index}"/>')
    container = b"""<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"""
    items = [(title, href) for title, href, _ in chapters]
    files = [
        ("mimetype", b"application/epub+zip", True),
        ("META-INF/container.xml", container, False),
        ("OEBPS/content.opf", opf("\n".join(manifest), "\n".join(spine)), False),
        ("OEBPS/nav.xhtml", nav(items), False),
        ("OEBPS/toc.ncx", ncx(items), False),
        ("OEBPS/images/cover.png", cover, False),
        ("OEBPS/images/lantern.png", lantern, False),
    ]
    for _title, href, data in chapters:
        files.append((f"OEBPS/{href}", data, False))
    write_zip(SAMPLES / "lantern-room.epub", files)


def comic_info():
    return b"""<?xml version="1.0"?>
<ComicInfo>
  <Title>Paper Boats</Title>
  <Series>Paper Boats</Series>
  <Number>1</Number>
  <Writer>I. Marin</Writer>
  <Summary>Four paper boats cross a paper harbor.</Summary>
  <LanguageISO>en</LanguageISO>
</ComicInfo>
"""


def build_comic():
    colors = [(196, 73, 58), (47, 111, 106), (224, 162, 74), (49, 78, 122)]
    pages = []
    for index, color in enumerate(colors, start=1):
        pages.append((f"page{index}.png", solid_png(640, 960, color, marks=((str(index), 250, 390, 28, (255, 248, 240)),))))
    files = [("ComicInfo.xml", comic_info(), False)]
    files.extend((name, data, False) for name, data in pages)
    write_zip(SAMPLES / "paper-boats.cbz", files)
    write_rar(SAMPLES / "paper-boats.cbr", [("ComicInfo.xml", comic_info()), *pages])


def crc16(data):
    return binascii.crc32(data) & 0xFFFF


def rar_block(head_type, flags, body):
    head_size = 7 + len(body)
    raw = struct.pack("<BHH", head_type, flags, head_size) + body
    return struct.pack("<H", crc16(raw)) + raw


def write_rar(path, files):
    parts = [b"Rar!\x1a\x07\x00", rar_block(0x73, 0, b"\x00\x00\x00\x00\x00\x00")]
    for name, data in files:
        name_b = name.encode("ascii")
        body = struct.pack("<II", len(data), len(data))
        body += struct.pack("<B", 0)
        body += struct.pack("<I", binascii.crc32(data) & 0xFFFFFFFF)
        body += struct.pack("<I", 0)
        body += struct.pack("<B", 20)
        body += struct.pack("<B", 0x30)
        body += struct.pack("<H", len(name_b))
        body += struct.pack("<I", 0x20)
        body += name_b
        parts.append(rar_block(0x74, 0, body))
        parts.append(data)
    parts.append(rar_block(0x7B, 0, b""))
    path.write_bytes(b"".join(parts))


def write_palmdoc(path, title, text):
    raw = text.encode("latin1")
    record_size = 4096
    text_records = [raw[i:i + record_size] for i in range(0, len(raw), record_size)] or [b""]
    header = struct.pack(">HHIHHI", 1, 0, len(raw), len(text_records), record_size, 0)
    records = [header, *text_records]
    name = title.encode("latin1")[:31] + b"\x00"
    name = name + b"\x00" * (32 - len(name))
    header_pdb = name
    header_pdb += struct.pack(">HHIIIIII", 0, 0, 0, 0, 0, 0, 0, 0)
    header_pdb += b"TEXt" + b"REAd"
    header_pdb += struct.pack(">IIH", 0, 0, len(records))
    if len(header_pdb) != 78:
        raise RuntimeError(f"PDB header is {len(header_pdb)} bytes")
    offset = 78 + len(records) * 8
    record_list = b""
    blobs = []
    for index, record in enumerate(records):
        record_list += struct.pack(">I", offset)
        record_list += bytes([0, 0, 0, index & 0xFF])
        blobs.append(record)
        offset += len(record)
    path.write_bytes(header_pdb + record_list + b"".join(blobs))


def mobi_html():
    parts = ["<html><head><title>The Lantern Room</title></head><body>"]
    for index, (title, _href, text) in enumerate(CHAPTERS):
        if index:
            parts.append("<mbp:pagebreak/>")
        parts.append(f"<h1>{title}</h1>")
        for paragraph in paragraphs(text):
            parts.append(f"<p>{paragraph}</p>")
    parts.append("</body></html>")
    return "".join(parts).encode("latin1")


def write_mobi(path, title, html):
    record_size = 4096
    text_records = [html[i:i + record_size] for i in range(0, len(html), record_size)] or [b""]
    header = struct.pack(">HHIHHI", 1, 0, len(html), len(text_records), record_size, 0)
    records = [header, *text_records]
    name = title.encode("latin1")[:31] + b"\x00"
    name = name + b"\x00" * (32 - len(name))
    pdb = name
    pdb += struct.pack(">HHIIIIII", 0, 0, 0, 0, 0, 0, 0, 0)
    pdb += b"BOOK" + b"MOBI"
    pdb += struct.pack(">IIH", 0, 0, len(records))
    if len(pdb) != 78:
        raise RuntimeError(f"MOBI PDB header is {len(pdb)} bytes")
    offset = 78 + len(records) * 8
    record_list = b""
    for index, record in enumerate(records):
        record_list += struct.pack(">IB", offset, 0) + bytes([0, 0, index & 0xFF])
        offset += len(record)
    path.write_bytes(pdb + record_list + b"".join(records))


def main():
    build_epub()
    build_comic()
    write_mobi(SAMPLES / "lantern-room.mobi", "The Lantern Room", mobi_html())
    write_palmdoc(
        SAMPLES / "pocket-note.prc",
        "Pocket Note",
        "The pocket note survived the crossing.\n\n"
        "Mara kept it in the same envelope as the ferry ticket. "
        "The paper had gone soft at the corners, but the sentence was still dark. "
        "She read it once on the quay and once again under the lantern, "
        "where the harbor looked like tin and the second shelf was only a memory.\n\n"
        "It said: come back tomorrow, and bring the green book.",
    )
    print("wrote epub, cbz, cbr, and pocket-note.prc")


if __name__ == "__main__":
    main()

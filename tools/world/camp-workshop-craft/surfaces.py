"""Authored PNG tiles and book leaf. No third-party texture inputs."""
import math
import random
import struct
import zlib


def png(path, size, pixel):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

    def row(y):
        return b'\x00' + bytes(round(max(0, min(255, c))) for x in range(size) for c in pixel(x, y))

    ihdr = struct.pack('>2I5B', size, size, 8, 2, 0, 0, 0)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
                     + chunk(b'IDAT', zlib.compress(b''.join(row(y) for y in range(size)), 9))
                     + chunk(b'IEND', b''))


def make_maps(directory):
    directory.mkdir(parents=True, exist_ok=True)
    rng = random.Random(1108)

    def grain(x, y):
        u, v = x / 256, y / 256
        wave = 0.013 * math.sin(math.tau * u) + 0.005 * math.sin(math.tau * (2 * u + v))
        ripple = .016 * math.sin(math.tau * (3 * v + u))
        early = math.sin(math.tau * (v + wave + ripple) * 9)
        late = math.sin(math.tau * (v + wave + .4 * ripple) * 29)
        fiber = math.sin(math.tau * (v + wave) * 64)
        return 5 * early + 4 * late + 3 * fiber + rng.uniform(-3, 3)

    def wood(x, y):
        shade = grain(x, y)
        return (179 + shade, 156 + shade, 126 + shade)

    def ash(x, y):
        shade = grain(x, y)
        return (211 + shade, 184 + shade, 144 + shade)

    def cloth_normal(x, y):
        u, v = math.tau * x / 8, math.tau * y / 8
        return (127.5 + 16 * math.sin(u) * math.cos(v / 2)**2,
                127.5 + 16 * math.sin(v) * math.sin(u / 2)**2, 252)

    def page_edge(x, y):
        shade = 1.5 * math.sin(x / 2.5) + rng.uniform(-2.5, 2.5)
        shade -= (9 if y % 13 in (0, 1) else 0) + (11 if y % 41 == 0 else 0)
        return 224 + shade, 210 + shade, 184 + shade

    def leaf(x, y, variant=False):
        shade = rng.uniform(-3, 3)
        if 22 < x < 224 and y in range(41, 222) and y % 16 == 0:
            return (181 + shade, 178 + shade, 162 + shade)
        if 32 <= x <= 34 and 27 < y < 225:
            return 190 + shade, 147 + shade, 114 + shade
        # Loose note marks and a small geometric sketch, with no fictional text.
        lines = ((66, 165), (98, 198), (114, 111), (130, 172), (146, 106), (162, 151)) if variant else (
            (66, 154), (82, 183), (98, 145), (114, 177), (130, 109),
        )
        for yy, end in lines:
            if abs(y - yy + math.sin(x / 13) * 1.2) < 1.1 and 48 < x < end and x % 23 < 19:
                return 109 + shade, 122 + shade, 125 + shade
        if not variant and 152 < y < 198 and 112 < x < 191 and (
            abs(y - 192) <= 1 or abs(x - 117) <= 1 or abs(y - 240 + x * .48 + 4 * math.sin(x / 8)) < 1.1
        ):
            return 147 + shade, 110 + shade, 83 + shade
        return 234 + shade, 222 + shade, 198 + shade

    for name, size, fn in (('oak-timber', 256, wood), ('ash-timber', 256, ash), ('bookcloth-normal', 128, cloth_normal),
                           ('page-edge', 256, page_edge), ('ruled-leaf', 256, leaf),
                           ('study-notes', 256, lambda x, y: leaf(x, y, True))):
        png(directory / (name + '.png'), size, fn)

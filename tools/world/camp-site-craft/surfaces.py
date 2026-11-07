"""Deterministic tiling PBR source maps authored for C02 and L01. No external images."""
import struct
import zlib

import numpy as np

SIZE = 512


def png(path, rgb):
    data = np.round(np.clip(rgb, 0, 1) * 255).astype(np.uint8)
    if data.ndim == 2:
        data = np.repeat(data[..., None], 3, axis=2)
    height, width = data.shape[:2]

    def chunk(tag, body):
        return struct.pack(">I", len(body)) + tag + body + struct.pack(">I", zlib.crc32(tag + body))

    rows = b"".join(b"\0" + row.tobytes() for row in data)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">2I5B", width, height, 8, 2, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))


def tile_noise(rng, columns, rows, u, v):
    values = rng.uniform(-1, 1, (rows, columns))
    x, y = u * columns, v * rows
    xi, yi = np.floor(x).astype(int), np.floor(y).astype(int)
    a, b = x - xi, y - yi
    a, b = a * a * (3 - 2 * a), b * b * (3 - 2 * b)
    low = values[yi % rows, xi % columns] * (1 - a) + values[yi % rows, (xi + 1) % columns] * a
    high = values[(yi + 1) % rows, xi % columns] * (1 - a) + values[(yi + 1) % rows, (xi + 1) % columns] * a
    return low * (1 - b) + high * b


def tangent_normal(height, width, length):
    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * SIZE / (2 * width)
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * SIZE / (2 * length)
    normals = np.stack((-dx, dy, np.ones_like(dx)), axis=2)
    return 0.5 + 0.5 * normals / np.linalg.norm(normals, axis=2)[..., None]


def write_maps(directory):
    directory.mkdir(exist_ok=True)
    rng = np.random.default_rng(32411)
    v, u = np.indices((SIZE, SIZE)) / SIZE

    # Cleaved sandstone: broad mineral drift, little mid-scale clouding and much finer pores.
    broad = tile_noise(rng, 4, 4, u, v) * 0.65 + tile_noise(rng, 9, 7, u, v) * 0.35
    warp = tile_noise(rng, 5, 5, u, v) * .013
    veins = tile_noise(rng, 5, 32, u, v + u + warp)
    fines = tile_noise(rng, 114, 108, u, v)
    pits = np.maximum(-fines - .43, 0) ** 1.3
    grit = tile_noise(rng, 46, 41, u, v)
    stone = np.array([.602, .569, .531]) + broad[..., None] * np.array([.046, .042, .037])
    stone += (.022 * veins + .016 * grit - .037 * pits)[..., None]
    png(directory / "quarry-stone-color.png", stone)
    png(directory / "quarry-stone-roughness.png", .82 + .055 * grit + .040 * veins + .09 * pits)
    height = .00090 * broad + .00055 * grit + .00032 * veins + .00016 * fines - .0011 * pits
    png(directory / "quarry-stone-normal.png", tangent_normal(height, 1.3, 1.3))

    # Oiled timber: vertical grain bundles with a gentler, longer change in tone along the shaft.
    curl = .035 * tile_noise(rng, 4, 4, u, v)
    dark = tile_noise(rng, 26, 4, u + curl, v)
    fiber = tile_noise(rng, 96, 7, u + curl, v)
    growth = tile_noise(rng, 8, 3, u + curl, v)
    weathering = tile_noise(rng, 10, 8, u, v)
    grain = .06 * growth + .056 * dark + .028 * fiber + .022 * weathering
    wood = np.array([.483, .363, .266]) + grain[..., None] * np.array([1, .91, .81])
    png(directory / "exit-timber-color.png", wood)
    png(directory / "exit-timber-roughness.png", .68 + .075 * growth + .11 * dark + .035 * fiber)
    height = .00017 * fiber + .00035 * dark + .00022 * growth
    png(directory / "exit-timber-normal.png", tangent_normal(height, .48, 2.2))

"""Fetch selected 100STYLE BVH files by HTTP range from the Zenodo zip (plain python3, no deps).

100STYLE (Ian Mason, Sebastian Starke, Taku Komura), Zenodo record 8127870, CC BY 4.0.
Credit line: "The 100STYLE Dataset - Ian Mason". Raw BVH files are NOT committed; they go to
~/.cache/g24-100style (or argv[1]). The zip is 1.47 GB; only the central directory (last ~0.2 MB)
and the listed members are downloaded. Each member is CRC-checked against the zip directory and its
SHA-256 is printed (record them in SOURCES.sha256).

Run: python3 fetch_100style.py [OUT_DIR] [MEMBER ...]
     default members: Neutral TR1 / FW / FR / ID + Frame_Cuts.csv + Dataset_List.csv
Uses curl (system) for the range requests.
"""
import hashlib, json, os, struct, subprocess, sys, zlib

URL = 'https://zenodo.org/records/8127870/files/100STYLE.zip?download=1'
TOTAL = 1468515354          # bytes, Zenodo listing 2026-10-24 (md5 3cf627852fd8192024c04a8d0ef49583)
DEFAULT = ['100STYLE/Neutral/Neutral_TR1.bvh', '100STYLE/Neutral/Neutral_FW.bvh', '100STYLE/Neutral/Neutral_FR.bvh',
           '100STYLE/Neutral/Neutral_ID.bvh', '100STYLE/Frame_Cuts.csv', '100STYLE/Dataset_List.csv']


def rng(a, b):
    out = subprocess.run(['curl', '-sS', '--fail', '--max-time', '300', '-r', f'{a}-{b}', URL], capture_output=True, check=True).stdout
    assert len(out) == b - a + 1, (a, b, len(out))
    return out


def directory():
    tail = rng(TOTAL - 1_000_000, TOTAL - 1)
    base = TOTAL - len(tail)
    i = tail.rfind(b'PK\x05\x06')
    _, _, _, _, n, size, off, _ = struct.unpack('<IHHHHIIH', tail[i:i + 22])
    p = off - base; ents = {}
    while p < off - base + size:
        h = struct.unpack('<IHHHHHHIIIHHHHHII', tail[p:p + 46])
        name = tail[p + 46:p + 46 + h[10]].decode()
        ents[name] = dict(method=h[4], crc=h[7], comp=h[8], size=h[9], off=h[16])
        p += 46 + h[10] + h[11] + h[12]
    return ents


def member(e):
    lh = rng(e['off'], e['off'] + 29)
    sig, _, _, method, _, _, _, _, _, nlen, xlen = struct.unpack('<IHHHHHIIIHH', lh)
    assert sig == 0x04034b50
    start = e['off'] + 30 + nlen + xlen
    raw = rng(start, start + e['comp'] - 1)
    data = zlib.decompress(raw, -15) if e['method'] == 8 else raw
    assert len(data) == e['size'] and (zlib.crc32(data) & 0xffffffff) == e['crc'], 'size/CRC mismatch'
    return data


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/.cache/g24-100style')
    names = sys.argv[2:] or DEFAULT
    os.makedirs(out, exist_ok=True)
    ents = directory()
    rec = {}
    for n in names:
        data = member(ents[n])
        path = os.path.join(out, os.path.basename(n))
        open(path, 'wb').write(data)
        rec[os.path.basename(n)] = hashlib.sha256(data).hexdigest()
        print(rec[os.path.basename(n)], os.path.basename(n), len(data))
    json.dump(dict(url=URL, zip_bytes=TOTAL, files=rec), open(os.path.join(out, 'fetch_100style.json'), 'w'), indent=1)

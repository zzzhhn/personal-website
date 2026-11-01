#!/usr/bin/env python3
"""Fetch only four explicitly pinned CMU files, <=4 MiB each. No crawling or packages."""
import hashlib
import pathlib
import urllib.request

FILES = {
    '60.asf': 'bf20990ec1b9ed0adcb8227f3ebc2f502d0955cbf7499623a07d099d7b104c6c',
    '60_01.amc': 'd06e823aeb985cfa9382ac54c09a0ed4cd716e34e68a90f535065974dfc7201f',
    '141.asf': 'e32993b8079c0914ed4d865ad53f7b9646398808855233e6f650d4f4417df2bb',
    '141_12.amc': 'f3dc6f547373714baaa3b158de3d3a13400373a10b903022fefd8230f893ab77',
}
ROOT = pathlib.Path(__file__).resolve().parent / 'source'
ROOT.mkdir(exist_ok=True)
for name, expected in FILES.items():
    dest = ROOT / name
    if dest.exists() and hashlib.sha256(dest.read_bytes()).hexdigest() == expected:
        print(name, 'already verified')
        continue
    subject = name.split('_')[0].split('.')[0]
    with urllib.request.urlopen(f'https://mocap.cs.cmu.edu/subjects/{subject}/{name}', timeout=30) as response:
        data = response.read(4 * 1024 * 1024 + 1)
    if len(data) > 4 * 1024 * 1024 or hashlib.sha256(data).hexdigest() != expected:
        raise RuntimeError(f'{name}: size/hash mismatch; refusing replacement')
    dest.write_bytes(data)
    print(name, len(data), 'bytes, SHA-256 verified')

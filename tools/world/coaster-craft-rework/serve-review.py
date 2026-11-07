"""Serve the task build with immutable fallback to already delivered public assets."""
from argparse import ArgumentParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import re

parser = ArgumentParser()
parser.add_argument('candidate', type=Path)
parser.add_argument('baseline', type=Path)
parser.add_argument('pidfile', type=Path)
parser.add_argument('--port', type=int, default=4353)
args = parser.parse_args()
candidate, baseline = args.candidate.resolve(), args.baseline.resolve()
assert (candidate / 'world/index.html').is_file(), 'Missing task-built world HTML'
assert (baseline / 'world/index.html').is_file(), 'Missing frozen baseline root'


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *handler_args, **kwargs):
        super().__init__(*handler_args, directory=str(candidate), **kwargs)

    def end_headers(self):
        # Local preview roots are promoted in place behind a stable port. Never
        # keep an old HTML entry pointing at a different build's hashed assets.
        if self.path.split('?', 1)[0].endswith(('/', '.html', '/local-preview-version.json')):
            self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_head(self):
        self.range_remaining = None
        # Native long-form audio seeks with byte ranges, including after a Club
        # hand-off. The stdlib handler otherwise always replies with the full file.
        value = self.headers.get('Range', '')
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', value)
        path = Path(self.translate_path(self.path))
        if not match or self.headers.get('If-Range') or not path.is_file():
            return super().send_head()
        try:
            source = path.open('rb')
        except OSError:
            return super().send_head()
        stat = os.fstat(source.fileno())
        size = stat.st_size
        first, last = match.groups()
        if first:
            start, end = int(first), min(int(last), size - 1) if last else size - 1
        else:
            suffix = int(last) if last else 0
            start, end = max(0, size - suffix), size - 1
        if start > end or start >= size:
            source.close()
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return None
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(str(path)))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Last-Modified', self.date_time_string(stat.st_mtime))
        self.end_headers()
        source.seek(start)
        self.range_remaining = end - start + 1
        return source

    def copyfile(self, source, outputfile):
        try:
            if self.range_remaining is None:
                return super().copyfile(source, outputfile)
            remaining = self.range_remaining
            while remaining:
                data = source.read(min(65536, remaining))
                if not data:
                    break
                outputfile.write(data)
                remaining -= len(data)
        except (BrokenPipeError, ConnectionResetError):
            # A native media element may cancel a request on pause or disposal.
            pass

    def translate_path(self, path):
        result = Path(super().translate_path(path))
        if result.exists():
            return str(result)
        relative = result.relative_to(candidate)
        fallback = baseline / relative
        if relative.parts and relative.parts[0] != '_astro' and fallback.suffix not in {'.html', '.xml'} and fallback.is_file():
            return str(fallback)
        return str(result)


with ThreadingHTTPServer(('127.0.0.1', args.port), Handler) as server:
    args.pidfile.write_text(str(os.getpid()))
    try:
        server.serve_forever()
    finally:
        args.pidfile.unlink(missing_ok=True)

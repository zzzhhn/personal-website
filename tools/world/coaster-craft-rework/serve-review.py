"""Serve the task build with immutable fallback to already delivered public assets."""
from argparse import ArgumentParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os

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

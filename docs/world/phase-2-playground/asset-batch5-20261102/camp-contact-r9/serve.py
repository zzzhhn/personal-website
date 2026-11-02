"""Task-only local review server. No QA code is placed in the product output."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import json, re, sys

ROOT = Path(sys.argv[1]).resolve()
EVIDENCE = Path(__file__).resolve().parent
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 4359
ORIGIN = f'http://127.0.0.1:{PORT}'
(EVIDENCE / 'runtime').mkdir(exist_ok=True)

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split('?')[0]
        if path in ('/world', '/world/'):
            data = (ROOT / 'world/index.html').read_bytes().replace(
                b'</body>', b'<script src="/__qa.js"></script></body>')
            mime = 'text/html'
        elif path in ('/__qa.js', '/__views.json', '/__wheel-points.json'):
            data = (EVIDENCE / ('qa.js' if path.endswith('.js') else 'wheel-points.json' if path=='/__wheel-points.json' else 'views.json')).read_bytes()
            mime = 'text/javascript' if path.endswith('.js') else 'application/json'
        else:
            return super().do_GET()
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        name = self.path.removeprefix('/result/')
        if (not self.path.startswith('/result/')
                or not re.fullmatch('[A-Za-z0-9-]{1,90}', name)
                or self.headers.get('Origin') != ORIGIN):
            return self.send_error(403)
        count = int(self.headers.get('Content-Length', 0))
        if not 0 < count <= 2_000_000:
            return self.send_error(413)
        obj = json.loads(self.rfile.read(count))
        (EVIDENCE / 'runtime' / (name + '.json')).write_text(json.dumps(obj, indent=1))
        self.send_response(204)
        self.end_headers()

ThreadingHTTPServer(('127.0.0.1', PORT), partial(Handler, directory=str(ROOT))).serve_forever()

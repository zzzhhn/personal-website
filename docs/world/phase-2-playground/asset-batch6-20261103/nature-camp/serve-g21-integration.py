"""Local-only injection for one G21 night observation; build files stay untouched."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import json
import sys
HERE=Path(__file__).resolve().parent
BUILD=Path(sys.argv[1]);PORT=int(sys.argv[2]);RUNTIME=HERE/'runtime'
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(BUILD),**kwargs)
    def do_GET(self):
        req=urlparse(self.path)
        if req.path=='/__g21-integration.js':
            data=(HERE/'qa-g21-integration.js').read_bytes();mime='text/javascript'
        elif req.path=='/world/' and parse_qs(req.query).get('qa')==['1']:
            data=(BUILD/'world/index.html').read_text().replace('</body>','<script src="/__g21-integration.js"></script></body>').encode();mime='text/html'
        else:return super().do_GET()
        self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def do_POST(self):
        if self.path!='/result/b6-g21-integrated-night-snapshot-1':self.send_error(400);return
        target=RUNTIME/'b6-g21-integrated-night-snapshot-1.json'
        if target.exists():self.send_error(409,'Preserve original evidence');return
        n=int(self.headers.get('Content-Length',0))
        if not 0<n<200000:self.send_error(400);return
        target.write_text(json.dumps(json.loads(self.rfile.read(n)),indent=2)+'\n');self.send_response(200);self.end_headers();self.wfile.write(b'ok')
    def log_message(self,fmt,*args):
        if args and ('404' in str(args) or '500' in str(args)):super().log_message(fmt,*args)
ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()

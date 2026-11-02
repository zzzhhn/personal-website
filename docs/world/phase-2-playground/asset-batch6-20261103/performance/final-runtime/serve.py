"""One task-owned process, separate exact roots, one reusable browser test tab."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from pathlib import Path
from threading import Thread
import json,re,sys
HERE=Path(__file__).resolve().parent
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_GET(self):
        path=self.path.split('?')[0]
        if path in ('/world','/world/'):
            data=(Path(self.directory)/'world/index.html').read_bytes().replace(b'</body>',b'<script src="/__qa.js"></script></body>');mime='text/html'
        elif path=='/__qa.js': data=(HERE/'qa.js').read_bytes();mime='text/javascript'
        else: return super().do_GET()
        self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
    def do_POST(self):
        name=self.path.removeprefix('/result/');port=self.server.server_port
        if not self.path.startswith('/result/') or not re.fullmatch('[a-zA-Z0-9-]{1,90}',name) or self.headers.get('Origin')!=f'http://127.0.0.1:{port}':return self.send_error(403)
        n=int(self.headers.get('Content-Length',0))
        if not 0<n<=2000000:return self.send_error(413)
        obj=json.loads(self.rfile.read(n));target=HERE/'runtime';target.mkdir(exist_ok=True)
        (target/f'{port}-{name}.json').write_text(json.dumps(obj,indent=1));self.send_response(204);self.end_headers()
servers=[ThreadingHTTPServer(('127.0.0.1',port),partial(Handler,directory=root)) for port,root in [(4364,sys.argv[1]),(4365,sys.argv[2])]]
for s in servers:Thread(target=s.serve_forever,daemon=True).start()
print('Task server ready: candidate4364 baseline4365',flush=True)
import signal
signal.pause()

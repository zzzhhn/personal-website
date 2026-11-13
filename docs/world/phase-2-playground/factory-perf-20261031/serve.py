"""One loopback production fixture. argv: owned dist path, evidence run prefix."""
import base64, functools, json, re, sys
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
here=Path(__file__).resolve().parent
class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path=='/bench-probe.mjs':
            data=(here/'bench-probe.mjs').read_bytes()
            self.send_response(200);self.send_header('Content-Type','text/javascript');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
        else: super().do_GET()
    def do_POST(self):
        name=self.path.removeprefix('/result/')
        if not self.path.startswith('/result/') or not re.fullmatch(r'[a-z0-9-]{1,48}',name) or self.headers.get('Origin')!='http://127.0.0.1:4356':return self.send_error(403)
        n=int(self.headers.get('Content-Length','0'))
        if not 0<n<2000000:return self.send_error(413)
        obj=json.loads(self.rfile.read(n)); path=here/(sys.argv[2]+'-'+name)
        if 'jpeg' in obj:path.with_suffix('.jpg').write_bytes(base64.b64decode(obj['jpeg'].split(',',1)[1],validate=True))
        else:path.with_suffix('.json').write_text(json.dumps(obj,indent=1))
        self.send_response(204);self.end_headers()
ThreadingHTTPServer(('127.0.0.1',4356),functools.partial(Handler,directory=sys.argv[1])).serve_forever()

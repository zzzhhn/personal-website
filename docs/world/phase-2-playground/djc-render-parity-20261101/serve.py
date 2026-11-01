from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
import json,functools,re
import sys
root=Path(sys.argv[1] if len(sys.argv)>1 else 'dist').resolve()
evidence=Path(__file__).resolve().parent
class Handler(SimpleHTTPRequestHandler):
 def do_GET(self):
  if self.path.split('?')[0] in ['/world/','/world']:
   data=(root/'world/index.html').read_bytes().replace(b'</body>',b'<script src="/__qa.js"></script></body>')
   self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
  elif self.path=='/__qa.js':
   data=(evidence/'qa.js').read_bytes();self.send_response(200);self.send_header('Content-Type','text/javascript');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
  else:super().do_GET()
 def do_POST(self):
  name=self.path.removeprefix('/result/')
  if not self.path.startswith('/result/') or not re.fullmatch('[a-z0-9-]{1,70}',name) or self.headers.get('Origin')!='http://127.0.0.1:4356':return self.send_error(403)
  n=int(self.headers.get('Content-Length',0))
  if n>1000000:return self.send_error(413)
  obj=json.loads(self.rfile.read(n));(evidence/(name+'.json')).write_text(json.dumps(obj,indent=1))
  self.send_response(204);self.end_headers()
ThreadingHTTPServer(('127.0.0.1',4356),functools.partial(Handler,directory=str(root))).serve_forever()

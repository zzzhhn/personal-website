from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
import json,functools,re,sys
root=Path(sys.argv[1]).resolve();evidence=Path(__file__).resolve().parent
class Handler(SimpleHTTPRequestHandler):
 def do_GET(self):
  path=self.path.split('?')[0]
  if path in ['/world','/world/']:
   data=(root/'world/index.html').read_bytes().replace(b'</body>',b'<script src="/__qa.js"></script></body>');ctype='text/html'
  elif path in ['/__qa.js','/__views.json']:
   data=(evidence/('qa.js' if path.endswith('.js') else 'views.json')).read_bytes();ctype='text/javascript' if path.endswith('.js') else 'application/json'
  else:return super().do_GET()
  self.send_response(200);self.send_header('Content-Type',ctype);self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
 def do_POST(self):
  name=self.path.removeprefix('/result/')
  if not self.path.startswith('/result/') or not re.fullmatch('[a-z0-9-]{1,90}',name) or self.headers.get('Origin')!='http://127.0.0.1:4357':return self.send_error(403)
  n=int(self.headers.get('Content-Length',0))
  if n>2000000:return self.send_error(413)
  obj=json.loads(self.rfile.read(n));(evidence/'runtime'/(name+'.json')).write_text(json.dumps(obj,indent=1));self.send_response(204);self.end_headers()
ThreadingHTTPServer(('127.0.0.1',4357),functools.partial(Handler,directory=str(root))).serve_forever()

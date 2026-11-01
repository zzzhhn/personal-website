import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ENDPOINT = '/__alpha-pilot/results.json';
const loopbackAddress = address => address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
function localAuthority(authority, port) {
  if (typeof authority !== 'string') return false;
  try {
    const url = new URL(`http://${authority}`);
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && Number(url.port || '80') === port
      && !url.username && !url.password && url.pathname === '/';
  } catch { return false; }
}

/** Development-only: the file is read in place and never copied into public/ or dist/. */
export function alphaReplayPlugin({ resultsFile } = {}) {
  return {
    name: 'alpha-pilot-local-replay',
    apply: 'serve',
    configureServer(server) {
      const file = resultsFile ?? path.resolve(server.config.root, 'local/alpha-pilot/results.json');
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.split('?')[0] !== ENDPOINT) return next();
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        const respond = (code, status, message) => { res.statusCode = code; res.end(JSON.stringify({ status, message })); };
        const port = req.socket.localPort;
        if (!Number.isInteger(port) || !loopbackAddress(req.socket.remoteAddress) || !localAuthority(req.headers.host, port)) {
          return respond(403, 'local-only', 'Historical replay requires a loopback request on the actual development server port.');
        }
        if (req.headers.origin) {
          let origin;
          try { origin = new URL(req.headers.origin); } catch { return respond(403, 'local-only', 'Invalid origin.'); }
          if (origin.protocol !== 'http:' || !localAuthority(origin.host, port)) return respond(403, 'local-only', 'Local origin required.');
        }
        if (!['GET', 'HEAD'].includes(req.method)) {
          res.setHeader('Allow', 'GET, HEAD');
          return respond(405, 'method-not-allowed', 'Use GET or HEAD.');
        }
        try {
          if ((await stat(file)).size > 1_000_000) return respond(413, 'error', 'Local replay exceeds the bounded pilot size.');
          const content = await readFile(file, 'utf8');
          res.statusCode = 200;
          res.end(req.method === 'HEAD' ? '' : content);
        } catch (error) {
          if (error.code === 'ENOENT') return respond(404, 'missing', 'Generate local/alpha-pilot/results.json before replaying historical results.');
          return respond(503, 'error', 'Local historical replay could not be read.');
        }
      });
    },
  };
}

export default alphaReplayPlugin;

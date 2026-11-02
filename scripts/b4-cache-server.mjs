// Test-only production-artifact host. Never use this fixture as an application server.
import { createServer, request as proxyRequest } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';

if (process.env.NODE_ENV !== 'test' || process.env.B4_CACHE_FIXTURE !== 'synthetic-only') {
  throw new Error('B4 artifact fixture requires NODE_ENV=test and B4_CACHE_FIXTURE=synthetic-only');
}
const origin = 'http://127.0.0.1:4178';
const roots = {
  old: resolve(process.env.B4_OLD_WEB_DIST ?? '/workspace/RunSaturday-b4-old/apps/web/dist'),
  new: resolve(process.env.B4_NEW_WEB_DIST ?? '/workspace/RunSaturday-b4-gate/apps/web/dist'),
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const builds = {};
for (const [name, root] of Object.entries(roots)) {
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  const asset = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1];
  if (!asset?.startsWith('/assets/')) throw new Error(`Missing production module in ${root}`);
  builds[name] = { asset, digest: hash(await readFile(resolve(root, asset.slice(1)))), swDigest: hash(await readFile(resolve(root, 'sw.js'))) };
}
if (builds.old.digest === builds.new.digest || builds.old.swDigest === builds.new.swDigest) {
  throw new Error('OLD and NEW must be distinct production builds, including generated service workers');
}
let active = 'old';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    if (req.headers.host !== '127.0.0.1:4178' || !['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')) {
      res.writeHead(403).end(); return;
    }
    const url = new URL(req.url ?? '/', origin);
    if (url.pathname.startsWith('/__b4_fixture__/')) {
      // Control is local, same-origin and available only under the explicit synthetic guard above.
      if (req.headers.origin && req.headers.origin !== origin) { res.writeHead(403).end(); return; }
      if (url.pathname === '/__b4_fixture__/switch/new' && req.method === 'POST' && !url.search) active = 'new';
      else if (url.pathname !== '/__b4_fixture__/state' || req.method !== 'GET' || url.search) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ active, builds })); return;
    }
    if (url.pathname.startsWith('/api/')) {
      const proxy = proxyRequest({ hostname: '127.0.0.1', port: 3104, path: req.url, method: req.method,
        // Retain the browser Origin; changing it would bypass the API's CSRF checks.
        headers: { ...req.headers, host: '127.0.0.1:3104' } }, upstream => {
        res.writeHead(upstream.statusCode ?? 502, upstream.headers); upstream.pipe(res);
      });
      proxy.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      req.pipe(proxy); return;
    }
    if (!['GET', 'HEAD'].includes(req.method ?? '')) { res.writeHead(405).end(); return; }
    const root = roots[active];
    let file = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    if (!(await stat(file).catch(() => null))?.isFile()) {
      if (extname(url.pathname)) { res.writeHead(404).end(); return; }
      file = resolve(root, 'index.html');
    }
    res.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch { if (!res.headersSent) res.writeHead(500); res.end(); }
});
server.listen(4178, '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close(() => process.exit(0)));

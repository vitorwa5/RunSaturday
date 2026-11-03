import { createServer, request } from 'node:http';
import { spawn } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { checkDatabase } from './private-database.mjs';
import { syntheticAuthBody } from './private-policy.mjs';

try {
  if (process.env.NODE_ENV !== 'test' || process.env.APP_MODE !== 'beta' || process.env.EMAIL_TRANSPORT !== 'test' || process.env.OTP_TEST_INBOX_PATH !== '/run/private-inbox/otp.jsonl' || process.env.EMAIL_API_KEY || process.env.EMAIL_FROM || process.env.AUTH_ALLOW_INSECURE_LOCAL_HTTP !== 'false' || process.env.HOST !== '127.0.0.1' || process.env.PORT !== '3001' || !/^https:\/\//.test(process.env.AUTH_BASE_URL ?? '')) throw new Error('Private stage mode required');
  const dir = lstatSync('/run/private-inbox');
  const inbox = lstatSync('/run/private-inbox/otp.jsonl');
  if (!dir.isDirectory() || dir.isSymbolicLink() || (dir.mode & 0o777) !== 0o700 || !inbox.isFile() || inbox.isSymbolicLink() || (inbox.mode & 0o777) !== 0o600) throw new Error('Secure operator inbox required');
  await checkDatabase();
  const child = spawn(process.execPath, ['apps/api/dist/server.js'], { stdio: 'inherit' });
  const server = createServer(async (req, res) => {
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 1048576) throw new Error('body'); chunks.push(chunk); }
      const body = Buffer.concat(chunks);
      if (!syntheticAuthBody(req.method, req.url, body)) { res.writeHead(403, { 'content-type': 'application/json' }); res.end('{"error":{"code":"synthetic_only","message":"Use synthetic@example.test."}}'); return; }
      const headers = { ...req.headers }; delete headers.authorization;
      // The existing API trusts only this local gate. Never trust supplied IP headers.
      headers['x-forwarded-for'] = req.socket.remoteAddress;
      headers['x-forwarded-proto'] = 'https';
      const upstream = request({ host: '127.0.0.1', port: 3001, path: req.url, method: req.method, headers }, (response) => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
      upstream.on('error', () => { res.writeHead(503); res.end(); });
      upstream.end(body);
    } catch { res.writeHead(400); res.end(); }
  });
  child.on('exit', (code) => { server.close(); process.exit(code ?? 1); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); child.kill(signal); });
  server.listen(3002, '0.0.0.0');
} catch { console.error('Private stage startup refused; inspect isolation, fixture provenance and secure operator bindings.'); process.exitCode = 1; }

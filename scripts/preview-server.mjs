import http from 'node:http';
import path from 'node:path';
import { readFile, realpath } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };

export function createPreviewServer({ resolveDirectory, delayMs = 0, status = () => ({}) }) {
  return http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
    try {
      const url = new URL(request.url, 'http://preview.local');
      if (url.pathname === '/__preview/status') { response.writeHead(200, { 'Content-Type': types['.json'] }); response.end(request.method === 'HEAD' ? undefined : JSON.stringify(status())); return; }
      const decoded = decodeURIComponent(url.pathname);
      if (decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').some(part => part.startsWith('.'))) { response.writeHead(404); response.end(); return; }
      const directory = resolveDirectory(url.searchParams.get('v'));
      if (!directory) { response.writeHead(404); response.end(); return; }
      const base = await realpath(directory);
      const file = await realpath(path.join(base, decoded === '/' ? 'index.html' : decoded));
      if (!file.startsWith(`${base}${path.sep}`)) { response.writeHead(404); response.end(); return; }
      const raw = await readFile(file);
      // GitHub Pages compresses text responses; throttled measurements must see the same transfer sizes.
      const compress = /\.(html|js|css|json|svg|webmanifest)$/.test(file) && /\bgzip\b/.test(request.headers['accept-encoding'] ?? '');
      const body = compress ? gzipSync(raw) : raw;
      const send = () => { if (response.destroyed) return; response.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Content-Length': body.length, ...(compress ? { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } : {}) }); response.end(request.method === 'HEAD' ? undefined : body); };
      if (delayMs) { const timer = setTimeout(send, delayMs); response.once('close', () => clearTimeout(timer)); } else send();
    } catch (error) { response.writeHead(error instanceof URIError ? 400 : 404); response.end(); }
  });
}

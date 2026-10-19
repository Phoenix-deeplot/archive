#!/usr/bin/env node
'use strict';

// Dependency-free static server so the demo can be started with `npm start`.
// An HTTP origin is useful for browser Blob/canvas behaviour and avoids file://
// restrictions; it does not upload or persist the user's image.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname);
const port = Number.parseInt(process.env.PORT || '4173', 10);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.md': 'text/plain; charset=utf-8'
};

const server = http.createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method || '')) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Method not allowed');
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname); }
  catch { response.writeHead(400); response.end('Bad request'); return; }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^[/\\]+/, '');
  const filename = path.resolve(root, relative);
  if (filename !== root && !filename.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403); response.end('Forbidden'); return;
  }
  fs.stat(filename, (statError, stats) => {
    if (statError || !stats.isFile()) { response.writeHead(404); response.end('Not found'); return; }
    const headers = {
      'Content-Type': types[path.extname(filename).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Opener-Policy': 'same-origin'
    };
    response.writeHead(200, headers);
    if (request.method === 'HEAD') { response.end(); return; }
    fs.createReadStream(filename).on('error', () => response.destroy()).pipe(response);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Image-to-SVG Demo is running at http://127.0.0.1:${port}`);
  console.log('All tracing and fidelity analysis stay in the browser on this machine.');
});

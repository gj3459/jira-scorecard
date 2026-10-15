'use strict';

/**
 * Zero-dependency static server for the scorecard.
 * - Serves files from ./public (index.html at "/").
 * - Binds 0.0.0.0 (never 127.0.0.1 inside a container).
 * - Listens on the injected PORT (usually 8080) AND your assigned wizard port.
 * - Malformed URLs return 400 instead of crashing.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

// Injected by Rocket Deploy (usually 8080).
const INJECTED_PORT = Number(process.env.PORT) || 8080;
// >>> CHANGE 3139 TO THE PORT YOU ENTER IN THE WIZARD (Step 4) <<<
const WIZARD_PORT = Number(process.env.WIZARD_PORT) || 3139;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return send(res, 405, 'Method Not Allowed');
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (err) {
    return send(res, 400, 'Bad Request');
  }
  if (pathname.includes('\0')) return send(res, 400, 'Bad Request');

  if (pathname === '/healthz') return send(res, 200, 'ok');
  if (pathname.endsWith('/')) pathname += 'index.html';

  // Block path traversal (e.g. /../server.js)
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    return send(res, 403, 'Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, 'Not Found');

    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') return res.end();

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
}

// Listen on both ports (deduplicated if they happen to be the same).
const ports = [...new Set([INJECTED_PORT, WIZARD_PORT])];
const servers = [];
let listening = 0;
let failed = 0;

for (const port of ports) {
  const server = http.createServer(handler);
  server.on('error', (err) => {
    console.error(`Could not listen on ${HOST}:${port} - ${err.message}`);
    failed += 1;
    if (failed === ports.length && listening === 0) process.exit(1);
  });
  server.listen(port, HOST, () => {
    listening += 1;
    console.log(`Scorecard server listening on http://${HOST}:${port}`);
  });
  servers.push(server);
}

// Safety nets: log instead of silently dying.
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));

// Graceful shutdown on redeploy/stop.
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down.');
  servers.forEach((s) => s.close());
  setTimeout(() => process.exit(0), 3000).unref();
});

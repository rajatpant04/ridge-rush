import { createServer } from 'node:http';
import { readFile } from 'node:fs';
import { resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { handleMultiplayerApi } from './room-server.mjs';

const root = process.cwd();
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (request, response) => {
  try {
    if (request.url?.startsWith('/api/')) {
      const handled = await handleMultiplayerApi(request, response);
      if (handled) return;
    }
  } catch (error) {
    console.error('Multiplayer request failed:', error.message);
    if (!response.headersSent) response.writeHead(500, {'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify({error:'Multiplayer service error.'}));
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }

  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = resolve(root, relative);
  if (!file.startsWith(root + sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  readFile(file, (error, data) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('File unavailable');
      return;
    }
    response.writeHead(200, {
      'Content-Type': types[file.slice(file.lastIndexOf('.'))] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    }).end(request.method === 'HEAD' ? undefined : data);
  });
});

// Keep a stable origin so browser localStorage (the player's save file) is
// available every time the launcher starts the game.
const PORT = Number(process.env.PORT) || 58012;
const HOST = process.env.PORT ? '0.0.0.0' : '127.0.0.1';
server.on('error', async error => {
  if (error.code === 'EADDRINUSE') {
    const url = `http://127.0.0.1:${PORT}/`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      const page = await response.text();
      if (response.ok && /<title>Ridge Rush\b/i.test(page) && page.includes('id="environmentSelect"')) {
        console.log(`Ridge Rush is already running at ${url}`);
        if (process.argv.includes('--open')) spawn('cmd.exe', ['/d', '/c', 'start', '', url], {detached:true,stdio:'ignore',windowsHide:true}).unref();
        return;
      }
    } catch {}
    console.error(`Ridge Rush could not start: port ${PORT} belongs to another app. Close it, then run this launcher again. It did not open that app.`);
  } else {
    console.error('Ridge Rush could not start:', error.message);
  }
  process.exitCode = 1;
});
server.listen(PORT, HOST, () => {
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/`;
  console.log(`Ridge Rush is running at ${url}`);

  if (process.argv.includes('--open')) {
    const opener = spawn('cmd.exe', ['/d', '/c', 'start', '', url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    opener.unref();
  }
});

#!/usr/bin/env node
/**
 * HoldFast WebSocket Relay Server
 *
 * A minimal pub/sub broker. Boat apps publish position/alarm updates
 * keyed by a 4-digit code. Watch clients subscribe to the same code
 * and receive live mirrored updates.
 *
 * Usage:
 *   npm install ws
 *   node server/relay.js
 *
 * Deploy to any Node.js host (Railway, Fly.io, DigitalOcean, etc.)
 * Update RELAY_WS_URL and RELAY_BASE_URL in the app source.
 */

const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 8080;

// ─── HTTP server (serves /watch page and health check) ────────────────────────

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health check
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  // Watch page
  if (url.pathname === '/watch') {
    const code = url.searchParams.get('code') ?? '';
    const watchPagePath = path.join(__dirname, 'watch.html');
    if (fs.existsSync(watchPagePath)) {
      let html = fs.readFileSync(watchPagePath, 'utf8');
      html = html.replace('__CODE__', code);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } else {
      res.writeHead(404);
      res.end('Watch page not found');
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// ─── WebSocket server ─────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server: httpServer });

// Map: code -> Set<WebSocket>  (watchers only)
const watchers = new Map();
// Map: code -> WebSocket  (boat connection, one per code)
const boats = new Map();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get('code');
  const role = url.searchParams.get('role') ?? 'watch';

  if (!code || !/^\d{4}$/.test(code)) {
    ws.close(4000, 'Invalid or missing code');
    return;
  }

  if (role === 'boat') {
    // ── Boat connection ────────────────────────────────────────────────
    boats.set(code, ws);
    console.log(`[Boat] Connected  code=${code}`);

    ws.on('message', (data) => {
      // Broadcast to all watchers on this code
      const clients = watchers.get(code);
      if (!clients) return;
      for (const watcher of clients) {
        if (watcher.readyState === WebSocket.OPEN) {
          watcher.send(data);
        }
      }
    });

    ws.on('close', () => {
      if (boats.get(code) === ws) boats.delete(code);
      console.log(`[Boat] Disconnected  code=${code}`);
    });
  } else {
    // ── Watch connection ───────────────────────────────────────────────
    if (!watchers.has(code)) watchers.set(code, new Set());
    watchers.get(code).add(ws);
    console.log(`[Watch] Connected  code=${code}  total=${watchers.get(code).size}`);

    ws.on('close', () => {
      watchers.get(code)?.delete(ws);
      if (watchers.get(code)?.size === 0) watchers.delete(code);
      console.log(`[Watch] Disconnected  code=${code}`);
    });
  }

  ws.on('error', (err) => {
    console.warn(`[WS] Error code=${code} role=${role}:`, err.message);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`HoldFast relay running on port ${PORT}`);
  console.log(`  Watch URL: http://localhost:${PORT}/watch?code=XXXX`);
  console.log(`  Health:    http://localhost:${PORT}/health`);
});

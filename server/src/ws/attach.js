import { WebSocketServer } from 'ws';

import { bindConnection, dispatchMessage, onConnectionClosed } from '../services/room-store.js';

console.log(
  `[diag boot] attach.js loaded at ${new Date().toISOString()} — dispatchMessage typeof=${typeof dispatchMessage}`,
);

const WS_PATH = '/ws';

/**
 * @param {import('node:http').Server} httpServer
 */
export function attachWebSocket(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: WS_PATH });

  wss.on('connection', (ws) => {
    const playerId = bindConnection(ws);
    ws.send(JSON.stringify({ type: 'welcome', playerId }));

    ws.on('message', (raw) => {
      let text;
      try {
        text = typeof raw === 'string' ? raw : raw.toString();
      } catch {
        text = '';
      }
      /** Fire-and-forget — dispatch is async but ws.on doesn't await. */
      void dispatchMessage(ws, text).catch((err) => {
        console.error('[ws] dispatch error:', err);
      });
    });

    ws.on('close', () => {
      void onConnectionClosed(ws).catch((err) => {
        console.error('[ws] close handler error:', err);
      });
    });
  });

  return wss;
}

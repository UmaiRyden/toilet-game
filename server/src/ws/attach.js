import { WebSocketServer } from 'ws';

import { bindConnection, dispatchMessage, onConnectionClosed } from '../services/room-store.js';

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
      dispatchMessage(ws, text);
    });

    ws.on('close', () => {
      onConnectionClosed(ws);
    });
  });

  return wss;
}

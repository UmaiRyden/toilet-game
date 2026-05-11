import { getListenPort } from './config/env.js';
import { createHttpServer } from './http/create-server.js';
import { listRooms, sweepStaleEmptyRooms } from './services/room-store.js';
import { attachWebSocket } from './ws/attach.js';

const STALE_SWEEP_MS = 60_000;

export function start() {
  const port = getListenPort();

  const server = createHttpServer({ listRooms });
  attachWebSocket(server);

  const sweepTimer = setInterval(() => sweepStaleEmptyRooms(), STALE_SWEEP_MS);

  server.listen(port, () => {
    console.log(`[server] http://localhost:${port}/health  GET /rooms  ws://localhost:${port}/ws`);
  });

  server.on('close', () => clearInterval(sweepTimer));

  return server;
}

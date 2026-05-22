import { getListenPort } from './config/env.js';
import { runStartupMigration } from './db/migrate.js';
import { createHttpServer } from './http/create-server.js';
import { getLeaderboard } from './services/matchHistory.js';
import { listRooms, reconcileOnStartup, sweepStaleEmptyRooms } from './services/room-store.js';
import { attachWebSocket } from './ws/attach.js';

const STALE_SWEEP_MS = 60_000;

export async function start() {
  const port = getListenPort();

  /** Drop / repair rooms left behind by the previous process before accepting traffic. */
  try {
    await reconcileOnStartup();
  } catch (err) {
    console.error('[server] reconcile failed:', err);
  }

  /** Ensure Postgres schema exists. Non-fatal — graceful degradation if pg is offline. */
  await runStartupMigration();

  const server = createHttpServer({ listRooms, getLeaderboard });
  attachWebSocket(server);

  const sweepTimer = setInterval(() => {
    void sweepStaleEmptyRooms().catch((err) => console.error('[server] sweep failed:', err));
  }, STALE_SWEEP_MS);

  server.listen(port, () => {
    console.log(`[server] http://localhost:${port}/health  GET /rooms  GET /leaderboard  ws://localhost:${port}/ws`);
  });

  server.on('close', () => clearInterval(sweepTimer));

  return server;
}

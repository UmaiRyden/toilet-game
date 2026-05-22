import http from 'node:http';

const JSON_CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

/**
 * @param {{
 *   listRooms: () => Promise<unknown[]> | unknown[],
 *   getLeaderboard?: (limit?: number) => Promise<unknown[]>,
 * }} deps
 * @returns {import('node:http').Server}
 */
export function createHttpServer({ listRooms, getLeaderboard }) {
  return http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (req.url === '/health' || req.url?.startsWith('/health?')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'toiletwifhat-server' }));
      return;
    }

    if (req.method === 'GET' && (req.url === '/rooms' || req.url?.startsWith('/rooms?'))) {
      try {
        const rooms = await listRooms();
        res.writeHead(200, JSON_CORS_HEADERS);
        res.end(JSON.stringify(rooms));
      } catch (err) {
        console.error('[http] /rooms failed:', err);
        res.writeHead(500, JSON_CORS_HEADERS);
        res.end(JSON.stringify({ error: 'rooms_unavailable' }));
      }
      return;
    }

    if (
      req.method === 'GET' &&
      (req.url === '/leaderboard' || req.url?.startsWith('/leaderboard?'))
    ) {
      if (!getLeaderboard) {
        res.writeHead(503, JSON_CORS_HEADERS);
        res.end(JSON.stringify({ error: 'leaderboard_unavailable' }));
        return;
      }
      try {
        const url = new URL(req.url ?? '/leaderboard', 'http://localhost');
        const limitParam = url.searchParams.get('limit');
        const limit = limitParam ? Number(limitParam) : 20;
        const rows = await getLeaderboard(Number.isFinite(limit) ? limit : 20);
        res.writeHead(200, JSON_CORS_HEADERS);
        res.end(JSON.stringify({ players: rows }));
      } catch (err) {
        console.error('[http] /leaderboard failed:', err);
        res.writeHead(200, JSON_CORS_HEADERS);
        /** Graceful degrade — empty leaderboard rather than client-facing error. */
        res.end(JSON.stringify({ players: [] }));
      }
      return;
    }

    res.writeHead(404);
    res.end();
  });
}

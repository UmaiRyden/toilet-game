import http from 'node:http';

/**
 * @param {{ listRooms: () => unknown[] }} deps
 * @returns {import('node:http').Server}
 */
export function createHttpServer({ listRooms }) {
  return http.createServer((req, res) => {
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
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify(listRooms()));
      return;
    }

    res.writeHead(404);
    res.end();
  });
}

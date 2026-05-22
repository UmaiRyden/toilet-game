import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

/** Dev defaults when env is unset (must match `PORT` / `VITE_BACKEND_ORIGIN` in `.env.example`). */
const DEFAULT_DEV_SERVER_PORT = 3000;
const DEFAULT_BACKEND_ORIGIN = 'http://127.0.0.1:8080';

/** Turn `http(s)://host:port` into `ws(s)://host:port` for the dev proxy `ws` option. */
function httpOriginToWsProxyTarget(httpOrigin: string): string {
  const u = new URL(httpOrigin);
  const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${u.host}`;
}

function parseDevPort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_DEV_SERVER_PORT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || n > 65535) return DEFAULT_DEV_SERVER_PORT;
  return n;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendOrigin = env.VITE_BACKEND_ORIGIN?.trim() || DEFAULT_BACKEND_ORIGIN;
  const devPort = parseDevPort(env.VITE_DEV_SERVER_PORT);

  return {
    plugins: [
      react(),
      tailwindcss(),
      nodePolyfills({
        globals: { Buffer: true, global: true, process: true },
      }),
    ],
    base: './',
    server: {
      host: true,
      port: devPort,
      /** Forwards browser requests to the Node server (`PORT` / `VITE_BACKEND_ORIGIN`). */
      proxy: {
        '/health': { target: backendOrigin, changeOrigin: true },
        '/rooms': { target: backendOrigin, changeOrigin: true },
        '/leaderboard': { target: backendOrigin, changeOrigin: true },
        '/ws': {
          target: httpOriginToWsProxyTarget(backendOrigin),
          ws: true,
          /** Quiet benign teardown noise when the browser or upstream closes the socket mid-flight (common in dev). */
          configure(proxy) {
            proxy.on('error', (err: NodeJS.ErrnoException) => {
              const c = err?.code;
              if (c === 'ECONNRESET' || c === 'ECONNABORTED' || c === 'EPIPE' || c === 'ECONNCLOSED') return;
              console.error('[vite] /ws proxy:', err);
            });
          },
        },
      },
    },
  };
});

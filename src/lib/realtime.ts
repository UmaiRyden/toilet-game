/**
 * Resolves the realtime WebSocket URL.
 *
 * Priority:
 *   1. `VITE_WS_URL` — explicit override (set in .env per environment).
 *   2. Same-origin fallback — `ws(s)://<current-host>/ws`, which the Vite dev
 *      proxy forwards to the backend in dev, and which matches a same-origin
 *      deployment in prod.
 */
export function getRealtimeWsUrl(): string {
  const fromEnv = import.meta.env.VITE_WS_URL?.trim();
  if (fromEnv) return fromEnv;

  if (typeof window !== 'undefined' && window.location) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }

  /** SSR / non-browser fallback — should not happen for this client-only app. */
  return 'ws://127.0.0.1:8080/ws';
}

/**
 * WebSocket URL for realtime protocol.
 * - In dev, set `VITE_WS_URL=ws://127.0.0.1:<PORT>/ws` (same as backend) to skip Vite’s WS proxy and avoid noisy proxy socket errors on reconnect.
 * - Omit `VITE_WS_URL` to use same-origin `/ws` (Vite proxies to `VITE_BACKEND_ORIGIN`).
 */
export function getRealtimeWsUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL as string | undefined;
  if (explicit?.trim()) return explicit.trim();
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

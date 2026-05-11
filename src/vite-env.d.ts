/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Vite dev server port (see `vite.config.ts`). */
  readonly VITE_DEV_SERVER_PORT?: string;
  /** HTTP origin of the API + WebSocket server — used only by the Vite dev proxy. */
  readonly VITE_BACKEND_ORIGIN?: string;
  /** Optional public URL of the SPA (invite links, redirects). Defaults to `window.location.origin`. */
  readonly VITE_APP_ORIGIN?: string;
  /**
   * Browser → REST base. Leave empty in dev to use same-origin `/rooms` (proxied).
   * Example production: `https://api.example.com`
   */
  readonly VITE_API_URL?: string;
  /**
   * Browser → WebSocket URL. Leave empty in dev to use same-origin `/ws` (proxied).
   * Example: `wss://api.example.com/ws`
   */
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

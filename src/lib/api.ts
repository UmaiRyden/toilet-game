import type { RoomSummary } from '../types/realtime';

export type { RoomSummary };

/**
 * Resolves the REST API base URL.
 *
 * Priority:
 *   1. `VITE_BACKEND_ORIGIN` — explicit override (set in .env per environment).
 *   2. Same-origin — empty string, so paths are passed through unchanged and
 *      the Vite dev proxy (or a same-origin prod deploy) forwards them.
 */
export function getApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_BACKEND_ORIGIN?.trim();
  return fromEnv || '';
}

/** Absolute path on `getApiBaseUrl()` or relative to the current origin when base is empty. */
export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const p = path.startsWith('/') ? path : `/${path}`;
  if (!base) return p;
  return `${base}${p}`;
}

export async function fetchRooms(): Promise<RoomSummary[]> {
  const res = await fetch(apiUrl('/rooms'));
  if (!res.ok) throw new Error(`Failed to load rooms (${res.status})`);
  return res.json() as Promise<RoomSummary[]>;
}

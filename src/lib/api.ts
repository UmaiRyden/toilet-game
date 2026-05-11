import type { RoomSummary } from '../types/realtime';

export type { RoomSummary };

/** REST base URL for the game server. Empty string = same origin (use Vite proxy in dev). */
export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_URL as string | undefined;
  return raw?.trim().replace(/\/$/, '') ?? '';
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

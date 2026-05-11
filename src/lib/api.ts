import type { RoomSummary } from '../types/realtime';

export type { RoomSummary };

export function getApiBaseUrl(): string {
  return 'https://toilet-game-production-3e7a.up.railway.app';
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

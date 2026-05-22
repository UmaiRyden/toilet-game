const STORAGE_KEY = 'toilet:activeMatchId';
const ROOM_KEY = 'toilet:activeMatchRoomId';

export function getActiveMatchId(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const v = sessionStorage.getItem(STORAGE_KEY)?.trim();
    return v || null;
  } catch {
    return null;
  }
}

export function setActiveMatchId(matchId: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, matchId.trim());
  } catch {
    /* ignore */
  }
}

export function clearActiveMatchId(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Stores the room that hosts the active match so we can reconnect after a page refresh. */
export function getActiveMatchRoomId(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const v = sessionStorage.getItem(ROOM_KEY)?.trim();
    return v || null;
  } catch {
    return null;
  }
}

export function setActiveMatchRoomId(roomId: string): void {
  try {
    sessionStorage.setItem(ROOM_KEY, roomId.trim());
  } catch {
    /* ignore */
  }
}

export function clearActiveMatchRoomId(): void {
  try {
    sessionStorage.removeItem(ROOM_KEY);
  } catch {
    /* ignore */
  }
}

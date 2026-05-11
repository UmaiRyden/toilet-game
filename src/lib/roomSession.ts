/** Key for tab-scoped "you are seated in this room" session (no DB — same browser tab only). */
const STORAGE_KEY = 'toilet:activeRoomId';

export function getActiveRoomId(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const v = sessionStorage.getItem(STORAGE_KEY)?.trim();
    return v || null;
  } catch {
    return null;
  }
}

export function setActiveRoomId(roomId: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, roomId.trim());
  } catch {
    /* quota / private mode */
  }
}

export function clearActiveRoomId(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

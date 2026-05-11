const STORAGE_KEY = 'toilet:activeMatchId';

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

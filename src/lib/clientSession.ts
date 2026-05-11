const STORAGE_KEY = 'twfh_client_session';

/** Stable id per browser profile — used so “Create room” does not spawn duplicate empty tables. */
export function getClientSessionId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

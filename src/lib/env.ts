/** Public web app origin (no trailing slash). Useful for invite links when `VITE_APP_ORIGIN` is set (e.g. staging URL). */
export function getAppOrigin(): string {
  const explicit = import.meta.env.VITE_APP_ORIGIN as string | undefined;
  if (explicit?.trim()) return explicit.trim().replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

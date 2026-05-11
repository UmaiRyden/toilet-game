import { useLayoutEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { getActiveMatchId } from '../lib/matchSession';
import { getActiveRoomId } from '../lib/roomSession';

/**
 * Locks navigation while seated in a room or while a paid match is active (after countdown).
 * Cleared by Leave room, match resolution, or explicit disconnect (see `GameRealtimeContext`).
 */
export function ActiveRoomRedirect() {
  const location = useLocation();
  const navigate = useNavigate();

  useLayoutEffect(() => {
    const path = location.pathname;

    const matchLock = getActiveMatchId();
    if (matchLock) {
      if (path === `/match/${matchLock}` || path.startsWith(`/match/${matchLock}/`)) return;
      navigate(`/match/${encodeURIComponent(matchLock)}`, { replace: true });
      return;
    }

    const roomLock = getActiveRoomId();
    if (!roomLock) return;

    if (path === `/room/${roomLock}` || path.startsWith(`/room/${roomLock}/`)) return;

    if (path.startsWith('/match/')) return;

    navigate(`/room/${encodeURIComponent(roomLock)}`, { replace: true });
  }, [location.pathname, navigate]);

  return null;
}

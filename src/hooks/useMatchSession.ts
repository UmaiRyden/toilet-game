import { useEffect, useState } from 'react';

import { clearActiveMatchId } from '../lib/matchSession';
import { clearActiveRoomId } from '../lib/roomSession';
import { getRealtimeWsUrl } from '../lib/realtime';

type VerifyState = 'checking' | 'verified' | 'failed' | 'skipped';

const TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1_500;

/**
 * Confirms with the server that this matchId is still live.
 * Retries once on timeout/error before giving up.
 */
export function useMatchSession(matchId: string | undefined) {
  const [verifyState, setVerifyState] = useState<VerifyState>(() => {
    if (!matchId || matchId === 'demo' || matchId.startsWith('dev-')) return 'skipped';
    return 'checking';
  });

  useEffect(() => {
    if (!matchId || matchId === 'demo' || matchId.startsWith('dev-')) {
      setVerifyState('skipped');
      return;
    }

    setVerifyState('checking');

    let cancelled = false;
    let attempts = 0;
    let ws: WebSocket | null = null;
    let timer: number | null = null;

    function attempt() {
      if (cancelled) return;

      const currentWs = new WebSocket(getRealtimeWsUrl());
      ws = currentWs;

      const finish = (success: boolean, hardFail = false) => {
        if (cancelled || ws !== currentWs) return;
        // Null handlers before close so onclose doesn't re-enter
        currentWs.onclose = null;
        currentWs.onerror = null;
        currentWs.onmessage = null;
        if (timer !== null) { window.clearTimeout(timer); timer = null; }
        try { currentWs.close(); } catch { /* noop */ }
        ws = null;

        if (success) { setVerifyState('verified'); return; }

        attempts++;
        if (!hardFail && attempts < MAX_ATTEMPTS) {
          timer = window.setTimeout(attempt, RETRY_DELAY_MS);
        } else {
          setVerifyState('failed');
        }
      };

      timer = window.setTimeout(() => finish(false), TIMEOUT_MS);
      currentWs.onerror = () => finish(false);
      currentWs.onclose = () => { if (ws === currentWs) finish(false); };

      currentWs.onmessage = (ev) => {
        if (cancelled) return;
        let msg: Record<string, unknown>;
        try { msg = JSON.parse(ev.data as string) as Record<string, unknown>; }
        catch { return; }

        const type = msg.type as string | undefined;
        if (type === 'welcome') {
          currentWs.send(JSON.stringify({ type: 'join_match', matchId }));
        }
        if (type === 'match_joined') {
          finish(true);
        }
        if (type === 'session_invalid') {
          // Server says match is dead — clear locks, no retry
          clearActiveMatchId();
          clearActiveRoomId();
          finish(false, /* hardFail */ true);
        }
        if (type === 'error') {
          finish(false);
        }
      };
    }

    attempt();

    return () => {
      cancelled = true;
      if (timer !== null) { window.clearTimeout(timer); timer = null; }
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        try { ws.close(); } catch { /* noop */ }
        ws = null;
      }
    };
  }, [matchId]);

  return verifyState;
}

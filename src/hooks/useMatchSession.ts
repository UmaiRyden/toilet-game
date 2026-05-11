import { useEffect, useState } from 'react';

import { getRealtimeWsUrl } from '../lib/realtime';

type VerifyState = 'checking' | 'verified' | 'failed' | 'skipped';

/**
 * Confirms with the server that this `matchId` was issued here (not dev-skip).
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
    let done = false;
    const ws = new WebSocket(getRealtimeWsUrl());

    const finishFail = () => {
      if (done) return;
      done = true;
      setVerifyState('failed');
    };

    const timer = window.setTimeout(() => {
      if (!done) {
        finishFail();
        ws.close();
      }
    }, 8000);

    ws.onerror = finishFail;
    ws.onclose = () => {
      clearTimeout(timer);
      if (!done) finishFail();
    };

    ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data as string) as Record<string, unknown>;
      } catch {
        return;
      }
      const type = msg.type as string | undefined;
      if (type === 'welcome') {
        ws.send(JSON.stringify({ type: 'join_match', matchId }));
      }
      if (type === 'match_joined') {
        done = true;
        clearTimeout(timer);
        setVerifyState('verified');
        ws.close();
      }
      if (type === 'error') {
        finishFail();
        ws.close();
      }
    };

    return () => {
      clearTimeout(timer);
      ws.close();
    };
  }, [matchId]);

  return verifyState;
}

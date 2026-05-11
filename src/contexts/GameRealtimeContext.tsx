import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { getClientSessionId } from '../lib/clientSession';
import { getRealtimeWsUrl } from '../lib/realtime';
import { clearActiveMatchId, setActiveMatchId } from '../lib/matchSession';
import { clearActiveRoomId, setActiveRoomId } from '../lib/roomSession';
import type { PlatformSpec, RoomPlayer, RoomStatePayload } from '../types/realtime';

const ROOM_JOIN_ERRORS = new Set(['ROOM_NOT_FOUND', 'ROOM_FULL', 'NOT_IN_ROOM']);

/** Visible victory/defeat overlay window between game_over and navigation. */
const RESOLVE_NAV_DELAY_MS = 3000;

export type GameMessage = Record<string, unknown> & { type: string };

type GameRealtimeContextValue = {
  playerId: string | null;
  roomState: RoomStatePayload | null;
  socketStatus: 'connecting' | 'open' | 'closed';
  protocolError: string | null;
  toggleReady: () => void;
  exitToLobby: () => void;
  /** Surrender current match — awards pot to opponent per server rules. */
  sendForfeit: (matchId: string) => void;
  /** Dev-only escape hatch (closes socket + clears session locks). */
  forceDisconnectToLobby: () => void;
  /** Leave room / release WS without navigating (e.g. dev skip link handles navigation). */
  disconnectSocket: () => void;
  /** Reuse the room-lifecycle socket for in-match game traffic. No-op if the socket isn't open. */
  sendGameMessage: (payload: Record<string, unknown>) => void;
  /** Subscribe to incoming game_* messages. Returns an unsubscribe handle. */
  subscribeGameMessages: (handler: (msg: GameMessage) => void) => () => void;
  /** Server-shared platform layout for the active match (null in demo / between matches). */
  matchPlatforms: PlatformSpec[] | null;
};

function parsePlatforms(raw: unknown): PlatformSpec[] | null {
  if (!Array.isArray(raw)) return null;
  const out: PlatformSpec[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const x = Number(obj.xFraction);
    const y = Number(obj.yFraction);
    const w = Number(obj.wFraction);
    if (![x, y, w].every(Number.isFinite)) continue;
    out.push({ xFraction: x, yFraction: y, wFraction: w });
  }
  return out.length > 0 ? out : null;
}

const GameRealtimeContext = createContext<GameRealtimeContextValue | null>(null);

export function GameRealtimeProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  const wsRef = useRef<WebSocket | null>(null);
  const roomStateRef = useRef<RoomStatePayload | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const joinedRoomIdRef = useRef<string | null>(null);
  const navigatingToMatchRef = useRef(false);
  const gameListenersRef = useRef<Set<(msg: GameMessage) => void>>(new Set());

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomStatePayload | null>(null);
  const [socketStatus, setSocketStatus] = useState<'connecting' | 'open' | 'closed'>('closed');
  const [protocolError, setProtocolError] = useState<string | null>(null);
  const [matchPlatforms, setMatchPlatforms] = useState<PlatformSpec[] | null>(null);

  roomStateRef.current = roomState;

  const exitToLobby = useCallback(() => {
    clearActiveRoomId();
    clearActiveMatchId();
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'leave_room' }));
    }
    ws?.close();
    wsRef.current = null;
    joinedRoomIdRef.current = null;
    setRoomState(null);
    setPlayerId(null);
    setMatchPlatforms(null);
    playerIdRef.current = null;
    navigate('/lobby');
  }, [navigate]);

  const forceDisconnectToLobby = useCallback(() => {
    clearActiveRoomId();
    clearActiveMatchId();
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'leave_room' }));
    }
    ws?.close();
    wsRef.current = null;
    joinedRoomIdRef.current = null;
    setRoomState(null);
    setPlayerId(null);
    setMatchPlatforms(null);
    playerIdRef.current = null;
    navigate('/lobby');
  }, [navigate]);

  const disconnectSocket = useCallback(() => {
    clearActiveRoomId();
    clearActiveMatchId();
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'leave_room' }));
    }
    ws?.close();
    wsRef.current = null;
    joinedRoomIdRef.current = null;
    setRoomState(null);
    setPlayerId(null);
    setMatchPlatforms(null);
    playerIdRef.current = null;
  }, []);

  const sendForfeit = useCallback((matchId: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'forfeit_match', matchId }));
  }, []);

  const sendGameMessage = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
  }, []);

  const subscribeGameMessages = useCallback((handler: (msg: GameMessage) => void) => {
    gameListenersRef.current.add(handler);
    return () => {
      gameListenersRef.current.delete(handler);
    };
  }, []);

  useEffect(() => {
    const path = location.pathname;
    const roomM = /^\/room\/([^/]+)/.exec(path);
    const matchM = /^\/match\/([^/]+)/.exec(path);

    if (matchM && wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    if (matchM && !wsRef.current) {
      setSocketStatus((s) => (s === 'open' ? s : 'closed'));
      return;
    }

    if (!roomM) {
      return;
    }

    const roomId = decodeURIComponent(roomM[1]);

    if (wsRef.current?.readyState === WebSocket.OPEN && joinedRoomIdRef.current === roomId) {
      return;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setSocketStatus('connecting');
    setProtocolError(null);
    setRoomState(null);
    setPlayerId(null);
    setMatchPlatforms(null);
    playerIdRef.current = null;

    const ws = new WebSocket(getRealtimeWsUrl());
    wsRef.current = ws;
    joinedRoomIdRef.current = roomId;

    ws.onopen = () => {
      setSocketStatus('open');
      ws.send(JSON.stringify({ type: 'join_room', roomId, clientSessionId: getClientSessionId() }));
    };
    ws.onclose = () => {
      setSocketStatus('closed');
      if (wsRef.current === ws) {
        wsRef.current = null;
        joinedRoomIdRef.current = null;
      }
    };
    ws.onerror = () => setSocketStatus('closed');

    ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data as string) as Record<string, unknown>;
      } catch {
        return;
      }
      const type = msg.type as string | undefined;

      if (type === 'welcome') {
        const pid = msg.playerId as string | undefined;
        if (pid) {
          playerIdRef.current = pid;
          setPlayerId(pid);
        }
      }

      if (type === 'room_state') {
        const self =
          typeof msg.selfPlayerId === 'string' ? msg.selfPlayerId.trim() : '';
        if (self) {
          playerIdRef.current = self;
          setPlayerId((prev) => (prev === self ? prev : self));
        }
        const rid = typeof msg.roomId === 'string' ? msg.roomId.trim() : '';
        if (rid && self) {
          setActiveRoomId(rid);
        }
        setRoomState({
          roomId: rid || (typeof msg.roomId === 'string' ? msg.roomId.trim() : ''),
          stakeSol: Number(msg.stakeSol),
          players: (msg.players as RoomPlayer[]) ?? [],
          phase: msg.phase as RoomStatePayload['phase'],
          countdownEndsAt:
            typeof msg.countdownEndsAt === 'number' ? msg.countdownEndsAt : null,
          selfPlayerId: self || undefined,
        });
      }

      if (type === 'match_started') {
        const mid = msg.matchId as string | undefined;
        const rid = msg.roomId as string | undefined;
        const platforms = parsePlatforms(msg.platforms);
        if (mid) {
          navigatingToMatchRef.current = true;
          clearActiveRoomId();
          setActiveMatchId(mid);
          setMatchPlatforms(platforms);
          navigate(`/match/${encodeURIComponent(mid)}`, { state: rid ? { roomId: rid } : undefined });
        }
      }

      if (type === 'match_resolved') {
        const winnerId = msg.winnerPlayerId as string | undefined;
        const loserId = msg.loserPlayerId as string | undefined;
        const reason = typeof msg.reason === 'string' ? msg.reason : '';
        const rid = typeof msg.roomId === 'string' ? msg.roomId.trim() : '';
        const pid = playerIdRef.current;
        clearActiveMatchId();
        const applyNavigation = () => {
          if (winnerId && loserId && rid && pid) {
            if (winnerId === pid) {
              setActiveRoomId(rid);
              navigate(`/room/${encodeURIComponent(rid)}`, { replace: true });
            } else if (loserId === pid) {
              clearActiveRoomId();
              if (ws.readyState === WebSocket.OPEN) {
                ws.close();
              }
              wsRef.current = null;
              joinedRoomIdRef.current = null;
              setRoomState(null);
              setPlayerId(null);
              playerIdRef.current = null;
              navigate('/lobby', {
                replace: true,
                state: {
                  roomNotice:
                    reason === 'eliminated'
                      ? 'Match lost — stake awarded to opponent (placeholder settlement).'
                      : 'You resigned — stake awarded to opponent (placeholder settlement).',
                },
              });
            }
          }
        };
        if (reason === 'eliminated') {
          window.setTimeout(applyNavigation, RESOLVE_NAV_DELAY_MS);
        } else {
          applyNavigation();
        }
      }

      if (typeof type === 'string' && type.startsWith('game_')) {
        const snapshot = [...gameListenersRef.current];
        for (const handler of snapshot) {
          try {
            handler(msg as GameMessage);
          } catch {
            /** Listener errors must not break the socket pipeline. */
          }
        }
      }

      if (type === 'error') {
        const code = msg.code as string | undefined;
        const message = msg.message as string | undefined;
        if (code && ROOM_JOIN_ERRORS.has(code)) {
          clearActiveRoomId();
        }
        setProtocolError([code, message].filter(Boolean).join(': ') || 'Server error');
      }
    };

    return () => {
      if (navigatingToMatchRef.current) {
        navigatingToMatchRef.current = false;
        return;
      }
      if (wsRef.current === ws) {
        ws.close();
        wsRef.current = null;
        joinedRoomIdRef.current = null;
      }
    };
  }, [location.pathname, navigate]);

  const toggleReady = useCallback(() => {
    const ws = wsRef.current;
    const pid = playerIdRef.current ?? playerId;
    if (!ws || ws.readyState !== WebSocket.OPEN || !pid) return;
    const me = roomStateRef.current?.players.find((p) => p.playerId === pid);
    if (me?.ready) return;
    ws.send(JSON.stringify({ type: 'set_ready', ready: true }));
  }, [playerId]);

  const value = useMemo<GameRealtimeContextValue>(
    () => ({
      playerId,
      roomState,
      socketStatus,
      protocolError,
      toggleReady,
      exitToLobby,
      sendForfeit,
      forceDisconnectToLobby,
      disconnectSocket,
      sendGameMessage,
      subscribeGameMessages,
      matchPlatforms,
    }),
    [
      disconnectSocket,
      exitToLobby,
      forceDisconnectToLobby,
      matchPlatforms,
      playerId,
      protocolError,
      roomState,
      sendForfeit,
      sendGameMessage,
      socketStatus,
      subscribeGameMessages,
      toggleReady,
    ],
  );

  return <GameRealtimeContext.Provider value={value}>{children}</GameRealtimeContext.Provider>;
}

export function useGameRealtime(): GameRealtimeContextValue {
  const ctx = useContext(GameRealtimeContext);
  if (!ctx) {
    throw new Error('useGameRealtime must be used within GameRealtimeProvider');
  }
  return ctx;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';

import { fetchRooms } from '../lib/api';
import { getClientSessionId } from '../lib/clientSession';
import { getRealtimeWsUrl } from '../lib/realtime';
import type { RoomSummary } from '../types/realtime';

type Options = {
  navigate: NavigateFunction;
};

export function useLobbyRooms({ navigate }: Options) {
  const wsRef = useRef<WebSocket | null>(null);

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [wsReady, setWsReady] = useState(false);
  const [wsAlive, setWsAlive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchRooms()
      .then((list) => {
        if (!cancelled) setRooms(list);
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadError(e.message ?? 'Failed to load rooms');
      })
      .finally(() => {
        if (!cancelled) setInitialLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const ws = new WebSocket(getRealtimeWsUrl());
    wsRef.current = ws;

    ws.onopen = () => setWsAlive(true);
    ws.onclose = () => {
      setWsAlive(false);
      setWsReady(false);
    };
    ws.onerror = () => setWsAlive(false);

    ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data as string) as Record<string, unknown>;
      } catch {
        return;
      }
      const type = msg.type as string | undefined;
      if (type === 'welcome') {
        setWsReady(true);
        ws.send(JSON.stringify({ type: 'lobby_subscribe' }));
      }
      if (type === 'rooms_snapshot') {
        const list = msg.rooms as RoomSummary[] | undefined;
        if (Array.isArray(list)) setRooms(list);
      }
      if (type === 'room_created') {
        const room = msg.room as RoomSummary | undefined;
        if (room?.id) {
          navigate(`/room/${encodeURIComponent(room.id)}`);
        }
      }
      if (type === 'error') {
        console.warn('[lobby]', msg);
      }
    };

    return () => {
      wsRef.current = null;
      ws.close();
    };
  }, [navigate]);

  const refreshList = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await fetchRooms();
      setRooms(list);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Refresh failed');
    }
  }, []);

  const createRoom = useCallback((stakeSol: number) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !wsReady) return;
    const clientSessionId = getClientSessionId();
    ws.send(JSON.stringify({ type: 'create_room', stakeSol, clientSessionId }));
  }, [wsReady]);

  return {
    rooms,
    setRooms,
    initialLoading,
    loadError,
    wsReady,
    wsAlive,
    refreshList,
    createRoom,
  };
}

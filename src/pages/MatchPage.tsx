import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useGameRealtime } from '../contexts/GameRealtimeContext';
import { useMatchSession } from '../hooks/useMatchSession';
import { PhaserGame } from '../game/PhaserGame';

export function MatchPage() {
  const { matchId } = useParams<{ matchId: string }>();

  const {
    sendForfeit,
    playerId,
    roomState,
    sendGameMessage,
    subscribeGameMessages,
    matchPlatforms,
    exitToLobby,
  } = useGameRealtime();
  /** Hook still runs so the session-failure side effects fire; UI is hidden. */
  useMatchSession(matchId);

  const [forfeitOpen, setForfeitOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pauseAllowed, setPauseAllowed] = useState(true);

  const onPauseAllowedChange = useCallback((allowed: boolean) => {
    setPauseAllowed(allowed);
  }, []);

  /** If the scene transitions to inter-round / match-over while paused, auto-resume so the user isn't stuck behind the overlay. */
  useEffect(() => {
    if (!pauseAllowed && paused) setPaused(false);
  }, [pauseAllowed, paused]);

  /** Esc unpauses (only when paused — no need to register otherwise). */
  useEffect(() => {
    if (!paused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setPaused(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paused]);

  const isDemo = matchId === 'demo';
  const isDevSkip = matchId?.startsWith('dev-') ?? false;
  const canUseCasualNav = isDemo || isDevSkip;

  const selfPlayer = playerId
    ? roomState?.players.find((p) => p.playerId === playerId) ?? null
    : null;
  const opponentPlayer = playerId
    ? roomState?.players.find((p) => p.playerId !== playerId) ?? null
    : null;
  const selfSeat = selfPlayer?.seat ?? 0;
  const isLiveMatch = !isDemo && !isDevSkip && Boolean(playerId && opponentPlayer);

  return (
    <div className="flex flex-1 flex-col gap-5">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex items-center gap-3">
          {canUseCasualNav ? (
            <Link
              to="/lobby"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-white/20 hover:text-white"
            >
              <span aria-hidden>←</span> Lobby
            </Link>
          ) : null}
          <Link to="/" className="flex items-center gap-2">
            <span className="text-lg" aria-hidden>
              🚽
            </span>
            <span className="text-sm font-black tracking-tight text-white">
              TOILET<span className="text-emerald-400">WIF</span>HAT
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {canUseCasualNav ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-300 ring-1 ring-sky-500/30">
              {isDemo ? 'Demo' : 'Dev'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-500/30">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Live match
            </span>
          )}
          <button
            type="button"
            onClick={() => setPaused(true)}
            disabled={!pauseAllowed || paused}
            aria-label="Pause game"
            title="Pause"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-sm leading-none text-slate-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            <span aria-hidden>⏸</span>
          </button>
          {!canUseCasualNav ? (
            <button
              type="button"
              onClick={() => setForfeitOpen(true)}
              className="text-xs font-medium text-slate-500 transition hover:text-red-400"
            >
              Resign
            </button>
          ) : null}
        </div>
      </header>

      {forfeitOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="forfeit-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 px-6 py-5 shadow-xl">
            <h2 id="forfeit-title" className="text-lg font-bold text-white">
              Resign this match?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              You will lose your stake for this table. Your opponent receives both stakes (placeholder settlement until
              on-chain escrow). The table stays open for them to accept the next player.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setForfeitOpen(false)}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/5"
              >
                Keep playing
              </button>
              <button
                type="button"
                onClick={() => {
                  if (matchId) sendForfeit(matchId);
                  setForfeitOpen(false);
                }}
                className="rounded-xl border border-red-500/50 bg-red-600/90 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600"
              >
                Confirm resign
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="relative flex min-h-[600px] flex-1 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
        <PhaserGame
          isDemo={!isLiveMatch}
          matchId={matchId ?? ''}
          selfPlayerId={playerId ?? ''}
          opponentPlayerId={opponentPlayer?.playerId ?? ''}
          selfSeat={selfSeat}
          stakeSol={roomState?.stakeSol}
          platforms={matchPlatforms ?? undefined}
          paused={paused}
          sendGameMessage={sendGameMessage}
          subscribeGameMessages={subscribeGameMessages}
          exitToLobby={exitToLobby}
          onPauseAllowedChange={onPauseAllowedChange}
        />
        {paused ? (
          <div
            className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="paused-title"
          >
            <div className="px-6 text-center">
              <p
                id="paused-title"
                className="text-6xl font-black tracking-tighter text-white sm:text-7xl"
              >
                PAUSED
              </p>
              {isLiveMatch ? (
                <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300 ring-1 ring-amber-500/30">
                  Opponent continues while paused
                </p>
              ) : null}
              <p className="mt-4 text-xs text-slate-400">
                Press{' '}
                <kbd className="rounded border border-white/15 bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-200">
                  Esc
                </kbd>{' '}
                or click below to resume.
              </p>
              <button
                type="button"
                onClick={() => setPaused(false)}
                className="mt-7 inline-flex items-center gap-2 rounded-xl bg-linear-to-br from-emerald-400 to-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-900/40 transition hover:from-emerald-300 hover:to-emerald-500"
              >
                <span aria-hidden>▶</span> Resume
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

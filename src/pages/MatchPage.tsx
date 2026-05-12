import { useState } from 'react';
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
        {canUseCasualNav ? (
          <>
            <Link
              to="/lobby"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-white/20 hover:text-white"
            >
              <span aria-hidden>←</span> Lobby
            </Link>
            <Link to="/" className="flex items-center gap-2">
              <span className="text-lg" aria-hidden>
                🚽
              </span>
              <span className="text-sm font-black tracking-tight text-white">
                TOILET<span className="text-emerald-400">WIF</span>HAT
              </span>
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-300 ring-1 ring-sky-500/30">
              {isDemo ? 'Demo' : 'Dev'}
            </span>
          </>
        ) : (
          <>
            <Link to="/" className="flex items-center gap-2">
              <span className="text-lg" aria-hidden>
                🚽
              </span>
              <span className="text-sm font-black tracking-tight text-white">
                TOILET<span className="text-emerald-400">WIF</span>HAT
              </span>
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-500/30">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Live match
            </span>
            <button
              type="button"
              onClick={() => setForfeitOpen(true)}
              className="text-xs font-medium text-slate-500 transition hover:text-red-400"
            >
              Resign
            </button>
          </>
        )}
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

      <div className="flex min-h-[600px] flex-1 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
        <PhaserGame
          isDemo={!isLiveMatch}
          matchId={matchId ?? ''}
          selfPlayerId={playerId ?? ''}
          opponentPlayerId={opponentPlayer?.playerId ?? ''}
          selfSeat={selfSeat}
          stakeSol={roomState?.stakeSol}
          platforms={matchPlatforms ?? undefined}
          sendGameMessage={sendGameMessage}
          subscribeGameMessages={subscribeGameMessages}
          exitToLobby={exitToLobby}
        />
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import { useGameRealtime } from '../contexts/GameRealtimeContext';
import { useMatchSession } from '../hooks/useMatchSession';
import { PhaserGame } from '../game/PhaserGame';

export function MatchPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const location = useLocation();
  const roomId = (location.state as { roomId?: string } | undefined)?.roomId;

  const {
    sendForfeit,
    playerId,
    roomState,
    sendGameMessage,
    subscribeGameMessages,
    matchPlatforms,
  } = useGameRealtime();
  const verifyState = useMatchSession(matchId);

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
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        {canUseCasualNav ? (
          <>
            <Link
              to="/lobby"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10"
            >
              ← Lobby
            </Link>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400/90">Match</span>
            <Link
              to="/"
              className="rounded-xl px-3 py-2 text-xs font-medium text-slate-500 hover:text-white"
            >
              Menu
            </Link>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setForfeitOpen(true)}
              className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/20"
            >
              Resign match
            </button>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400/90">Match</span>
            <span className="max-w-[140px] text-right text-[10px] leading-tight text-slate-500">
              Lobby & menu locked — resign to leave with a loss.
            </span>
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-white">
          {isDemo ? 'Demo match' : isDevSkip ? 'Dev skip' : 'Match'}
        </h1>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300">
          Game placeholder
        </span>
      </div>
      <p className="font-mono text-sm text-slate-500">match id: {matchId ?? '—'}</p>
      {roomId ? (
        <p className="text-xs text-slate-500">
          Table / room <span className="font-mono text-slate-400">{roomId}</span> stays open after resign — winner keeps
          the seat.
        </p>
      ) : null}

      {!isDemo && !isDevSkip ? (
        <p className="text-xs text-slate-400">
          Session check:{' '}
          {verifyState === 'checking' ? (
            <span className="text-amber-400">…</span>
          ) : verifyState === 'verified' ? (
            <span className="text-emerald-400">ok</span>
          ) : verifyState === 'failed' ? (
            <span className="text-red-400">failed</span>
          ) : (
            <span className="text-slate-500">skipped</span>
          )}
        </p>
      ) : null}

      <p className="text-sm text-slate-400">
        Stakes are locked for this match. Use <strong className="text-slate-300">Resign match</strong> if you must leave;
        random navigation is blocked until the match resolves.
      </p>
      <PhaserGame
        isDemo={!isLiveMatch}
        selfPlayerId={playerId ?? ''}
        opponentPlayerId={opponentPlayer?.playerId ?? ''}
        selfSeat={selfSeat}
        stakeSol={roomState?.stakeSol}
        platforms={matchPlatforms ?? undefined}
        sendGameMessage={sendGameMessage}
        subscribeGameMessages={subscribeGameMessages}
      />
    </div>
  );
}

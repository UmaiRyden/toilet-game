import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useGameRealtime } from '../contexts/GameRealtimeContext';
import { getAppOrigin } from '../lib/env';

function CountdownOverlay({ endsAt }: { endsAt: number | null }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!endsAt) return;
    const t = window.setInterval(() => setTick((x) => x + 1), 100);
    return () => window.clearInterval(t);
  }, [endsAt]);

  if (!endsAt) return null;
  const sec = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  const label = sec <= 0 ? 'GO!' : String(sec);

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md">
      <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300/90">Match starting</p>
      <div className="relative mt-8">
        <div
          className="absolute inset-0 rounded-full bg-cyan-400/25 blur-3xl"
          aria-hidden
        />
        <div
          key={label}
          className="relative flex h-44 w-44 flex-col items-center justify-center rounded-full border-[3px] border-cyan-400/55 bg-linear-to-b from-cyan-500/25 via-slate-900/70 to-slate-950 shadow-[0_0_70px_rgba(34,211,238,0.35)] sm:h-52 sm:w-52"
          style={{ animation: 'room-countdown-bubble 0.55s ease-out' }}
        >
          <span className="font-mono text-6xl font-black tabular-nums leading-none text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.55)] sm:text-7xl">
            {label}
          </span>
          {sec > 0 ? (
            <span className="mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
              seconds
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();

  const { playerId, roomState, socketStatus, protocolError, toggleReady, exitToLobby, disconnectSocket } =
    useGameRealtime();

  const inviteUrl = useMemo(() => {
    if (!roomId) return '';
    const origin = getAppOrigin();
    if (!origin) return '';
    return `${origin}/room/${roomId}`;
  }, [roomId]);

  async function copyInvite() {
    const url = inviteUrl || `${getAppOrigin()}/room/${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy link:', url);
    }
  }

  const me = roomState?.players.find((p) => p.playerId === playerId) ?? null;
  const opponent = roomState?.players.find((p) => p.playerId !== playerId) ?? null;

  const waitingForOpponent = Boolean(roomState && roomState.players.length < 2);
  const inCountdown = roomState?.phase === 'countdown';

  const phaseCopy = !roomState
    ? 'Syncing…'
    : roomState.phase === 'in_match'
      ? 'Match live — use the match screen.'
      : inCountdown
        ? 'Match starts soon…'
        : roomState.phase === 'starting'
          ? 'Launching match…'
          : roomState.phase === 'ready_up'
            ? 'Waiting for ready…'
            : 'Waiting for opponent…';

  return (
    <div className="flex flex-1 flex-col gap-6 pb-6">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <button
          type="button"
          onClick={() => exitToLobby()}
          className="cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10"
        >
          ← Leave room
        </button>
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400/90">Private room</span>
        <span className="hidden w-[120px] sm:block" aria-hidden />
      </header>

      {inCountdown ? <CountdownOverlay endsAt={roomState?.countdownEndsAt ?? null} /> : null}

      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-linear-to-br from-slate-900 via-slate-900/90 to-slate-950 px-5 py-7 shadow-xl sm:px-8">
        <div
          className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl"
          aria-hidden
        />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300/90">Matchmaking</p>
          <h1 className="mt-2 font-mono text-xl font-bold tracking-tight text-white sm:text-2xl">{roomId ?? '—'}</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
            The host badge is for the first seat only (cosmetic). If someone leaves, the table stays open with one
            seat free so others can join from the lobby. When both are ready, a short countdown runs and the match id is
            issued.
          </p>
          {roomState ? (
            <p className="mt-2 text-xs text-slate-500">
              Stake{' '}
              <span className="font-medium text-emerald-400">
                {roomState.stakeSol.toLocaleString()} $TOILET
              </span>
              {me?.isHost ? (
                <span className="ml-2 rounded-md bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
                  Host
                </span>
              ) : me ? (
                <span className="ml-2 rounded-md bg-slate-600/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Guest
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      </section>

      <div
        className={[
          'rounded-2xl border px-4 py-3 text-sm',
          socketStatus === 'open'
            ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-100/90'
            : socketStatus === 'connecting'
              ? 'border-amber-500/20 bg-amber-500/5 text-amber-100/90'
              : 'border-red-500/25 bg-red-500/5 text-red-100/90',
        ].join(' ')}
      >
        <span className="font-semibold">
          {socketStatus === 'open'
            ? 'Connected'
            : socketStatus === 'connecting'
              ? 'Connecting…'
              : 'Disconnected'}
        </span>
        <span className="text-slate-400"> — realtime seat + ready sync.</span>
      </div>

      {protocolError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {protocolError}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-sky-500/25 bg-slate-900/60 p-5 shadow-inner shadow-black/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-400">You</p>
          <p className="mt-2 text-lg font-bold text-white">{me?.label ?? 'Joining…'}</p>
          <p className="mt-1 text-xs text-slate-500">
            {playerId ? `Session …${playerId.slice(-6)}` : 'Negotiating session'}
          </p>
          <button
            type="button"
            onClick={() => toggleReady()}
            disabled={
              socketStatus !== 'open' ||
              !me ||
              waitingForOpponent ||
              roomState?.phase === 'in_match' ||
              Boolean(me?.ready)
            }
            className={[
              'mt-4 w-full cursor-pointer rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-90',
              me?.ready
                ? 'border border-emerald-600/50 bg-emerald-900/40 text-emerald-100'
                : 'border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700',
            ].join(' ')}
          >
            {waitingForOpponent
              ? 'Waiting for opponent…'
              : me?.ready
                ? 'Ready ✓ — locked in'
                : 'Tap when ready'}
          </button>
          <p className="mt-2 text-[11px] text-slate-600">
            {me?.ready
              ? 'Ready is final for this table until the match starts or the room resets.'
              : inCountdown
                ? 'Starting…'
                : 'One tap locks you in — you cannot undo.'}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-slate-900/40 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Opponent</p>
          <p className="mt-2 text-lg font-bold text-white">
            {opponent?.label ?? (waitingForOpponent ? 'Waiting…' : '—')}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {waitingForOpponent
              ? 'Share the invite link or open it on another device.'
              : opponent
                ? opponent.ready
                  ? 'Ready.'
                  : 'Not ready yet.'
                : ''}
          </p>
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 text-center text-xs text-slate-500">
            {!opponent ? 'Seat empty' : opponent.ready ? 'Opponent ready' : 'Not ready yet'}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void copyInvite()}
          className="cursor-pointer rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Copy invite link
        </button>
        <span
          className={[
            'rounded-xl px-4 py-2.5 text-center text-sm font-semibold',
            inCountdown
              ? 'border border-amber-600/40 bg-amber-950/30 text-amber-200'
              : 'text-slate-500',
          ].join(' ')}
        >
          {inCountdown ? 'Countdown running…' : phaseCopy}
        </span>
        <Link
          to={`/match/dev-${encodeURIComponent(roomId ?? 'unknown')}`}
          className="cursor-pointer rounded-xl border border-dashed border-slate-600 px-4 py-2.5 text-sm text-slate-400 hover:bg-slate-800"
          onClick={() => disconnectSocket()}
        >
          Skip (dev)
        </Link>
      </div>
    </div>
  );
}

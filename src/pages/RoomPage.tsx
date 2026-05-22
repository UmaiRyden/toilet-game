import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { useGameRealtime } from '../contexts/GameRealtimeContext';
import { useWallet } from '../hooks/useWallet';
import { getAppOrigin } from '../lib/env';
import { EXTENDED_MAG_PRICE } from '../config/solana';
import {
  transferExtendedMagFee,
  transferStakeToTreasury,
} from '../lib/stakeTransfer';
import type { StakeStatusValue } from '../types/realtime';

const CANCEL_REASON_COPY: Record<string, string> = {
  timeout: 'No one confirmed in time.',
  client_cancel: 'You cancelled the wager.',
  client_tx_failed: 'Your wallet rejected the transfer.',
  client_timeout: 'Your wager confirmation timed out.',
  stake_verification_failed: 'A stake transfer could not be verified on-chain.',
  player_left: 'A player left the room.',
  player_disconnected: 'A player disconnected.',
  opponent_left: 'Your opponent left the room.',
  opponent_disconnected: 'Your opponent disconnected.',
};

function humanizeCancelReason(reason: string): string {
  return CANCEL_REASON_COPY[reason] ?? `Wager cancelled (${reason}).`;
}

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

  const {
    playerId,
    roomState,
    socketStatus,
    protocolError,
    toggleReady,
    exitToLobby,
    sendStakePaid,
    sendStakeFailed,
    matchCancelledReason,
    stakeRefund,
    clearStakeBanners,
    sendPurchaseExtendedMag,
  } = useGameRealtime();
  const { publicKey, signTransaction, connection } = useWallet();

  const [paying, setPaying] = useState(false);
  const [stakeError, setStakeError] = useState<string | null>(null);
  const [buyingMag, setBuyingMag] = useState(false);
  const [magError, setMagError] = useState<string | null>(null);

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
  const inStakePending = roomState?.phase === 'stake_pending';

  /** Diagnostic — runs every render so we can see phase transitions in real time. */
  console.log(
    `[diag RoomPage render] phase=${roomState?.phase ?? 'NO_ROOM_STATE'} inStakePending=${inStakePending} hasRoomState=${Boolean(roomState)} stakeStatus=${
      roomState?.stakeStatus ? JSON.stringify(roomState.stakeStatus) : 'null'
    }`,
  );
  console.log(
    `[diag RoomPage modal-gate] (inStakePending && roomState) = ${Boolean(
      inStakePending && roomState,
    )} → ${inStakePending && roomState ? 'WILL render StakeConfirmModal' : 'WILL NOT render modal'}`,
  );

  const selfStakeStatus: StakeStatusValue | null =
    (playerId && roomState?.stakeStatus?.[playerId]) || null;
  const opponentStakeStatus: StakeStatusValue | null =
    (opponent?.playerId && roomState?.stakeStatus?.[opponent.playerId]) || null;

  const phaseCopy = !roomState
    ? 'Syncing…'
    : roomState.phase === 'in_match'
      ? 'Match live — use the match screen.'
      : inCountdown
        ? 'Match starts soon…'
        : roomState.phase === 'starting'
          ? 'Launching match…'
          : inStakePending
            ? 'Confirm your wager…'
            : roomState.phase === 'ready_up'
              ? 'Waiting for ready…'
              : 'Waiting for opponent…';

  const handlePayStake = useCallback(async () => {
    if (!roomState || !publicKey || !signTransaction) {
      setStakeError('Wallet not ready — reconnect Phantom to continue.');
      return;
    }
    setPaying(true);
    setStakeError(null);
    try {
      const sig = await transferStakeToTreasury(
        connection,
        { publicKey, signTransaction },
        roomState.stakeSol,
      );
      sendStakePaid(sig);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Stake transfer failed';
      setStakeError(msg);
      sendStakeFailed('client_tx_failed');
    } finally {
      setPaying(false);
    }
  }, [
    connection,
    publicKey,
    roomState,
    sendStakeFailed,
    sendStakePaid,
    signTransaction,
  ]);

  const handleCancelStake = useCallback(() => {
    sendStakeFailed('client_cancel');
  }, [sendStakeFailed]);

  const handleBuyExtendedMag = useCallback(async () => {
    if (!publicKey || !signTransaction) {
      setMagError('Connect a Phantom wallet to purchase upgrades.');
      return;
    }
    setBuyingMag(true);
    setMagError(null);
    try {
      const sig = await transferExtendedMagFee(connection, {
        publicKey,
        signTransaction,
      });
      sendPurchaseExtendedMag(sig);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upgrade purchase failed';
      setMagError(msg);
    } finally {
      setBuyingMag(false);
    }
  }, [connection, publicKey, sendPurchaseExtendedMag, signTransaction]);

  /** Clear any stale upgrade error once the server confirms our purchase. */
  const alreadyPurchasedMag = Boolean(
    playerId && roomState?.extendedMag?.[playerId] === true,
  );
  useEffect(() => {
    if (alreadyPurchasedMag) setMagError(null);
  }, [alreadyPurchasedMag]);

  const upgradesPhaseOk =
    roomState?.phase === 'waiting_opponent' ||
    roomState?.phase === 'ready_up';
  const canSignTx = Boolean(publicKey && signTransaction);

  /** Auto-fail if our own deadline elapses without paying. Server has its own timer too. */
  useEffect(() => {
    if (!inStakePending) return;
    const endsAt = roomState?.stakePendingEndsAt;
    if (!endsAt) return;
    if (selfStakeStatus === 'paid') return;
    const remaining = endsAt - Date.now();
    if (remaining <= 0) {
      sendStakeFailed('client_timeout');
      return;
    }
    const t = window.setTimeout(() => {
      sendStakeFailed('client_timeout');
    }, remaining);
    return () => window.clearTimeout(t);
  }, [inStakePending, roomState?.stakePendingEndsAt, selfStakeStatus, sendStakeFailed]);

  /** Reset local UI state whenever we leave the stake-pending phase. */
  useEffect(() => {
    if (!inStakePending) {
      setStakeError(null);
      setPaying(false);
    }
  }, [inStakePending]);

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

      {inStakePending && roomState ? (
        <StakeConfirmModal
          stake={roomState.stakeSol}
          endsAt={roomState.stakePendingEndsAt ?? null}
          selfStatus={selfStakeStatus ?? 'pending'}
          opponentStatus={opponentStakeStatus ?? 'pending'}
          canSign={Boolean(publicKey && signTransaction)}
          paying={paying}
          error={stakeError}
          onPay={handlePayStake}
          onCancel={handleCancelStake}
        />
      ) : null}

      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-linear-to-br from-slate-900 via-slate-900/90 to-slate-950 px-5 py-7 shadow-xl sm:px-8">
        <div
          className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl"
          aria-hidden
        />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300/90">Matchmaking</p>
          <h1 className="mt-2 font-mono text-xl font-bold tracking-tight text-white sm:text-2xl">{roomId ?? '—'}</h1>
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

      {matchCancelledReason ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <div className="min-w-0">
            <p className="font-semibold">Wager cancelled</p>
            <p className="mt-0.5 text-xs text-amber-200/80">
              {humanizeCancelReason(matchCancelledReason)}
            </p>
            {stakeRefund ? (
              <p className="mt-1 text-xs text-emerald-200">
                Refunded {stakeRefund.amount.toLocaleString()} $TOILET
                {stakeRefund.signature ? (
                  <>
                    {' — '}
                    <a
                      href={`https://explorer.solana.com/tx/${stakeRefund.signature}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline-offset-2 hover:underline"
                    >
                      view tx ↗
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={clearStakeBanners}
            className="shrink-0 text-amber-300 underline-offset-2 hover:underline"
          >
            Dismiss
          </button>
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

      <section className="rounded-2xl border border-amber-500/30 bg-linear-to-br from-amber-950/30 via-slate-900 to-slate-950 p-5 shadow-inner shadow-black/20">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-400/90">
          Match upgrades
        </p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black tracking-tight text-white">
              Extended Magazine — 20 rounds{' '}
              <span className="text-sm font-medium text-slate-500">(was 10)</span>
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              One-time purchase, applies to this match only. Fee is not refunded
              if the wager is cancelled.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-2xl font-black tracking-tight text-amber-200">
              {EXTENDED_MAG_PRICE.toLocaleString()}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80">
              $TOILET
            </p>
          </div>
        </div>

        <div className="mt-4">
          {alreadyPurchasedMag ? (
            <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm font-bold text-emerald-200">
              ✓ Purchased
            </span>
          ) : !canSignTx ? (
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-500"
            >
              Connect wallet to purchase
            </button>
          ) : (
            <button
              type="button"
              onClick={handleBuyExtendedMag}
              disabled={buyingMag || !upgradesPhaseOk}
              title={
                !upgradesPhaseOk
                  ? 'Upgrades lock once the wager begins'
                  : undefined
              }
              className="inline-flex items-center gap-2 rounded-lg bg-linear-to-br from-amber-400 to-amber-600 px-5 py-2 text-sm font-bold text-white shadow-md shadow-amber-900/30 transition hover:from-amber-300 hover:to-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {buyingMag
                ? 'Processing…'
                : `Buy — ${EXTENDED_MAG_PRICE.toLocaleString()} $TOILET`}
            </button>
          )}
          {magError ? (
            <p className="mt-2 text-xs text-red-300">{magError}</p>
          ) : null}
          {!upgradesPhaseOk && !alreadyPurchasedMag && canSignTx ? (
            <p className="mt-2 text-xs text-slate-500">
              Upgrades are locked once the wager begins.
            </p>
          ) : null}
        </div>
      </section>

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
      </div>
    </div>
  );
}

function StakeConfirmModal({
  stake,
  endsAt,
  selfStatus,
  opponentStatus,
  canSign,
  paying,
  error,
  onPay,
  onCancel,
}: {
  stake: number;
  endsAt: number | null;
  selfStatus: StakeStatusValue;
  opponentStatus: StakeStatusValue;
  canSign: boolean;
  paying: boolean;
  error: string | null;
  onPay: () => void;
  onCancel: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!endsAt) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setSecondsLeft(left);
    };
    tick();
    const interval = window.setInterval(tick, 500);
    return () => window.clearInterval(interval);
  }, [endsAt]);

  const selfPaid = selfStatus === 'paid';
  const opponentPaid = opponentStatus === 'paid';
  const waitingForOpponent = selfPaid && !opponentPaid;
  const pot = stake * 2;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stake-confirm-title"
    >
      <div className="w-full max-w-md rounded-3xl border border-emerald-500/30 bg-linear-to-br from-slate-900 to-slate-950 p-6 shadow-2xl">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-400/90">
          Confirm wager
        </p>
        <h2
          id="stake-confirm-title"
          className="mt-2 text-2xl font-black tracking-tight text-white"
        >
          Transfer {stake.toLocaleString()} $TOILET
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Both players sign a transfer of their stake to the treasury before the
          match starts. The winner receives the full{' '}
          <span className="font-semibold text-emerald-300">
            {pot.toLocaleString()} $TOILET
          </span>{' '}
          pot.
        </p>

        {secondsLeft != null ? (
          <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 font-mono text-xs text-slate-300">
            <span aria-hidden>⏱</span>
            {secondsLeft}s to confirm
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
            {error}
          </div>
        ) : null}

        {!canSign ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Wallet not ready to sign. Reconnect Phantom to continue, or cancel
            the wager.
          </div>
        ) : null}

        <div className="mt-6 space-y-2">
          <StakeStatusRow label="You" status={selfStatus} />
          <StakeStatusRow label="Opponent" status={opponentStatus} />
        </div>

        <div className="mt-7 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={paying || selfPaid}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel wager
          </button>
          {selfPaid ? (
            <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-200">
              {waitingForOpponent
                ? 'Waiting for opponent…'
                : 'Locking in…'}
            </span>
          ) : (
            <button
              type="button"
              onClick={onPay}
              disabled={paying || !canSign || selfStatus === 'failed'}
              className="inline-flex items-center gap-2 rounded-lg bg-linear-to-br from-emerald-400 to-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-md shadow-emerald-900/30 transition hover:from-emerald-300 hover:to-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {paying
                ? 'Signing…'
                : `Pay ${stake.toLocaleString()} $TOILET`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StakeStatusRow({
  label,
  status,
}: {
  label: string;
  status: StakeStatusValue;
}) {
  const text =
    status === 'paid'
      ? '✓ Paid'
      : status === 'failed'
        ? '✗ Failed'
        : '… Pending';
  const tone =
    status === 'paid'
      ? 'text-emerald-300'
      : status === 'failed'
        ? 'text-red-300'
        : 'text-amber-300';
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-slate-900/60 px-3 py-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className={['text-sm font-bold', tone].join(' ')}>{text}</span>
    </div>
  );
}

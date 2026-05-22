import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { ConnectWalletButton } from '../components/ConnectWalletButton';
import { useLobbyRooms } from '../hooks/useLobbyRooms';
import { useWallet } from '../hooks/useWallet';
import type { RoomSummary } from '../types/realtime';

const TIERS = ['All', '100', '500', '1000'] as const;
type Tier = (typeof TIERS)[number];

const STAKE_OPTIONS: ReadonlyArray<'100' | '500' | '1000'> = ['100', '500', '1000'];

export function LobbyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { rooms, initialLoading, loadError, wsReady, wsAlive, refreshList, createRoom } =
    useLobbyRooms({ navigate });
  const { connected, connect, getToiletBalance } = useWallet();

  const [notice, setNotice] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [tier, setTier] = useState<Tier>('All');
  const [createOpen, setCreateOpen] = useState(false);
  const [newStake, setNewStake] = useState<'100' | '500' | '1000'>('100');

  useEffect(() => {
    const n = (location.state as { roomNotice?: string } | null)?.roomNotice;
    if (n) {
      setNotice(n);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  /** Pull a fresh $TOILET balance whenever the wallet connection changes. */
  useEffect(() => {
    if (!connected) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    void getToiletBalance().then((b) => {
      if (!cancelled) setBalance(b);
    });
    return () => {
      cancelled = true;
    };
  }, [connected, getToiletBalance]);

  const filtered = useMemo(() => {
    if (tier === 'All') return rooms;
    const n = Number(tier);
    return rooms.filter((r) => r.stakeSol === n);
  }, [rooms, tier]);

  function ensureCanWager(stake: number): boolean {
    if (!connected) {
      setWalletError('Connect your wallet to play paid matches.');
      return false;
    }
    const have = balance ?? 0;
    if (have < stake) {
      setWalletError(
        `Insufficient $TOILET balance. You need ${stake.toLocaleString()}, you have ${have.toLocaleString()}.`,
      );
      return false;
    }
    setWalletError(null);
    return true;
  }

  function handleCreateRoom() {
    if (!ensureCanWager(Number(newStake))) return;
    createRoom(Number(newStake));
    setCreateOpen(false);
  }

  function handleJoinRoom(room: RoomSummary) {
    if (!ensureCanWager(room.stakeSol)) return;
    navigate(`/room/${room.id}`);
  }

  function openCreateDialog() {
    if (!connected) {
      setWalletError('Connect your wallet to play paid matches.');
      return;
    }
    setWalletError(null);
    setCreateOpen(true);
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="flex shrink-0 items-center justify-end gap-3 border-b border-white/10 pb-4">
        <ConnectWalletButton />
        <div className="flex items-center gap-2">
          <span
            className={[
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ring-1',
              wsAlive
                ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30'
                : 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
            ].join(' ')}
          >
            <span
              className={[
                'h-1.5 w-1.5 rounded-full',
                wsAlive ? 'animate-pulse bg-emerald-400' : 'bg-amber-400',
              ].join(' ')}
            />
            {wsAlive ? 'Live' : 'Connecting'}
          </span>
          <Link
            to="/"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-white/20 hover:text-white"
          >
            ← Menu
          </Link>
        </div>
      </header>

      {notice ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 text-amber-300 underline-offset-2 hover:underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {!connected ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-500/30 bg-linear-to-br from-emerald-950/50 via-slate-900 to-slate-950 px-5 py-4 shadow-md shadow-emerald-950/30 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">
              Connect your wallet to play paid matches
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              You'll need a Solana wallet with $TOILET to host or join an arena. Demo mode stays open without one.
            </p>
          </div>
          <button
            type="button"
            onClick={connect}
            className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-linear-to-br from-emerald-400 to-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-emerald-900/30 transition hover:from-emerald-300 hover:to-emerald-500"
          >
            Connect Wallet
          </button>
        </div>
      ) : null}

      {walletError ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          <span>{walletError}</span>
          <button
            type="button"
            onClick={() => setWalletError(null)}
            className="shrink-0 text-red-300 underline-offset-2 hover:underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-linear-to-br from-emerald-950/30 via-slate-900 to-slate-950 px-5 py-7 shadow-xl shadow-emerald-950/30 sm:px-8 sm:py-8">
        <div
          className="pointer-events-none absolute -right-20 -top-16 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-400/90">
              Paid arenas
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tighter text-white sm:text-4xl">
              Open rooms
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
              Take a seat at someone else's table, or host your own and wait for a challenger.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateDialog}
            disabled={!wsReady || !connected}
            title={!connected ? 'Connect your wallet first' : undefined}
            className="group inline-flex items-center gap-2 rounded-xl bg-linear-to-br from-emerald-400 to-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-900/40 ring-1 ring-emerald-400/40 transition hover:from-emerald-300 hover:to-emerald-500 hover:shadow-emerald-800/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden className="text-base leading-none">
              +
            </span>
            Host new room
          </button>
        </div>
      </section>

      {loadError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {loadError}{' '}
          <button
            type="button"
            onClick={() => void refreshList()}
            className="ml-1 font-medium text-sky-300 underline-offset-2 hover:underline"
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {TIERS.map((t) => (
            <StakeChip key={t} tier={t} active={tier === t} onSelect={() => setTier(t)} />
          ))}
        </div>
        <button
          type="button"
          onClick={() => void refreshList()}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-white/20 hover:text-white sm:self-auto"
        >
          <span aria-hidden>↻</span> Refresh
        </button>
      </div>

      {initialLoading && rooms.length === 0 ? (
        <p className="text-sm text-slate-500">Loading rooms…</p>
      ) : null}

      {filtered.length === 0 && !initialLoading ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-700 bg-slate-900/30 px-6 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-linear-to-br from-slate-800 to-slate-900 text-3xl shadow-inner">
            <span aria-hidden>🚽</span>
          </div>
          <h3 className="mt-5 text-xl font-bold text-white">No arenas open yet</h3>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-400">
            Be the first to host. Pick a stake and a challenger will join from the lobby.
          </p>
          <button
            type="button"
            onClick={openCreateDialog}
            disabled={!wsReady || !connected}
            title={!connected ? 'Connect your wallet first' : undefined}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden>+</span> Host the first room
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((r) => (
            <RoomCard
              key={r.id}
              room={r}
              canJoin={connected}
              onJoin={() => handleJoinRoom(r)}
            />
          ))}
        </div>
      )}

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-room-title"
          onClick={() => setCreateOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-white/10 bg-linear-to-br from-slate-900 to-slate-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-400/90">
              New arena
            </p>
            <h2
              id="create-room-title"
              className="mt-2 text-2xl font-black tracking-tight text-white"
            >
              Host a room
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Pick your stake. You'll join the table as host and wait for a challenger.
            </p>
            <label className="mt-7 block text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">
              Stake
            </label>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {STAKE_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setNewStake(s)}
                  className={[
                    'rounded-2xl border-2 px-3 py-4 text-center transition',
                    newStake === s
                      ? 'border-emerald-400/70 bg-emerald-500/10 shadow-lg shadow-emerald-900/30'
                      : 'border-slate-700/80 bg-slate-900/60 hover:border-slate-500',
                  ].join(' ')}
                >
                  <div
                    className={[
                      'text-2xl font-black tracking-tight',
                      newStake === s ? 'text-emerald-200' : 'text-slate-200',
                    ].join(' ')}
                  >
                    {Number(s).toLocaleString()}
                  </div>
                  <div
                    className={[
                      'mt-0.5 text-[10px] font-bold uppercase tracking-[0.2em]',
                      newStake === s ? 'text-emerald-400/90' : 'text-slate-500',
                    ].join(' ')}
                  >
                    $TOILET
                  </div>
                </button>
              ))}
            </div>
            {!wsReady ? (
              <p className="mt-4 text-xs text-amber-400">Waiting for connection…</p>
            ) : null}
            <div className="mt-7 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateRoom}
                disabled={!wsReady}
                className="rounded-lg bg-linear-to-br from-emerald-400 to-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-md shadow-emerald-900/30 hover:from-emerald-300 hover:to-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Open table
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StakeChip({
  tier,
  active,
  onSelect,
}: {
  tier: Tier;
  active: boolean;
  onSelect: () => void;
}) {
  const isAll = tier === 'All';
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={[
        'relative overflow-hidden rounded-2xl border-2 px-4 py-2 transition',
        active
          ? 'border-emerald-400/70 bg-emerald-500/15 shadow-md shadow-emerald-500/15'
          : 'border-slate-700/80 bg-slate-900/60 hover:border-slate-500 hover:bg-slate-900',
      ].join(' ')}
    >
      <div className="flex items-baseline gap-1.5">
        <span
          className={[
            'font-mono text-sm font-black tracking-tight sm:text-base',
            active ? 'text-emerald-100' : 'text-slate-200',
          ].join(' ')}
        >
          {isAll ? 'ALL' : Number(tier).toLocaleString()}
        </span>
        {!isAll ? (
          <span
            className={[
              'text-[9px] font-bold uppercase tracking-[0.2em]',
              active ? 'text-emerald-400/90' : 'text-slate-500',
            ].join(' ')}
          >
            $TOILET
          </span>
        ) : (
          <span
            className={[
              'text-[9px] font-bold uppercase tracking-[0.2em]',
              active ? 'text-emerald-400/90' : 'text-slate-500',
            ].join(' ')}
          >
            stakes
          </span>
        )}
      </div>
    </button>
  );
}

function RoomCard({
  room,
  canJoin,
  onJoin,
}: {
  room: RoomSummary;
  canJoin: boolean;
  onJoin: () => void;
}) {
  const isFull = room.seatsFilled >= room.seatsTotal;
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-800/80 bg-linear-to-br from-slate-900/90 via-slate-900/60 to-slate-950/90 p-5 shadow-md shadow-black/20 transition hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-900/20">
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-emerald-500/0 blur-3xl transition group-hover:bg-emerald-500/10"
        aria-hidden
      />
      <header className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] tracking-tight text-slate-500">{room.id}</span>
        {isFull ? (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300 ring-1 ring-amber-500/30">
            Full
          </span>
        ) : room.awaitingHost ? (
          <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-300 ring-1 ring-violet-500/30">
            Host joining
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-500/30">
            <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-400" />
            Open
          </span>
        )}
      </header>
      <div className="mt-4">
        <p className="font-mono text-3xl font-black tracking-tight text-white sm:text-4xl">
          {room.stakeSol.toLocaleString()}
        </p>
        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-400/90">
          $TOILET stake
        </p>
      </div>
      <footer className="mt-6 flex items-end justify-between gap-3 border-t border-slate-800 pt-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Host</p>
          <p className="mt-0.5 truncate text-xs font-semibold text-slate-300">{room.hostDisplay}</p>
          <p className="mt-1 text-[10px] text-slate-500">
            Seats <span className="text-slate-400">{room.seatsFilled}/{room.seatsTotal}</span>
          </p>
        </div>
        {isFull ? (
          <span className="rounded-lg border border-slate-800 bg-slate-900/80 px-4 py-2 text-xs font-medium text-slate-500">
            Full
          </span>
        ) : (
          <button
            type="button"
            onClick={onJoin}
            disabled={!canJoin}
            title={!canJoin ? 'Connect your wallet first' : undefined}
            className="inline-flex items-center gap-1 rounded-lg bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-900 shadow-md transition hover:bg-emerald-300 group-hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500 disabled:shadow-none"
          >
            Join
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </button>
        )}
      </footer>
    </article>
  );
}

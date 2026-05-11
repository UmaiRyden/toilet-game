import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useLobbyRooms } from '../hooks/useLobbyRooms';

const TIERS = ['All', '100', '500', '1000'] as const;

export function LobbyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { rooms, initialLoading, loadError, wsReady, wsAlive, refreshList, createRoom } = useLobbyRooms({
    navigate,
  });

  const [notice, setNotice] = useState<string | null>(null);
  const [tier, setTier] = useState<(typeof TIERS)[number]>('All');
  const [createOpen, setCreateOpen] = useState(false);
  const [newStake, setNewStake] = useState<'100' | '500' | '1000'>('100');

  useEffect(() => {
    const n = (location.state as { roomNotice?: string } | null)?.roomNotice;
    if (n) {
      setNotice(n);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  const filtered = useMemo(() => {
    if (tier === 'All') return rooms;
    const n = Number(tier);
    return rooms.filter((r) => r.stakeSol === n);
  }, [rooms, tier]);

  function handleCreateRoom() {
    createRoom(Number(newStake));
    setCreateOpen(false);
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <Link
          to="/"
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10"
        >
          ← Main menu
        </Link>
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400/90">Paid lobby</span>
        <span className="w-20" aria-hidden />
      </header>

      {notice ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {notice}
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="ml-3 text-amber-300 underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-linear-to-br from-slate-900 via-slate-900/90 to-slate-950 px-5 py-7 shadow-xl sm:px-8">
        <div
          className="pointer-events-none absolute -right-16 top-0 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">Open rooms</h1>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-400">
              Host a table or take a seat. Reusing “Create” with the same stake keeps one empty table per browser
              session.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs sm:text-sm">
            <span className="font-medium text-slate-300">Status</span>
            <span className={wsAlive ? 'text-emerald-400' : 'text-amber-400'}>
              {wsAlive ? 'Live' : 'Connecting…'}
            </span>
          </div>
        </div>
      </section>

      {loadError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {loadError}{' '}
          <button type="button" onClick={() => void refreshList()} className="text-sky-400 underline">
            Retry
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {TIERS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTier(t)}
              className={[
                'rounded-full border px-3 py-1.5 text-xs font-semibold transition sm:text-sm',
                tier === t
                  ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                  : 'border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-600 hover:text-slate-200',
              ].join(' ')}
            >
              {t === 'All' ? 'All stakes' : `${t} $TOILET`}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refreshList()}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
          >
            Refresh list
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            disabled={!wsReady}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-900/30 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create room
          </button>
        </div>
      </div>

      {initialLoading && rooms.length === 0 ? (
        <p className="text-sm text-slate-500">Loading rooms…</p>
      ) : null}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 px-6 py-16 text-center">
          <p className="text-4xl" aria-hidden>
            🚽
          </p>
          <p className="mt-4 text-lg font-semibold text-white">No rooms match this filter</p>
          <p className="mt-2 max-w-sm text-sm text-slate-400">
            Try another stake chip or create a room when status shows Live.
          </p>
          <button
            type="button"
            onClick={() => setTier('All')}
            className="mt-6 rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Show all stakes
          </button>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 shadow-lg shadow-black/20">
          {filtered.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-3 border-b border-slate-800/80 px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-medium text-white">{r.id}</span>
                  {r.seatsFilled >= r.seatsTotal ? (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                      Full
                    </span>
                  ) : r.awaitingHost ? (
                    <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
                      Host joining
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                      Open
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Host <span className="text-slate-400">{r.hostDisplay}</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                <span className="text-sm font-semibold text-emerald-400">{r.stakeLabel}</span>
                <span className="text-xs text-slate-500 sm:text-sm">
                  {r.seatsFilled}/{r.seatsTotal} players
                </span>
                {r.seatsFilled >= r.seatsTotal ? (
                  <span className="rounded-lg border border-slate-800 bg-slate-900/80 px-4 py-2 text-center text-sm text-slate-500">
                    —
                  </span>
                ) : (
                  <Link
                    to={`/room/${r.id}`}
                    className="rounded-lg bg-slate-100 px-4 py-2 text-center text-sm font-semibold text-slate-900 hover:bg-white"
                  >
                    Join
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-room-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 id="create-room-title" className="text-lg font-bold text-white">
              Create room
            </h2>
            <p className="mt-2 text-sm text-slate-400">Choose stake — you will join this table as host.</p>
            <label className="mt-6 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Stake
            </label>
            <select
              value={newStake}
              onChange={(e) => setNewStake(e.target.value as '100' | '500' | '1000')}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
            >
              <option value="100">100 $TOILET</option>
              <option value="500">500 $TOILET</option>
              <option value="1000">1,000 $TOILET</option>
            </select>
            {!wsReady ? (
              <p className="mt-3 text-xs text-amber-400">Waiting for connection…</p>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateRoom}
                disabled={!wsReady}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

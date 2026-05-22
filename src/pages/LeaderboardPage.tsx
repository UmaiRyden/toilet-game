import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { apiUrl } from '../lib/api';

type LeaderboardPlayer = {
  walletAddress: string;
  displayName: string | null;
  wins: number;
  losses: number;
  totalWagered: number;
  totalWon: number;
  lastPlayedAt: string | null;
};

type RankStyle = {
  medal: string;
  rowClass: string;
  rankClass: string;
};

const RANK_STYLES: Record<1 | 2 | 3, RankStyle> = {
  1: {
    medal: '🥇',
    rowClass:
      'bg-linear-to-r from-yellow-500/15 via-slate-900/40 to-transparent ring-1 ring-inset ring-yellow-400/30',
    rankClass: 'text-yellow-300',
  },
  2: {
    medal: '🥈',
    rowClass:
      'bg-linear-to-r from-slate-300/10 via-slate-900/40 to-transparent ring-1 ring-inset ring-slate-300/25',
    rankClass: 'text-slate-200',
  },
  3: {
    medal: '🥉',
    rowClass:
      'bg-linear-to-r from-amber-700/15 via-slate-900/40 to-transparent ring-1 ring-inset ring-amber-600/30',
    rankClass: 'text-amber-300',
  },
};

function shortenWallet(address: string): string {
  if (!address) return '—';
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

async function fetchLeaderboard(): Promise<LeaderboardPlayer[]> {
  const res = await fetch(apiUrl('/leaderboard?limit=20'));
  if (!res.ok) throw new Error(`Failed to load leaderboard (${res.status})`);
  const body = (await res.json()) as { players?: unknown };
  if (!Array.isArray(body.players)) return [];
  return body.players
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === 'object')
    .map((p) => ({
      walletAddress: String(p.walletAddress ?? ''),
      displayName: typeof p.displayName === 'string' ? p.displayName : null,
      wins: Number(p.wins) || 0,
      losses: Number(p.losses) || 0,
      totalWagered: Number(p.totalWagered) || 0,
      totalWon: Number(p.totalWon) || 0,
      lastPlayedAt: typeof p.lastPlayedAt === 'string' ? p.lastPlayedAt : null,
    }));
}

export function LeaderboardPage() {
  const navigate = useNavigate();
  const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await fetchLeaderboard();
      setPlayers(rows);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const ranked = useMemo(
    () =>
      players.map((p, i) => ({
        ...p,
        rank: i + 1,
        winRate: p.wins + p.losses > 0 ? p.wins / (p.wins + p.losses) : 0,
      })),
    [players],
  );

  const totalWon = useMemo(
    () => ranked.reduce((sum, p) => sum + p.totalWon, 0),
    [ranked],
  );

  const topWon = ranked[0]?.totalWon ?? 0;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-white/20 hover:text-white self-start"
      >
        ← Back
      </button>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-300 ring-1 ring-emerald-500/30">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Season 1 · live
          </span>
          <h1 className="mt-4 text-3xl font-black tracking-tighter text-white sm:text-4xl">
            Leaderboard
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
            Top earners across paid 1v1 matches. Standings update after every settled match.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60 sm:self-auto"
        >
          <span aria-hidden className={refreshing ? 'inline-block animate-spin' : ''}>
            ↻
          </span>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Active players" value={ranked.length.toString()} />
        <StatTile
          label="Top earnings"
          value={topWon.toLocaleString()}
          unit="$TOILET"
          accent="emerald"
        />
        <StatTile
          label="Season volume"
          value={totalWon.toLocaleString()}
          unit="$TOILET"
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 shadow-lg shadow-black/20">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-white/10 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                <th className="px-4 py-3 sm:px-5">#</th>
                <th className="px-4 py-3 sm:px-5">Player</th>
                <th className="px-4 py-3 text-right sm:px-5">W</th>
                <th className="px-4 py-3 text-right sm:px-5">L</th>
                <th className="px-4 py-3 text-right sm:px-5">Win rate</th>
                <th className="px-4 py-3 text-right sm:px-5">Total won</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-sm text-slate-500 sm:px-5"
                  >
                    Loading leaderboard…
                  </td>
                </tr>
              ) : ranked.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-sm text-slate-500 sm:px-5"
                  >
                    No matches have been played yet — be the first.
                  </td>
                </tr>
              ) : (
                ranked.map((p) => {
                  const tier = (p.rank <= 3 ? p.rank : null) as 1 | 2 | 3 | null;
                  const style = tier ? RANK_STYLES[tier] : null;
                  const handle = p.displayName ?? shortenWallet(p.walletAddress);
                  return (
                    <tr
                      key={p.walletAddress || `row-${p.rank}`}
                      className={[
                        'group transition hover:bg-white/[0.04]',
                        style?.rowClass ?? '',
                      ].join(' ')}
                    >
                      <td className="px-4 py-4 sm:px-5">
                        <div className="flex items-center gap-2">
                          {style ? (
                            <span aria-hidden className="text-lg leading-none">
                              {style.medal}
                            </span>
                          ) : null}
                          <span
                            className={[
                              'font-mono text-sm font-bold tabular-nums',
                              style?.rankClass ?? 'text-slate-400',
                            ].join(' ')}
                          >
                            {p.rank}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 sm:px-5">
                        <p className="text-sm font-bold text-white">{handle}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                          {shortenWallet(p.walletAddress)}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-sm font-semibold tabular-nums text-emerald-300 sm:px-5">
                        {p.wins}
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-sm tabular-nums text-slate-400 sm:px-5">
                        {p.losses}
                      </td>
                      <td className="px-4 py-4 text-right sm:px-5">
                        <div className="inline-flex items-center justify-end gap-2">
                          <div className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-slate-800 sm:block">
                            <div
                              className="h-full rounded-full bg-linear-to-r from-emerald-500 to-emerald-300"
                              style={{ width: `${Math.round(p.winRate * 100)}%` }}
                            />
                          </div>
                          <span className="font-mono text-sm font-semibold tabular-nums text-white">
                            {Math.round(p.winRate * 1000) / 10}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right sm:px-5">
                        <span className="font-mono text-sm font-bold tabular-nums text-white">
                          {p.totalWon.toLocaleString()}
                        </span>
                        <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">
                          $TOILET
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {error ? (
        <p className="text-[10px] uppercase tracking-[0.2em] text-rose-400">
          Failed to load leaderboard — {error}
        </p>
      ) : null}
    </div>
  );
}

function StatTile({
  label,
  value,
  unit,
  accent = 'slate',
  className = '',
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: 'slate' | 'emerald';
  className?: string;
}) {
  return (
    <div
      className={[
        'rounded-2xl border border-white/10 bg-slate-900/50 p-4 shadow-inner shadow-black/20',
        className,
      ].join(' ')}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          className={[
            'font-mono text-xl font-black tabular-nums tracking-tight sm:text-2xl',
            accent === 'emerald' ? 'text-emerald-300' : 'text-white',
          ].join(' ')}
        >
          {value}
        </span>
        {unit ? (
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

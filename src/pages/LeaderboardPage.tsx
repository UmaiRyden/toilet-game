import { useMemo, useState } from 'react';

type RawPlayer = {
  handle: string;
  wallet: string;
  wins: number;
  losses: number;
  wagered: number;
};

const MOCK_PLAYERS: RawPlayer[] = [
  { handle: 'toiletking',   wallet: '7A6vk2…xFUk', wins: 87, losses: 12, wagered: 124800 },
  { handle: 'wifhat.god',   wallet: '9kLmpQ…pQr2', wins: 71, losses: 18, wagered: 98400 },
  { handle: 'plumber.main', wallet: '3MnXyW…aV8s', wins: 64, losses: 22, wagered: 84200 },
  { handle: 'drainz',       wallet: '8tEfRb…JhN1', wins: 58, losses: 27, wagered: 71800 },
  { handle: 'cloggedup',    wallet: '5LvCmh…wT3y', wins: 51, losses: 29, wagered: 62400 },
  { handle: 'porcelain.pro',wallet: '6Bzfqp…rD9z', wins: 47, losses: 33, wagered: 54600 },
  { handle: 'flushout',     wallet: '2HpKwn…mV5x', wins: 43, losses: 34, wagered: 47200 },
  { handle: 'bowlbandit',   wallet: '4QrSth…bL8a', wins: 38, losses: 36, wagered: 41500 },
  { handle: 'seatlifter',   wallet: '1ZxPmd…fG7e', wins: 34, losses: 39, wagered: 36000 },
  { handle: 'softace',      wallet: '8YkRcq…uN2b', wins: 29, losses: 42, wagered: 31800 },
];

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

export function LeaderboardPage() {
  const [refreshing, setRefreshing] = useState(false);

  const players = useMemo(
    () =>
      MOCK_PLAYERS.map((p, i) => ({
        ...p,
        rank: i + 1,
        winRate: p.wins / (p.wins + p.losses),
      })),
    [],
  );

  const totalWagered = useMemo(
    () => players.reduce((sum, p) => sum + p.wagered, 0),
    [players],
  );

  const onRefresh = () => {
    setRefreshing(true);
    /** Mock fetch — replace with real query once leaderboard endpoint exists. */
    window.setTimeout(() => setRefreshing(false), 700);
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
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
            Top earners across paid 1v1 matches. Standings refresh after each settled round.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60 sm:self-auto"
        >
          <span aria-hidden className={refreshing ? 'inline-block animate-spin' : ''}>
            ↻
          </span>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Active players" value={players.length.toString()} />
        <StatTile
          label="Top earnings"
          value={`${players[0].wagered.toLocaleString()}`}
          unit="$TOILET"
          accent="emerald"
        />
        <StatTile
          label="Season volume"
          value={totalWagered.toLocaleString()}
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
                <th className="px-4 py-3 text-right sm:px-5">Total wagered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {players.map((p) => {
                const tier = (p.rank <= 3 ? p.rank : null) as 1 | 2 | 3 | null;
                const style = tier ? RANK_STYLES[tier] : null;
                return (
                  <tr
                    key={p.handle}
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
                      <p className="text-sm font-bold text-white">@{p.handle}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                        {p.wallet}
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
                        {p.wagered.toLocaleString()}
                      </span>
                      <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">
                        $TOILET
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600">
        Data shown is mock content. Production leaderboard wires on launch.
      </p>
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

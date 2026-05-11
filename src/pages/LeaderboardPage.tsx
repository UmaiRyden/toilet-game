const MOCK_ROWS = [
  { rank: 1, wallet: '7A6v…xFUk', wins: 42, wonToilet: '12,400' },
  { rank: 2, wallet: '9kLm…pQr2', wins: 38, wonToilet: '9,200' },
];

export function LeaderboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
        <p className="mt-1 text-sm text-slate-400">Top 10 — paid wins (spec §10). Mock data.</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Wallet</th>
              <th className="px-4 py-3 font-medium">Wins</th>
              <th className="px-4 py-3 font-medium">$TOILET won</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/40">
            {MOCK_ROWS.map((row) => (
              <tr key={row.rank}>
                <td className="px-4 py-3 text-slate-500">{row.rank}</td>
                <td className="px-4 py-3 font-mono text-white">{row.wallet}</td>
                <td className="px-4 py-3">{row.wins}</td>
                <td className="px-4 py-3 text-emerald-400">{row.wonToilet}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

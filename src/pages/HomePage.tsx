import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <div className="flex flex-1 flex-col gap-12 sm:gap-16">
      {/* Hero */}
      <header className="flex flex-1 flex-col items-center justify-center pt-6 text-center sm:items-start sm:pt-12 sm:text-left">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-300/90 ring-1 ring-emerald-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          2D PvP arena
        </span>
        <div className="mt-6 flex items-center gap-6">
          <img
            src="/assets/characters/soldier.png"
            className="h-32 w-32 shrink-0 object-contain"
            alt=""
            draggable={false}
          />
          <h1 className="text-5xl font-black leading-[0.95] tracking-tighter text-white sm:text-7xl lg:text-8xl">
            $TOILET
          </h1>
        </div>
        <p className="mt-5 max-w-xl text-sm leading-relaxed text-slate-400 sm:text-base">
          Wager $TOILET. Outlast your opponent. Best of three rounds — winner takes the pot.
        </p>
      </header>

      {/* Play mode cards */}
      <section>
        <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500">
          Choose your mode
        </h2>
        <div className="grid gap-5 md:grid-cols-2">
          <Link
            to="/lobby"
            className="group relative isolate flex flex-col overflow-hidden rounded-3xl border border-emerald-500/30 bg-linear-to-br from-emerald-950/40 via-slate-900 to-slate-950 p-6 shadow-xl shadow-emerald-950/40 transition hover:-translate-y-0.5 hover:border-emerald-400/60 hover:shadow-emerald-900/50 sm:p-8"
          >
            <div
              className="pointer-events-none absolute -right-16 -top-16 -z-10 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl transition group-hover:bg-emerald-400/25"
              aria-hidden
            />
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-500/30">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Live now
            </span>
            <h3 className="mt-6 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Paid Lobby
            </h3>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">
              Real wagers. Best of three. 1v1 — winner takes both stakes.
            </p>
            <div className="mt-6 flex flex-wrap gap-1.5">
              {['100', '500', '1,000'].map((tier) => (
                <span
                  key={tier}
                  className="rounded-md bg-emerald-500/10 px-2 py-1 font-mono text-[10px] font-bold tracking-wide text-emerald-300 ring-1 ring-emerald-500/25"
                >
                  {tier} $TOILET
                </span>
              ))}
            </div>
            <div className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-emerald-300 group-hover:text-emerald-200">
              Enter the lobby
              <span aria-hidden className="transition-transform group-hover:translate-x-1">
                →
              </span>
            </div>
          </Link>

          <Link
            to="/match/demo"
            className="group relative isolate flex flex-col overflow-hidden rounded-3xl border border-sky-500/30 bg-linear-to-br from-sky-950/40 via-slate-900 to-slate-950 p-6 shadow-xl shadow-sky-950/40 transition hover:-translate-y-0.5 hover:border-sky-400/60 hover:shadow-sky-900/50 sm:p-8"
          >
            <div
              className="pointer-events-none absolute -right-16 -top-16 -z-10 h-56 w-56 rounded-full bg-sky-500/20 blur-3xl transition group-hover:bg-sky-400/25"
              aria-hidden
            />
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-sky-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-300 ring-1 ring-sky-500/30">
              Free practice
            </span>
            <h3 className="mt-6 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Demo match
            </h3>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">
              Solo vs the house AI. Drill movement, reload rhythm, and aim — no stakes.
            </p>
            <div className="mt-6 flex flex-wrap gap-1.5">
              <span className="rounded-md bg-sky-500/10 px-2 py-1 text-[10px] font-bold tracking-wide text-sky-300 ring-1 ring-sky-500/25">
                WASD + mouse
              </span>
              <span className="rounded-md bg-sky-500/10 px-2 py-1 text-[10px] font-bold tracking-wide text-sky-300 ring-1 ring-sky-500/25">
                Best of 3
              </span>
              <span className="rounded-md bg-sky-500/10 px-2 py-1 text-[10px] font-bold tracking-wide text-sky-300 ring-1 ring-sky-500/25">
                Instant restart
              </span>
            </div>
            <div className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-sky-300 group-hover:text-sky-200">
              Start the demo
              <span aria-hidden className="transition-transform group-hover:translate-x-1">
                →
              </span>
            </div>
          </Link>
        </div>
      </section>

      {/* Meta links */}
      <nav className="mt-auto flex flex-wrap items-center gap-2 border-t border-white/5 pt-6">
        {[
          { to: '/leaderboard', label: 'Leaderboard' },
          { to: '/settings', label: 'Settings' },
          { to: '/terms', label: 'Terms' },
        ].map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="rounded-lg border border-white/5 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-slate-400 transition hover:border-white/15 hover:bg-white/10 hover:text-slate-200"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

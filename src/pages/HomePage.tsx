import { Link } from 'react-router-dom';

const linkCard =
  'group flex flex-col rounded-2xl border border-white/10 bg-slate-900/50 p-5 shadow-lg transition hover:border-white/20 hover:bg-slate-900/80 sm:p-6';

export function HomePage() {
  return (
    <div className="flex flex-1 flex-col gap-10">
      <header className="text-center sm:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-violet-400/90">ToiletWifHat</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">Main menu</h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-400 sm:mx-0 sm:text-base">
          Arena shooter shell — pick paid matchmaking, demo, or meta screens. No global nav bar; this is your hub.
        </p>
      </header>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Play</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Link to="/lobby" className={`${linkCard} border-emerald-500/25`}>
            <span className="text-2xl" aria-hidden>
              ⚔️
            </span>
            <h3 className="mt-3 text-xl font-bold text-emerald-300">Paid lobby</h3>
            <p className="mt-2 flex-1 text-sm text-slate-400">
              Create or join stake rooms — realtime matchmaking (wallet later).
            </p>
            <span className="mt-4 text-sm font-semibold text-emerald-400 group-hover:text-emerald-300">
              Enter lobby →
            </span>
          </Link>

          <Link to="/match/demo" className={`${linkCard} border-sky-500/25`}>
            <span className="text-2xl" aria-hidden>
              🎮
            </span>
            <h3 className="mt-3 text-xl font-bold text-sky-300">Demo match</h3>
            <p className="mt-2 flex-1 text-sm text-slate-400">Vs CPU — canvas placeholder for controls practice.</p>
            <span className="mt-4 text-sm font-semibold text-sky-400 group-hover:text-sky-300">Launch demo →</span>
          </Link>
        </div>
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Meta</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          <li>
            <Link
              to="/leaderboard"
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm font-medium text-slate-200 hover:border-slate-600"
            >
              Leaderboard
              <span className="text-slate-500" aria-hidden>
                →
              </span>
            </Link>
          </li>
          <li>
            <Link
              to="/settings"
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm font-medium text-slate-200 hover:border-slate-600"
            >
              Settings
              <span className="text-slate-500" aria-hidden>
                →
              </span>
            </Link>
          </li>
          <li>
            <Link
              to="/terms"
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm font-medium text-slate-200 hover:border-slate-600"
            >
              Terms
              <span className="text-slate-500" aria-hidden>
                →
              </span>
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}

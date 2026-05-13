import { Link, Outlet, useLocation } from 'react-router-dom';

/** Full-screen “main menu” shell — no site chrome; optional back link off home. */
export function HubMenuLayout() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <div className="relative min-h-dvh overflow-hidden bg-slate-950 text-slate-100">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(124,58,237,0.22),transparent_55%),radial-gradient(ellipse_80%_50%_at_100%_50%,rgba(14,165,233,0.12),transparent_45%),#020617]"
        aria-hidden
      />
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-6xl flex-col px-4 py-6 sm:px-8 sm:py-10">
        <header className="mb-6 flex shrink-0 items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2">
            <img src="/assets/characters/soldier.png" className="h-14 w-14 object-contain" alt="$TOILET" />
            <span className="text-xl font-black text-white">$TOILET</span>
          </Link>
          {!isHome ? (
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:text-white"
            >
              ← Main menu
            </Link>
          ) : null}
        </header>
        <Outlet />
      </div>
    </div>
  );
}

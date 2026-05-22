import { Link, Outlet, useLocation } from 'react-router-dom';

import { GameRealtimeProvider } from '../contexts/GameRealtimeContext';

/** Full-screen play shell — lobby / room / match (no marketing header or footer). */
export function GameShellLayout() {
  const location = useLocation();
  /**
   * Match view goes edge-to-edge so the 1280×720 Phaser canvas can scale up to fill
   * the viewport. Lobby and room views keep the centered 5xl column.
   */
  const isMatchRoute = location.pathname.startsWith('/match/');

  return (
    <GameRealtimeProvider>
    <div className="relative min-h-dvh overflow-hidden bg-slate-950 text-slate-100">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_100%_60%_at_50%_-10%,rgba(16,185,129,0.15),transparent_50%),radial-gradient(ellipse_70%_40%_at_10%_80%,rgba(59,130,246,0.08),transparent_45%),#020617]"
        aria-hidden
      />
      <div
        className={[
          'relative z-10 mx-auto flex min-h-dvh w-full flex-col',
          isMatchRoute
            ? 'max-w-none px-3 py-3 sm:px-4 sm:py-4'
            : 'max-w-5xl px-4 py-5 sm:px-6 sm:py-8',
        ].join(' ')}
      >
        <header className="mb-4 flex shrink-0 items-center gap-2">
          <Link to="/" className="flex items-center gap-2">
            <img src="/assets/characters/soldier.png" className="h-14 w-14 object-contain" alt="$TOILET" />
            <span className="text-xl font-black text-white">$TOILET</span>
          </Link>
        </header>
        <Outlet />
      </div>
    </div>
    </GameRealtimeProvider>
  );
}

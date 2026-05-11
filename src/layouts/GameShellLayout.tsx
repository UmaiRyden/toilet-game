import { Outlet } from 'react-router-dom';

import { GameRealtimeProvider } from '../contexts/GameRealtimeContext';

/** Full-screen play shell — lobby / room / match (no marketing header or footer). */
export function GameShellLayout() {
  return (
    <GameRealtimeProvider>
    <div className="relative min-h-dvh overflow-hidden bg-slate-950 text-slate-100">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_100%_60%_at_50%_-10%,rgba(16,185,129,0.15),transparent_50%),radial-gradient(ellipse_70%_40%_at_10%_80%,rgba(59,130,246,0.08),transparent_45%),#020617]"
        aria-hidden
      />
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-5 sm:px-6 sm:py-8">
        <Outlet />
      </div>
    </div>
    </GameRealtimeProvider>
  );
}

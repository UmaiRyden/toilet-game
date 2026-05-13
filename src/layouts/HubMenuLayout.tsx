import { Outlet } from 'react-router-dom';

/** Full-screen “main menu” shell — no site chrome; optional back link off home. */
export function HubMenuLayout() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-slate-950 text-slate-100">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(124,58,237,0.22),transparent_55%),radial-gradient(ellipse_80%_50%_at_100%_50%,rgba(14,165,233,0.12),transparent_45%),#020617]"
        aria-hidden
      />
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-6xl flex-col px-4 py-6 sm:px-8 sm:py-10">
        <Outlet />
      </div>
    </div>
  );
}

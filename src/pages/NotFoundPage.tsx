import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-950 px-4 text-center">
      <p className="text-6xl font-black text-slate-700">404</p>
      <p className="text-slate-400">This route does not exist.</p>
      <Link to="/" className="text-sky-400 hover:underline">
        Go home
      </Link>
    </div>
  );
}

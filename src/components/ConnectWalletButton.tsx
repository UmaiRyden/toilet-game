import { useEffect, useRef, useState } from 'react';

import { useWallet } from '../hooks/useWallet';

export function ConnectWalletButton() {
  const { connected, connect, disconnect, walletAddress, getToiletBalance } = useWallet();
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!connected) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    void getToiletBalance().then((b) => {
      if (!cancelled) setBalance(b);
    });
    return () => {
      cancelled = true;
    };
  }, [connected, getToiletBalance]);

  /** Click-outside closes the dropdown. */
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!connected) {
    return (
      <button
        type="button"
        onClick={connect}
        className="inline-flex items-center gap-2 rounded-xl bg-linear-to-br from-emerald-400 to-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-emerald-900/30 transition hover:from-emerald-300 hover:to-emerald-500"
      >
        <PhantomIcon className="h-4 w-4" />
        Connect Wallet
      </button>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-sm font-bold text-emerald-200 transition hover:bg-emerald-500/15"
      >
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" aria-hidden />
        <span className="font-mono text-xs sm:text-sm">{walletAddress}</span>
        <span className="ml-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-emerald-100">
          {balance === null ? '…' : balance.toLocaleString()} $TOILET
        </span>
        <span aria-hidden className="text-[10px] text-emerald-300/70">▾</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-white/10 bg-slate-900/95 shadow-2xl shadow-black/40 backdrop-blur"
        >
          <div className="border-b border-white/5 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Address</p>
            <p className="mt-1 break-all font-mono text-xs text-white">{walletAddress}</p>
          </div>
          <div className="border-b border-white/5 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Balance</p>
            <p className="mt-1 text-sm font-bold text-emerald-300">
              {balance === null ? 'Loading…' : `${balance.toLocaleString()} $TOILET`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void disconnect();
              setOpen(false);
            }}
            className="block w-full px-3 py-2.5 text-left text-sm font-medium text-red-300 transition hover:bg-red-500/10"
          >
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PhantomIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M21 7H3v10a2 2 0 002 2h14a2 2 0 002-2v-2h-7a3 3 0 010-6h7V9a2 2 0 00-2-2zm-3 6.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
    </svg>
  );
}

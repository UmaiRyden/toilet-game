import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet as useWalletAdapter } from '@solana/wallet-adapter-react';

import { useWallet } from '../hooks/useWallet';

function detectPhantom(): boolean {
  const w = window as Record<string, unknown>;
  const phantom = w.phantom as Record<string, unknown> | undefined;
  const solana = w.solana as Record<string, unknown> | undefined;
  return !!(phantom?.solana) || !!(solana?.isPhantom);
}

export function ConnectWalletButton() {
  const { connected, disconnect, walletAddress, getToiletBalance } = useWallet();
  const { select } = useWalletAdapter();
  const [open, setOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [phantomInstalled] = useState(detectPhantom);
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

  const handleConnectPhantom = useCallback(() => {
    select('Phantom' as Parameters<typeof select>[0]);
    setModalOpen(false);
  }, [select]);

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
      <>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-linear-to-br from-emerald-400 to-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-emerald-900/30 transition hover:from-emerald-300 hover:to-emerald-500"
        >
          <PhantomIcon className="h-4 w-4" />
          Connect Wallet
        </button>
        {modalOpen ? (
          <ConnectModal
            phantomInstalled={phantomInstalled}
            onClose={() => setModalOpen(false)}
            onConnect={handleConnectPhantom}
          />
        ) : null}
      </>
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

/** Phantom ghost logo (simplified). */
function PhantomLogoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 128 128" className={className} aria-hidden fill="none">
      <rect width="128" height="128" rx="26" fill="#ab9ff2" />
      <path
        d="M110.4 64.2c0-25.8-20.9-46.7-46.7-46.7S17 38.4 17 64.2c0 16.8 8.9 31.6 22.3 40-1.1-3.6-1.7-7.3-1.7-11.2 0-20.6 16.7-37.3 37.3-37.3 20.6 0 37.3 16.7 37.3 37.3 0 3.9-.6 7.6-1.7 11.2 13.4-8.4 22.3-23.2 22.3-40z"
        fill="white"
        opacity="0.9"
      />
      <circle cx="53" cy="73" r="7.5" fill="#ab9ff2" />
      <circle cx="75" cy="73" r="7.5" fill="#ab9ff2" />
      <path
        d="M49 95c4 5 10 8 15 8s11-3 15-8"
        stroke="#ab9ff2"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ConnectModal({
  phantomInstalled,
  onClose,
  onConnect,
}: {
  phantomInstalled: boolean;
  onClose: () => void;
  onConnect: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 px-6 py-5 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Connect your wallet</h2>
            <p className="mt-1 text-sm text-slate-400">
              Connect Phantom to play paid matches and earn $TOILET
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="mt-0.5 shrink-0 rounded-md p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-white"
          >
            <span aria-hidden className="text-sm">✕</span>
          </button>
        </div>

        {phantomInstalled ? (
          <button
            type="button"
            onClick={onConnect}
            className="flex w-full items-center gap-3 rounded-xl border border-[#ab9ff2]/30 bg-[#ab9ff2]/10 px-4 py-3 text-left transition hover:border-[#ab9ff2]/50 hover:bg-[#ab9ff2]/20"
          >
            <PhantomLogoIcon className="h-9 w-9 shrink-0" />
            <div>
              <p className="font-bold text-white">Phantom</p>
              <p className="text-xs text-[#ab9ff2]">Detected · Ready to connect</p>
            </div>
            <span className="ml-auto text-xs font-medium text-[#ab9ff2]">Connect →</span>
          </button>
        ) : (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4">
            <p className="font-bold text-amber-300">Phantom wallet not detected</p>
            <p className="mt-1.5 text-sm leading-relaxed text-amber-200/70">
              Install the Phantom browser extension to play paid matches and wager $TOILET tokens.
            </p>
            <a
              href="https://phantom.com/download"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#ab9ff2] px-4 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-[#c4baff]"
            >
              <PhantomLogoIcon className="h-4 w-4" />
              Install Phantom
            </a>
            <p className="mt-3 text-xs text-amber-200/50">
              After installing, refresh this page and connect your wallet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

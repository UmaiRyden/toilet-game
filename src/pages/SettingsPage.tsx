import { useState, type ReactNode } from 'react';

type CrosshairStyle = 'dot' | 'circle' | 'cross';

const CROSSHAIR_OPTIONS: ReadonlyArray<{ id: CrosshairStyle; label: string }> = [
  { id: 'dot', label: 'Dot' },
  { id: 'circle', label: 'Circle' },
  { id: 'cross', label: 'Cross' },
];

export function SettingsPage() {
  const [volume, setVolume] = useState(70);
  const [sfx, setSfx] = useState(true);
  const [music, setMusic] = useState(true);
  const [crosshair, setCrosshair] = useState<CrosshairStyle>('cross');
  const [showFps, setShowFps] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [saved, setSaved] = useState(false);

  const onSave = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
      <header>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-300 ring-1 ring-white/10">
          Preferences
        </span>
        <h1 className="mt-4 text-3xl font-black tracking-tighter text-white sm:text-4xl">
          Settings
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Tune audio, HUD, and account details. Changes save locally.
        </p>
      </header>

      <Section label="Audio">
        <Row label="Master volume" hint={`${volume}%`}>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-44 cursor-pointer accent-emerald-500"
          />
        </Row>
        <Row label="Sound effects" hint="Bullets, impacts, UI feedback">
          <Toggle checked={sfx} onChange={setSfx} ariaLabel="Sound effects" />
        </Row>
        <Row label="Music" hint="Round and lobby tracks">
          <Toggle checked={music} onChange={setMusic} ariaLabel="Music" />
        </Row>
      </Section>

      <Section label="Game">
        <div className="border-b border-white/5 pb-4">
          <div className="mb-3">
            <p className="text-sm font-medium text-white">Crosshair style</p>
            <p className="mt-0.5 text-xs text-slate-500">Drawn at the cursor during matches.</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {CROSSHAIR_OPTIONS.map((opt) => {
              const active = crosshair === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setCrosshair(opt.id)}
                  aria-pressed={active}
                  className={[
                    'flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-4 transition',
                    active
                      ? 'border-emerald-400/70 bg-emerald-500/10 shadow-md shadow-emerald-900/30'
                      : 'border-slate-700/80 bg-slate-900/60 hover:border-slate-500',
                  ].join(' ')}
                >
                  <CrosshairPreview type={opt.id} active={active} />
                  <span
                    className={[
                      'text-[10px] font-bold uppercase tracking-[0.2em]',
                      active ? 'text-emerald-200' : 'text-slate-400',
                    ].join(' ')}
                  >
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <Row label="Show FPS" hint="Tiny counter in the corner — useful for debugging.">
          <Toggle checked={showFps} onChange={setShowFps} ariaLabel="Show FPS counter" />
        </Row>
      </Section>

      <Section label="Account">
        <div className="border-b border-white/5 pb-4">
          <label
            htmlFor="display-name"
            className="block text-sm font-medium text-white"
          >
            Display name
          </label>
          <p className="mt-0.5 text-xs text-slate-500">
            Shown above your character and on the leaderboard.
          </p>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value.slice(0, 24))}
            placeholder="Pick a handle…"
            maxLength={24}
            className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
          />
          {displayName ? (
            <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">
              {displayName.length} / 24
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-4 pt-1">
          <div>
            <p className="text-sm font-medium text-white">Solana wallet</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Required for paid lobbies. Demo and free practice stay open.
            </p>
          </div>
          <button
            type="button"
            disabled
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-slate-500"
          >
            Connect Wallet
            <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-300 ring-1 ring-violet-500/30">
              Phase 2
            </span>
          </button>
        </div>
      </Section>

      <footer className="flex items-center justify-end gap-3 border-t border-white/5 pt-5">
        {saved ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300 ring-1 ring-emerald-500/30">
            <span aria-hidden>✓</span> Saved
          </span>
        ) : null}
        <button
          type="button"
          onClick={onSave}
          className="inline-flex items-center gap-2 rounded-xl bg-linear-to-br from-emerald-400 to-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/40 transition hover:from-emerald-300 hover:to-emerald-500"
        >
          Save settings
        </button>
      </footer>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 shadow-inner shadow-black/20 sm:p-6">
      <h2 className="mb-5 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">
        {label}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-4 last:border-b-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition',
        checked ? 'bg-emerald-500' : 'bg-slate-700',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'inline-block h-4 w-4 rounded-full bg-white shadow-md transition',
          checked ? 'translate-x-6' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  );
}

function CrosshairPreview({
  type,
  active,
}: {
  type: CrosshairStyle;
  active: boolean;
}) {
  const stroke = active ? '#a5f3fc' : '#cbd5e1';
  const fill = active ? '#22d3ee' : '#e2e8f0';
  return (
    <svg
      viewBox="0 0 32 32"
      className="h-8 w-8"
      aria-hidden
    >
      <rect x="0" y="0" width="32" height="32" rx="6" className="fill-slate-950/60" />
      {type === 'dot' && <circle cx="16" cy="16" r="2.2" fill={fill} />}
      {type === 'circle' && (
        <>
          <circle cx="16" cy="16" r="7" fill="none" stroke={stroke} strokeWidth="1.8" />
          <circle cx="16" cy="16" r="1.4" fill={fill} />
        </>
      )}
      {type === 'cross' && (
        <>
          <circle cx="16" cy="16" r="6" fill="none" stroke={stroke} strokeWidth="1.4" />
          <line x1="16" y1="5" x2="16" y2="10" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <line x1="16" y1="22" x2="16" y2="27" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <line x1="5" y1="16" x2="10" y2="16" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <line x1="22" y1="16" x2="27" y2="16" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <circle cx="16" cy="16" r="1" fill={fill} />
        </>
      )}
    </svg>
  );
}

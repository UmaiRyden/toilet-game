import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type CrosshairStyle = 'dot' | 'circle' | 'cross';

export type AppSettings = {
  /** 0-100 master volume slider value. */
  volume: number;
  sfxEnabled: boolean;
  musicEnabled: boolean;
  crosshair: CrosshairStyle;
  showFps: boolean;
  /** Trimmed display name (max 24 chars). Empty string = unset. */
  displayName: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  volume: 70,
  sfxEnabled: true,
  musicEnabled: true,
  crosshair: 'cross',
  showFps: false,
  displayName: '',
};

const STORAGE_KEY = 'toilet:settings:v1';

const CROSSHAIR_VALUES: ReadonlyArray<CrosshairStyle> = ['dot', 'circle', 'cross'];

/**
 * Sanitize a parsed-from-storage object back into a strict AppSettings.
 * Anything missing or wrong-typed falls back to the default — protects us if the
 * stored shape ever changes between releases.
 */
function coerceSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const o = raw as Record<string, unknown>;
  const volume = Number(o.volume);
  const crosshair = CROSSHAIR_VALUES.includes(o.crosshair as CrosshairStyle)
    ? (o.crosshair as CrosshairStyle)
    : DEFAULT_SETTINGS.crosshair;
  const displayName =
    typeof o.displayName === 'string'
      ? o.displayName.slice(0, 24)
      : DEFAULT_SETTINGS.displayName;
  return {
    volume: Number.isFinite(volume)
      ? Math.max(0, Math.min(100, Math.round(volume)))
      : DEFAULT_SETTINGS.volume,
    sfxEnabled: typeof o.sfxEnabled === 'boolean' ? o.sfxEnabled : DEFAULT_SETTINGS.sfxEnabled,
    musicEnabled:
      typeof o.musicEnabled === 'boolean' ? o.musicEnabled : DEFAULT_SETTINGS.musicEnabled,
    crosshair,
    showFps: typeof o.showFps === 'boolean' ? o.showFps : DEFAULT_SETTINGS.showFps,
    displayName,
  };
}

function loadFromStorage(): AppSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return coerceSettings(JSON.parse(raw));
  } catch {
    /** localStorage may be disabled (private mode, sandboxed iframe). Fall back silently. */
    return { ...DEFAULT_SETTINGS };
  }
}

function saveToStorage(value: AppSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /** No-op — the in-memory context still has the value for this session. */
  }
}

type SettingsContextValue = {
  settings: AppSettings;
  /** Partial update — merges into current settings and persists to localStorage. */
  update: (patch: Partial<AppSettings>) => void;
  /** Replace the entire settings object (used by Save). */
  set: (next: AppSettings) => void;
  /** Reset to factory defaults. */
  reset: () => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  /** Lazy initializer — hydrate from localStorage exactly once at mount. */
  const [settings, setSettings] = useState<AppSettings>(() => loadFromStorage());

  /** Latest value mirrored into a ref so write-through doesn't depend on closure state. */
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  /** Cross-tab sync: if another tab writes the same key, mirror it here. */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const next = coerceSettings(JSON.parse(e.newValue));
        setSettings(next);
      } catch {
        /** Ignore malformed cross-tab payloads. */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const set = useCallback((next: AppSettings) => {
    setSettings(next);
    saveToStorage(next);
  }, []);

  const update = useCallback((patch: Partial<AppSettings>) => {
    const merged = { ...settingsRef.current, ...patch };
    setSettings(merged);
    saveToStorage(merged);
  }, []);

  const reset = useCallback(() => {
    const fresh = { ...DEFAULT_SETTINGS };
    setSettings(fresh);
    saveToStorage(fresh);
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, update, set, reset }),
    [settings, update, set, reset],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return ctx;
}

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_STORAGE_KEY,
  isThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '@/lib/theme/theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/* -------------------------------------------------------------------------- */
/* The stored preference, as an external store                                */
/* -------------------------------------------------------------------------- */
/*
 * localStorage genuinely is state that lives outside React, so it is read with
 * useSyncExternalStore rather than copied into component state by an effect.
 * That also gets the server/client split right for free: React renders the
 * server snapshot while hydrating and swaps to the real value straight after,
 * instead of producing a hydration mismatch.
 */

const listeners = new Set<() => void>();
let cachedPreference: ThemePreference | null = null;

/**
 * Applies a resolved theme to the document.
 *
 * This is called from wherever the preference actually *changes* — never from
 * a render effect. An effect would also fire on the hydration pass, and on that
 * pass `useSyncExternalStore` is obliged to hand back the *server* snapshot
 * (the default) rather than the stored value. Writing that to the DOM replaced
 * the correct pre-paint value with the default and then corrected it a frame
 * later: precisely the flash of the wrong theme the boot script exists to
 * prevent. The document is already right on load; nothing needs to touch it
 * until something genuinely changes.
 */
function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  // Keeps native widgets — scrollbars, select popups, date pickers — in step
  // with the palette rather than always drawing them light.
  root.style.colorScheme = resolved;
}

function readStoredPreference(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : DEFAULT_THEME_PREFERENCE;
  } catch {
    // Private browsing or a blocked storage partition.
    return DEFAULT_THEME_PREFERENCE;
  }
}

/** Must return a stable value between changes, hence the cache. */
function getPreferenceSnapshot(): ThemePreference {
  cachedPreference ??= readStoredPreference();
  return cachedPreference;
}

function getPreferenceServerSnapshot(): ThemePreference {
  return DEFAULT_THEME_PREFERENCE;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribeToPreference(onChange: () => void): () => void {
  listeners.add(onChange);

  // Another tab changed the choice — mirror it here, document included.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    cachedPreference = readStoredPreference();
    applyTheme(resolveTheme(cachedPreference, getSystemSnapshot()));
    emit();
  };

  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

function storePreference(next: ThemePreference): void {
  cachedPreference = next;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Not fatal — the choice simply will not survive this session.
  }
  // Applied here rather than downstream of a re-render, so the switch is
  // immediate and does not depend on React having committed anything.
  applyTheme(resolveTheme(next, getSystemSnapshot()));
  emit();
}

/* -------------------------------------------------------------------------- */
/* The operating system's preference, likewise external                        */
/* -------------------------------------------------------------------------- */

function subscribeToSystem(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getSystemSnapshot(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

function getSystemServerSnapshot(): boolean {
  return false;
}

/* -------------------------------------------------------------------------- */

interface ThemeContextValue {
  /** What the user chose, which may be "system". */
  preference: ThemePreference;
  /** What is actually painted. */
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useSyncExternalStore(
    subscribeToPreference,
    getPreferenceSnapshot,
    getPreferenceServerSnapshot,
  );

  const systemPrefersDark = useSyncExternalStore(
    subscribeToSystem,
    getSystemSnapshot,
    getSystemServerSnapshot,
  );

  // The same function the boot script's logic mirrors, so the pre-paint value
  // and the hydrated value cannot disagree. This drives the toggle's own UI;
  // the document is updated by `applyTheme` at the point of change.
  const resolved: ResolvedTheme = resolveTheme(preference, systemPrefersDark);

  // "System" is the one preference whose resolved value can change without the
  // user doing anything, so it is the one case that needs a live subscription.
  // The resync on subscribe covers an OS change that happened between the boot
  // script running and this effect attaching.
  useEffect(() => {
    if (preference !== 'system') return;

    const query = window.matchMedia(DARK_QUERY);
    const apply = () => applyTheme(query.matches ? 'dark' : 'light');

    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => storePreference(next), []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside a ThemeProvider');
  return context;
}

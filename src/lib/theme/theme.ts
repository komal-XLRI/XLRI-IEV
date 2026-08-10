/**
 * Theme vocabulary, shared by the boot script, the provider and the toggle.
 *
 * Two distinct ideas, deliberately named differently:
 *
 *   ThemePreference  what the user chose — including "system"
 *   ResolvedTheme    what is actually painted — only "light" or "dark"
 *
 * `data-theme` on <html> always carries a *resolved* value, so CSS never has to
 * express a colour twice (once for a class, once for a media query).
 */
export const THEME_STORAGE_KEY = 'iev-theme';

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = 'light' | 'dark';

/**
 * Light, not "system".
 *
 * Following the device sounds like the considerate default, but it means the
 * application has no settled appearance: the same screen is white for one
 * administrator and charcoal for the next, decided by an OS setting — or by
 * the browser's own appearance setting, which reports `prefers-color-scheme:
 * dark` even on a light desktop. For an institutional record system the
 * default should be the deliberate one, and dark is an explicit choice a user
 * makes rather than something they arrive in without asking.
 *
 * "System" remains one of the three options and still follows the device live.
 */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'light';

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

export const THEME_LABELS: Record<ThemePreference, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

/**
 * The one rule that turns a preference into a painted theme.
 *
 * It lives here rather than inline in the provider because it is the same
 * decision the boot script makes, and the two have to agree exactly — if they
 * ever disagree the page paints one theme before hydration and jumps to the
 * other after it. Being a plain function, it is also directly testable, which
 * an inline ternary inside a component is not.
 */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemPrefersDark ? 'dark' : 'light';
}

/**
 * Runs in <head>, before the browser paints anything.
 *
 * Without this the page would render with the default palette and then jump to
 * the stored one — the "theme flash". It is inlined rather than imported so
 * that no network round trip can happen between first paint and the fix.
 *
 * Written as a string of ES5 because it executes before any bundling or
 * transpilation applies to it.
 *
 * The device is consulted only when the stored choice is *explicitly*
 * "system". A missing or corrupted value resolves to the default instead —
 * otherwise a first-time visitor on a dark desktop would be handed a dark
 * application they never asked for, and the boot script would disagree with
 * the provider about what the default means.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var d=${JSON.stringify(DEFAULT_THEME_PREFERENCE)};var s=window.localStorage.getItem(k);if(s!=='light'&&s!=='dark'&&s!=='system')s=d;var t=s==='system'?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):s;var e=document.documentElement;e.setAttribute('data-theme',t);e.style.colorScheme=t;}catch(_){document.documentElement.setAttribute('data-theme','light');}})();`;

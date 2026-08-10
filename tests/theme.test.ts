import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_BOOT_SCRIPT,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  isThemePreference,
  resolveTheme,
} from '../src/lib/theme/theme';

describe('theme preference', () => {
  it('accepts only the three known values', () => {
    for (const value of THEME_PREFERENCES) expect(isThemePreference(value)).toBe(true);
    for (const value of ['', 'Dark', 'auto', null, undefined, 0, {}]) {
      expect(isThemePreference(value)).toBe(false);
    }
  });

  it('defaults to light rather than to the device', () => {
    // Following the device gives the application no settled appearance, and a
    // browser set to a dark appearance reports `prefers-color-scheme: dark`
    // even on a light desktop — so "system" is an explicit choice, not the
    // starting point.
    expect(DEFAULT_THEME_PREFERENCE).toBe('light');
  });
});

describe('resolveTheme', () => {
  it('honours an explicit choice regardless of the device', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('dark', true)).toBe('dark');
  });

  it('follows the device only for "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

/**
 * The boot script is the whole defence against the theme flash, and it runs
 * before any of this app's code exists. These run it the way a browser would —
 * as a bare string against a stand-in document — so a change that breaks it
 * fails here rather than as a white flash on someone's screen.
 */
describe('boot script', () => {
  interface FakeRoot {
    attributes: Record<string, string>;
    style: { colorScheme: string };
  }

  function run({ stored, systemDark }: { stored?: string | null; systemDark?: boolean }): FakeRoot {
    const root: FakeRoot = { attributes: {}, style: { colorScheme: '' } };

    const context = {
      window: {
        localStorage: {
          getItem: (key: string) => (key === THEME_STORAGE_KEY ? (stored ?? null) : null),
        },
        matchMedia: (query: string) => ({ matches: query.includes('dark') && !!systemDark }),
      },
      document: {
        documentElement: {
          setAttribute: (name: string, value: string) => {
            root.attributes[name] = value;
          },
          style: root.style,
        },
      },
    };

    new Function('window', 'document', THEME_BOOT_SCRIPT)(context.window, context.document);
    return root;
  }

  it('uses a stored explicit choice over the device setting', () => {
    expect(run({ stored: 'light', systemDark: true }).attributes['data-theme']).toBe('light');
    expect(run({ stored: 'dark', systemDark: false }).attributes['data-theme']).toBe('dark');
  });

  it('follows the device only when "system" was chosen explicitly', () => {
    expect(run({ stored: 'system', systemDark: true }).attributes['data-theme']).toBe('dark');
    expect(run({ stored: 'system', systemDark: false }).attributes['data-theme']).toBe('light');
  });

  it('gives a first-time visitor the default, whatever the device says', () => {
    // The regression this guards: a dark desktop — or merely a browser set to
    // a dark appearance — used to hand a brand-new user a dark application
    // they never asked for.
    expect(run({ stored: null, systemDark: true }).attributes['data-theme']).toBe('light');
    expect(run({ stored: null, systemDark: false }).attributes['data-theme']).toBe('light');
  });

  it('ignores a corrupted stored value rather than applying it', () => {
    expect(run({ stored: 'purple', systemDark: true }).attributes['data-theme']).toBe('light');
  });

  /**
   * The invariant that matters most.
   *
   * The boot script paints before hydration and `resolveTheme` decides what
   * React renders afterwards. They are two independent implementations of one
   * decision, written in two languages (a string of ES5, and TypeScript). If
   * they ever disagree the user sees one theme flash into the other — which is
   * indistinguishable, from the outside, from "the toggle does not work".
   */
  it.each([
    [null, true],
    [null, false],
    ['light', true],
    ['light', false],
    ['dark', true],
    ['dark', false],
    ['system', true],
    ['system', false],
    ['purple', true],
    ['purple', false],
  ])('agrees with resolveTheme for stored=%s systemDark=%s', (stored, systemDark) => {
    const booted = run({ stored, systemDark }).attributes['data-theme'];
    const preference = isThemePreference(stored) ? stored : DEFAULT_THEME_PREFERENCE;
    expect(booted).toBe(resolveTheme(preference, systemDark));
  });

  it('sets color-scheme too, so native widgets match', () => {
    expect(run({ stored: 'dark' }).style.colorScheme).toBe('dark');
  });

  it('still resolves a theme when storage throws', () => {
    const root = { attributes: {} as Record<string, string>, style: { colorScheme: '' } };
    const blockedWindow = {
      localStorage: {
        getItem: () => {
          throw new Error('storage is blocked');
        },
      },
      matchMedia: () => ({ matches: false }),
    };
    const fakeDocument = {
      documentElement: {
        setAttribute: (name: string, value: string) => {
          root.attributes[name] = value;
        },
        style: root.style,
      },
    };

    expect(() =>
      new Function('window', 'document', THEME_BOOT_SCRIPT)(blockedWindow, fakeDocument),
    ).not.toThrow();
    expect(root.attributes['data-theme']).toBe('light');
  });
});

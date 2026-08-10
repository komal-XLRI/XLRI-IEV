/**
 * A boolean that lives in localStorage and is read through React's external
 * store API.
 *
 * The naive version — `useState(false)` plus an effect that reads storage —
 * triggers a cascading render on every mount and is flagged by
 * `react-hooks/set-state-in-effect`. Modelling storage as what it actually is,
 * a store outside React, also gets the server/client split right: React renders
 * the server snapshot while hydrating and swaps to the stored value straight
 * after, with no mismatch.
 */

export interface PersistentFlag {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => boolean;
  getServerSnapshot: () => boolean;
  set: (value: boolean) => void;
  /** Inline script that applies the flag to <html> before first paint. */
  bootScript: string;
}

/**
 * @param key       localStorage key
 * @param attribute data-attribute stamped on <html> so CSS can react before
 *                  hydration, avoiding a visible jump
 */
export function createPersistentFlag(key: string, attribute: string): PersistentFlag {
  const listeners = new Set<() => void>();
  let cached: boolean | null = null;

  function read(): boolean {
    try {
      return window.localStorage.getItem(key) === '1';
    } catch {
      // Blocked storage — the flag simply stays at its default.
      return false;
    }
  }

  function emit(): void {
    for (const listener of listeners) listener();
  }

  return {
    subscribe(onChange) {
      listeners.add(onChange);

      // Another tab changed it — mirror it here.
      const onStorage = (event: StorageEvent) => {
        if (event.key !== key) return;
        cached = read();
        emit();
      };

      window.addEventListener('storage', onStorage);

      return () => {
        listeners.delete(onChange);
        window.removeEventListener('storage', onStorage);
      };
    },

    getSnapshot() {
      cached ??= read();
      return cached;
    },

    getServerSnapshot() {
      return false;
    },

    set(value) {
      cached = value;
      try {
        window.localStorage.setItem(key, value ? '1' : '0');
      } catch {
        // Not fatal — the choice just will not survive this session.
      }
      document.documentElement.toggleAttribute(attribute, value);
      emit();
    },

    bootScript: `(function(){try{if(window.localStorage.getItem(${JSON.stringify(key)})==='1')document.documentElement.setAttribute(${JSON.stringify(attribute)},'');}catch(_){}})();`,
  };
}

/**
 * The navigation rail's collapsed state.
 *
 * `data-sidebar-collapsed` on <html> lets the stylesheet set the rail width
 * before React hydrates, so a user who collapsed it does not watch it snap
 * shut on every page load.
 */
export const sidebarCollapsed = createPersistentFlag(
  'iev-sidebar-collapsed',
  'data-sidebar-collapsed',
);

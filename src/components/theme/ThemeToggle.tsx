'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { THEME_LABELS, THEME_PREFERENCES, type ThemePreference } from '@/lib/theme/theme';
import { useTheme } from './ThemeProvider';

const ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

const HINTS: Record<ThemePreference, string> = {
  light: 'Always light',
  dark: 'Always dark',
  system: 'Match my device',
};

/**
 * Three states rather than two, because "no preference" is a real answer: a
 * user who has never chosen should follow their device, and should be able to
 * get back to that after trying the other two.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, resolved, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // "System" shows the monitor rather than the theme it currently resolves to,
  // so the trigger reports the choice, not just the outcome.
  const TriggerIcon = preference === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun;

  return (
    <div ref={containerRef} className={cn('relative', className)} data-print="hide">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Theme: ${THEME_LABELS[preference]}`}
        title="Change theme"
        className="text-muted-foreground border-input-border hover:bg-surface-hover hover:border-border-strong hover:text-foreground inline-flex size-9 items-center justify-center rounded-lg border transition-colors"
      >
        <TriggerIcon className="size-4" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Theme"
          className="surface-overlay absolute right-0 z-40 mt-1.5 w-48 overflow-hidden rounded-lg"
        >
          <p className="type-overline border-b px-3 py-2">Appearance</p>

          {THEME_PREFERENCES.map((option) => {
            const Icon = ICONS[option];
            const selected = preference === option;

            return (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  setPreference(option);
                  setOpen(false);
                }}
                className={cn(
                  'hover:bg-surface-hover flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
                  selected && 'text-primary-soft-foreground bg-primary-soft',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{THEME_LABELS[option]}</span>
                  <span className="text-muted-foreground block text-xs">{HINTS[option]}</span>
                </span>
                {/* A tick as well as the tint, so the selection is not carried
                    by colour alone. */}
                {selected ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

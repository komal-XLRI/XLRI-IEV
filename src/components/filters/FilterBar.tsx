'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { ListFilter, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { COMPACT_CONTROL_CLASSES } from '@/components/ui/Field';
import { commitValue, filterHref, nextSearchParams, shouldCommit } from '@/lib/utils/filterParams';
import { cn } from '@/lib/utils/cn';

export interface FilterOption {
  value: string;
  label: string;
}

/** How long typing pauses before the search is applied. */
const SEARCH_DEBOUNCE_MS = 400;

/**
 * A search box that applies itself.
 *
 * It previously committed only on blur or Enter, which is invisible: typing a
 * name and watching the unchanged list below reads as a broken filter, not as
 * a form waiting to be submitted. Debouncing keeps the original intent — no
 * request per keystroke — while removing the need to know the secret.
 *
 * The input stays controlled by local state so it never fights the user's
 * cursor mid-word, and re-syncs when the URL changes underneath it (a filter
 * chip removed, "Clear all" pressed, or the back button).
 */
function SearchField({
  id,
  value,
  placeholder,
  onCommit,
}: {
  id: string;
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);

  useEffect(() => {
    if (value === committed.current) return;
    committed.current = value;
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (!shouldCommit(draft, committed.current)) return;

    const timer = setTimeout(() => {
      committed.current = commitValue(draft);
      onCommit(committed.current);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [draft, onCommit]);

  return (
    <input
      id={id}
      type="search"
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      // Enter applies immediately rather than waiting out the debounce.
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        committed.current = commitValue(event.currentTarget.value);
        onCommit(committed.current);
      }}
      className={COMPACT_CONTROL_CLASSES}
    />
  );
}

export interface FilterFieldDef {
  /** Query-string key — must match a field on `reportFilterSchema`. */
  name: string;
  label: string;
  type: 'select' | 'search' | 'date';
  options?: FilterOption[];
  placeholder?: string;
}

/**
 * Writes filter state into the URL rather than component state.
 *
 * That single decision is what lets the export endpoint reproduce the screen
 * exactly, makes a filtered view shareable as a link, and survives a refresh —
 * all without the page and the exporter keeping separate copies of the filters.
 *
 * The controls collapse behind a toggle on narrow screens: a row of six selects
 * is most of a phone's viewport, and the applied-filter chips below say what is
 * active without them being open.
 */
export function FilterBar({
  fields,
  children,
}: {
  fields: FilterFieldDef[];
  /** Slot for the export menu, so filters and exports sit together. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);

  const current = (name: string) => searchParams.get(name) ?? '';

  const active = fields
    .map((field) => ({ field, value: current(field.name) }))
    .filter((entry) => entry.value !== '');

  // Stable identity: the debounced search field holds this in an effect, and a
  // new function on every render would restart the timer before it ever fired.
  const update = useCallback(
    (name: string, value: string) => {
      const params = nextSearchParams(searchParams.toString(), name, value);

      startTransition(() => {
        router.replace(filterHref(pathname, params), { scroll: false });
      });
    },
    [router, pathname, searchParams],
  );

  function clearAll() {
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }

  /** Shows the chosen option's label rather than its id. */
  function displayValue(field: FilterFieldDef, value: string): string {
    if (field.type !== 'select') return value;
    return field.options?.find((option) => option.value === value)?.label ?? value;
  }

  return (
    <div className="surface-card rounded-card mb-4" data-print="hide">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <span className="type-overline flex items-center gap-1.5">
          <ListFilter className="size-3.5" aria-hidden="true" />
          Filters
        </span>

        {active.length > 0 ? (
          <span className="bg-primary-soft text-primary-soft-foreground rounded-full px-2 py-0.5 text-[11px] font-semibold">
            {active.length} applied
          </span>
        ) : null}

        {pending ? (
          <span className="type-caption flex items-center gap-1.5" role="status">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            Updating
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {active.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={clearAll} disabled={pending}>
              <X className="size-3.5" aria-hidden="true" />
              Clear all
            </Button>
          ) : null}

          <Button
            variant="secondary"
            size="sm"
            className="sm:hidden"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            {expanded ? 'Hide' : 'Show'} filters
          </Button>

          {children}
        </div>
      </div>

      <div className={cn('px-4 py-3', expanded ? 'block' : 'hidden sm:block')}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {fields.map((field) => (
            <div key={field.name} className="min-w-0">
              <label
                htmlFor={`filter-${field.name}`}
                className="type-caption mb-1 block font-medium"
              >
                {field.label}
              </label>

              {field.type === 'select' ? (
                <select
                  id={`filter-${field.name}`}
                  value={current(field.name)}
                  onChange={(event) => update(field.name, event.target.value)}
                  className={COMPACT_CONTROL_CLASSES}
                >
                  <option value="">All</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.type === 'date' ? (
                <input
                  id={`filter-${field.name}`}
                  type="date"
                  value={current(field.name)}
                  onChange={(event) => update(field.name, event.target.value)}
                  className={COMPACT_CONTROL_CLASSES}
                />
              ) : (
                <SearchField
                  id={`filter-${field.name}`}
                  value={current(field.name)}
                  placeholder={field.placeholder}
                  onCommit={(value) => update(field.name, value)}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Applied filters stay visible even when the controls are collapsed, and
          each chip removes just its own filter. */}
      {active.length > 0 ? (
        <div className="surface-sunken flex flex-wrap items-center gap-1.5 border-t px-4 py-2">
          {active.map(({ field, value }) => (
            <button
              key={field.name}
              type="button"
              onClick={() => update(field.name, '')}
              className="border-primary-border bg-primary-soft text-primary-soft-foreground inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium transition-all hover:brightness-95"
            >
              <span className="font-normal">{field.label}:</span>
              <span className="max-w-40 truncate">{displayValue(field, value)}</span>
              <X className="size-3 shrink-0" aria-hidden="true" />
              <span className="sr-only">Remove this filter</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

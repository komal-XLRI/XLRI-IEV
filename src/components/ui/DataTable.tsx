'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Columns3,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { DataCell, DataColumn, DataRow } from './dataTableModel';

export type { DataCell, DataColumn, DataRow } from './dataTableModel';
import { EmptyState } from './Card';

/**
 * One table implementation for the whole application.
 *
 * Sorting and searching need to compare and match values, which means
 * functions — and a function prop cannot cross the RSC boundary. So the row
 * model is built on the server, where the data already is: each cell carries
 * what to *render*, what to *sort* by, and what to *match* against. The client
 * only ever handles interaction.
 *
 * That split is what lets a server-rendered cell hold a Server Action form or a
 * status badge while the table around it still sorts and filters.
 */

const HIDE_BELOW: Record<NonNullable<DataColumn['hideBelow']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
};

const ALIGN: Record<NonNullable<DataColumn['align']>, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

function compare(a: DataCell | undefined, b: DataCell | undefined): number {
  const left = a?.sort ?? '';
  const right = b?.sort ?? '';

  if (typeof left === 'number' && typeof right === 'number') return left - right;

  // `numeric` keeps V2 before V10, which a plain string sort gets wrong.
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export function DataTable({
  columns,
  rows,
  caption,
  searchPlaceholder = 'Search this table',
  pageSize = 25,
  emptyTitle = 'Nothing to show',
  emptyDescription,
  emptyAction,
  toolbar,
  stickyHeader = true,
  dense = false,
}: {
  columns: DataColumn[];
  rows: DataRow[];
  /** Accessible name, announced instead of "table with N rows". */
  caption: string;
  searchPlaceholder?: string;
  /** 0 disables paging — right for short, fixed lists. */
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  toolbar?: ReactNode;
  stickyHeader?: boolean;
  dense?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ index: number; direction: 'asc' | 'desc' } | null>(null);
  const [page, setPage] = useState(0);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);

  const searchable = rows.some((row) => row.cells.some((cell) => cell.text ?? cell.sort));
  const toggleable = columns.filter((column) => column.toggleable);

  const visible = columns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => !hidden.has(column.key));

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((row) =>
      row.cells.some((cell) =>
        String(cell.text ?? cell.sort ?? '')
          .toLowerCase()
          .includes(needle),
      ),
    );
  }, [rows, query]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => factor * compare(a.cells[sort.index], b.cells[sort.index]));
  }, [filtered, sort]);

  const paged = pageSize > 0 ? sorted.slice(page * pageSize, page * pageSize + pageSize) : sorted;
  const pageCount = pageSize > 0 ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  // A filter that shrinks the list can strand the viewer on a page past the
  // end; clamp during render rather than chasing it with an effect.
  const safePage = Math.min(page, pageCount - 1);
  if (safePage !== page) setPage(safePage);

  function toggleSort(index: number) {
    setPage(0);
    setSort((current) => {
      if (current?.index !== index) return { index, direction: 'asc' };
      if (current.direction === 'asc') return { index, direction: 'desc' };
      return null; // third click returns to the natural order
    });
  }

  const showToolbar = searchable || toggleable.length > 0 || toolbar;

  return (
    <div className="flex flex-col">
      {showToolbar ? (
        <div
          className="flex flex-wrap items-center gap-2 border-b px-4 py-3 sm:px-5"
          data-print="hide"
        >
          {searchable ? (
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
                placeholder={searchPlaceholder}
                aria-label={`Search ${caption}`}
                className="border-input-border bg-input placeholder:text-input-placeholder hover:border-border-strong rounded-control w-full border py-1.5 pr-3 pl-8 text-[13px] transition-colors"
              />
            </div>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            {toolbar}

            {toggleable.length > 0 ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setColumnMenuOpen((value) => !value)}
                  aria-haspopup="menu"
                  aria-expanded={columnMenuOpen}
                  className="text-secondary-foreground border-input-border hover:bg-surface-hover hover:border-border-strong rounded-control inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-[13px] font-medium transition-colors"
                >
                  <Columns3 className="size-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Columns</span>
                </button>

                {columnMenuOpen ? (
                  <>
                    {/* Click-away layer, so the menu closes without a global
                        listener that would also fire on the trigger. */}
                    <div
                      className="fixed inset-0 z-30"
                      aria-hidden="true"
                      onClick={() => setColumnMenuOpen(false)}
                    />
                    <div
                      role="menu"
                      className="surface-overlay rounded-control absolute right-0 z-40 mt-1.5 w-52 overflow-hidden py-1"
                    >
                      <p className="type-overline px-3 py-1.5">Show columns</p>
                      {toggleable.map((column) => (
                        <label
                          key={column.key}
                          className="hover:bg-surface-hover flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[13px]"
                        >
                          <input
                            type="checkbox"
                            checked={!hidden.has(column.key)}
                            onChange={() =>
                              setHidden((current) => {
                                const next = new Set(current);
                                if (next.has(column.key)) next.delete(column.key);
                                else next.add(column.key);
                                return next;
                              })
                            }
                            className="border-input-border accent-primary size-3.5 rounded border"
                          />
                          {column.header}
                        </label>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <EmptyState
          title={query ? 'No matches' : emptyTitle}
          description={
            query ? `Nothing in this table matches “${query.trim()}”.` : emptyDescription
          }
          action={
            query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-primary text-[13px] font-medium hover:underline"
              >
                Clear the search
              </button>
            ) : (
              emptyAction
            )
          }
        />
      ) : (
        <>
          {/* The scroller is the table's own, so a wide table never makes the
              page scroll sideways. `max-h` is what makes the sticky header
              actually stick rather than scroll away with the page. */}
          <div
            className={cn('w-full overflow-x-auto', stickyHeader && 'max-h-[60vh] overflow-y-auto')}
          >
            <table className="w-full border-collapse text-[13.5px]">
              <caption className="sr-only">{caption}</caption>
              <thead>
                <tr>
                  {visible.map(({ column, index }) => {
                    const active = sort?.index === index;
                    const sortable =
                      column.sortable !== false && rows[0]?.cells[index]?.sort != null;

                    return (
                      <th
                        key={column.key}
                        scope="col"
                        aria-sort={
                          active
                            ? sort.direction === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : sortable
                              ? 'none'
                              : undefined
                        }
                        className={cn(
                          'bg-table-header text-table-header-foreground border-b px-4 py-2.5 text-[11.5px] font-semibold tracking-[0.055em] whitespace-nowrap uppercase',
                          stickyHeader && 'sticky top-0 z-10',
                          ALIGN[column.align ?? 'left'],
                          column.hideBelow && HIDE_BELOW[column.hideBelow],
                        )}
                      >
                        {sortable ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(index)}
                            className={cn(
                              'hover:text-foreground inline-flex items-center gap-1 transition-colors',
                              column.align === 'right' && 'flex-row-reverse',
                              active && 'text-foreground',
                            )}
                          >
                            {column.header}
                            {active ? (
                              sort.direction === 'asc' ? (
                                <ArrowUp className="size-3" aria-hidden="true" />
                              ) : (
                                <ArrowDown className="size-3" aria-hidden="true" />
                              )
                            ) : (
                              // A token rather than `opacity-40`: dimming an
                              // already-muted colour lands wherever it lands,
                              // outside anything the palette guarantees.
                              <ChevronsUpDown
                                className="text-subtle-foreground size-3"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        ) : (
                          column.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {paged.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-table-row-hover border-b transition-colors last:border-b-0"
                  >
                    {visible.map(({ column, index }) => (
                      <td
                        key={column.key}
                        className={cn(
                          'px-4 align-middle',
                          dense ? 'py-2' : 'py-3',
                          ALIGN[column.align ?? 'left'],
                          column.hideBelow && HIDE_BELOW[column.hideBelow],
                          column.clamp && 'max-w-[22rem] truncate',
                        )}
                      >
                        {row.cells[index]?.node ?? <span className="text-muted-foreground">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pageSize > 0 && sorted.length > pageSize ? (
            <div
              className="type-secondary flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-5"
              data-print="hide"
            >
              <p>
                <span className="text-foreground font-medium">
                  {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)}
                </span>{' '}
                of {sorted.length}
                {filtered.length !== rows.length ? ` (filtered from ${rows.length})` : ''}
              </p>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.max(0, value - 1))}
                  disabled={safePage === 0}
                  aria-label="Previous page"
                  className="border-input-border hover:bg-surface-hover hover:border-border-strong rounded-control disabled:bg-muted disabled:text-subtle-foreground inline-flex size-8 items-center justify-center border transition-colors disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </button>
                <span className="px-2 text-[13px]">
                  Page {safePage + 1} of {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
                  disabled={safePage >= pageCount - 1}
                  aria-label="Next page"
                  className="border-input-border hover:bg-surface-hover hover:border-border-strong rounded-control disabled:bg-muted disabled:text-subtle-foreground inline-flex size-8 items-center justify-center border transition-colors disabled:cursor-not-allowed"
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

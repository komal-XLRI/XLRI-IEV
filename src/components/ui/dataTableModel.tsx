import type { ReactNode } from 'react';

/**
 * The table's data model, kept out of the client component that renders it.
 *
 * `DataTable` is a Client Component, and a Server Component may render a client
 * component but may not *call* a function exported from one. Server pages build
 * their own rows — that is the whole point of the split — so the row helpers
 * have to live in a module with no `'use client'` directive, importable from
 * either side.
 */

export interface DataCell {
  /** What is drawn. */
  node: ReactNode;
  /** Comparable value for sorting. Omit to make the column unsortable. */
  sort?: string | number | null;
  /** Text matched by the search box. Falls back to `sort`. */
  text?: string;
}

export interface DataRow {
  id: string;
  cells: DataCell[];
  /** Renders the row as a link target and shows a pointer on hover. */
  href?: string;
}

export interface DataColumn {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  /** Hidden below this breakpoint, keeping narrow screens readable. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
  /** Offered in the column menu. Primary identifying columns should not be. */
  toggleable?: boolean;
  /** Stops long free text from crowding out the rest of the row. */
  clamp?: boolean;
}

/** Convenience for the common "plain text cell" case. */
export function textCell(value: string | number | null | undefined): DataCell {
  if (value === null || value === undefined || value === '') {
    return { node: <span className="text-muted-foreground">—</span>, sort: '', text: '' };
  }
  return { node: String(value), sort: value, text: String(value) };
}

import type { ColumnDef, ColumnType } from './types';

/**
 * Shared cell rendering. CSV, PDF and print all want a display string; XLSX
 * wants native values so Excel can sort and sum them. Both come from here so
 * the four formats agree on what a cell contains.
 */

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

export type CellValue = string | number | boolean | Date | null | undefined;

/** Display string for text-based formats. Empty rather than "null"/"undefined". */
export function formatCell(value: CellValue, type: ColumnType = 'text'): string {
  if (value === null || value === undefined) return '';

  switch (type) {
    case 'date':
      return value instanceof Date ? DATE.format(value) : String(value);
    case 'datetime':
      return value instanceof Date ? DATE_TIME.format(value) : String(value);
    case 'percent':
      return typeof value === 'number' ? `${value}%` : String(value);
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'number':
      return typeof value === 'number' ? String(value) : String(value);
    default:
      return String(value);
  }
}

/** Native value for XLSX, so numbers stay numeric and dates stay dates. */
export function nativeCell(value: CellValue, type: ColumnType = 'text'): CellValue {
  if (value === null || value === undefined) return '';
  if (type === 'boolean') return value ? 'Yes' : 'No';
  if (type === 'percent' && typeof value === 'number') return value / 100;
  return value;
}

export function cellsFor<Row>(columns: ColumnDef<Row>[], row: Row): string[] {
  return columns.map((column) => formatCell(column.value(row), column.type));
}

export function headersFor<Row>(columns: ColumnDef<Row>[]): string[] {
  return columns.map((column) => column.header);
}

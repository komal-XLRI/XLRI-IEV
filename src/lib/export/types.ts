/**
 * A format-agnostic description of tabular output.
 *
 * Every exporter (CSV, XLSX, PDF, print) consumes the same `ExportDataset`, so
 * a report is defined once and gets all four formats for free — and the four
 * can never drift apart in column set or ordering.
 */

export const EXPORT_FORMATS = ['xlsx', 'csv', 'pdf', 'print'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === 'string' && (EXPORT_FORMATS as readonly string[]).includes(value);
}

export type ColumnType = 'text' | 'number' | 'date' | 'datetime' | 'percent' | 'boolean';

export interface ColumnDef<Row> {
  key: string;
  header: string;
  type?: ColumnType;
  /** Extracts the raw cell value. Formatting per format is handled downstream. */
  value: (row: Row) => string | number | boolean | Date | null | undefined;
  /** Relative width hint, used by PDF layout and XLSX column sizing. */
  width?: number;
  align?: 'left' | 'right' | 'center';
}

/** One "Filter: value" pair recorded on the export so the output is self-describing. */
export interface AppliedFilter {
  label: string;
  value: string;
}

export interface ExportMeta {
  /** Report title, e.g. "Student progress". */
  title: string;
  subtitle?: string;
  /** Human-readable description of every filter that shaped these rows. */
  filters: AppliedFilter[];
  sort?: string;
  generatedAt: Date;
  generatedBy: string;
  /** Base name for the downloaded file, without extension or timestamp. */
  fileBase: string;
}

export interface ExportDataset<Row = unknown> {
  meta: ExportMeta;
  columns: ColumnDef<Row>[];
  rows: Row[];
  /** Optional summary rows rendered beneath the table (totals, counts). */
  summary?: AppliedFilter[];
}

/** Erases the row generic so datasets of different shapes share one pipeline. */
export type AnyExportDataset = ExportDataset<never> & {
  columns: ColumnDef<never>[];
  rows: never[];
};

export function eraseRowType<Row>(dataset: ExportDataset<Row>): AnyExportDataset {
  return dataset as unknown as AnyExportDataset;
}

export const FORMAT_CONTENT_TYPE: Record<ExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  pdf: 'application/pdf',
  print: 'text/html; charset=utf-8',
};

export const FORMAT_EXTENSION: Record<ExportFormat, string> = {
  xlsx: 'xlsx',
  csv: 'csv',
  pdf: 'pdf',
  print: 'html',
};

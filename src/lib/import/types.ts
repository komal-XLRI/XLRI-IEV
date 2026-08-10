import type { z } from 'zod';
import type { Role } from '@/lib/constants/roles';

export interface ImportColumn {
  /** Field name used in the CSV header and in error paths. */
  field: string;
  label: string;
  required: boolean;
  example: string;
  hint?: string;
}

export interface ImportSpec<Parsed> {
  key: string;
  title: string;
  description: string;
  roles: Role[];
  columns: ImportColumn[];
  /** Validates one raw record. Field errors are reported per row. */
  schema: z.ZodType<Parsed>;
  /** Writes one validated row. Throws to mark the row failed. */
  commit(row: Parsed): Promise<void>;
  /** Optional extra guard across the whole file, e.g. duplicate detection. */
  validateBatch?(rows: Parsed[]): Array<{ index: number; message: string }>;
}

export type RowStatus = 'ok' | 'error' | 'created' | 'failed';

export interface ImportRowResult {
  /** 1-based line number in the uploaded file. */
  line: number;
  status: RowStatus;
  /** Echo of the raw values, for display in the preview table. */
  values: Record<string, string>;
  errors: string[];
}

export interface ImportOutcome {
  datasetKey: string;
  /** True when nothing was written — a validation preview. */
  dryRun: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  createdRows: number;
  failedRows: number;
  results: ImportRowResult[];
  /** File-level problems (no header, empty file, unknown columns). */
  fileErrors: string[];
}

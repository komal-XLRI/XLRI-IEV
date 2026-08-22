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
  /**
   * Writes one validated row. Throws to mark the row failed.
   *
   * Returning which of the two things it did lets the summary say "12 created,
   * 3 updated" rather than counting an overwrite as a creation. A spec that
   * only ever creates can return nothing.
   */
  commit(row: Parsed): Promise<ImportAction | void>;
  /**
   * What committing this row would do, asked during a dry run.
   *
   * The preview is the only thing standing between an administrator and a
   * batch of overwrites, so a spec that can update existing records has to be
   * able to say so *before* the write — a row that reads "ok" and then quietly
   * replaces a record makes the preview a lie by omission.
   */
  preview?(row: Parsed): Promise<ImportPlan | null>;
  /** Optional extra guard across the whole file, e.g. duplicate detection. */
  validateBatch?(rows: Parsed[]): Array<{ index: number; message: string }>;
}

/** What committing a row did to the database. */
export type ImportAction = 'created' | 'updated';

/** What committing a row *would* do, as reported by a dry run. */
export interface ImportPlan {
  action: ImportAction;
  /** Shown against the row, e.g. naming the record about to be replaced. */
  note?: string;
}

export type RowStatus = 'ok' | 'error' | 'created' | 'updated' | 'failed';

export interface ImportRowResult {
  /** 1-based line number in the uploaded file. */
  line: number;
  status: RowStatus;
  /** Echo of the raw values, for display in the preview table. */
  values: Record<string, string>;
  errors: string[];
  /** Non-blocking remarks from the dry run, e.g. "will replace an existing record". */
  notes: string[];
}

export interface ImportOutcome {
  datasetKey: string;
  /** True when nothing was written — a validation preview. */
  dryRun: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  createdRows: number;
  /**
   * Rows that replaced a record that already existed — or, in a dry run, that
   * would replace one.
   */
  updatedRows: number;
  failedRows: number;
  results: ImportRowResult[];
  /** File-level problems (no header, empty file, unknown columns). */
  fileErrors: string[];
}

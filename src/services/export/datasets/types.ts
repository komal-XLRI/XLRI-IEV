import 'server-only';
import type { ColumnDef, ExportDataset } from '@/lib/export/types';
import type { Role } from '@/lib/constants/roles';
import type { SessionUser } from '@/lib/auth/session';
import type { ReportFilters } from '@/validators/reportFilters';

export interface DatasetContext {
  filters: ReportFilters;
  actor: SessionUser;
}

export interface DatasetDefinition<Row = unknown> {
  /** URL segment, e.g. /api/export/student-progress */
  key: string;
  title: string;
  description?: string;
  fileBase: string;
  /** Roles permitted to run this export at all. */
  roles: Role[];
  /** Describes the natural ordering when no explicit sort is requested. */
  defaultSortLabel: string;
  columns: ColumnDef<Row>[];
  load(context: DatasetContext): Promise<Row[]>;
  /** Optional totals appended beneath the table. */
  summarise?: (rows: Row[]) => ExportDataset<Row>['summary'];
}

/** Helper that keeps `Row` inferred from `columns` and `load` together. */
export function defineDataset<Row>(definition: DatasetDefinition<Row>): DatasetDefinition<Row> {
  return definition;
}

export function countSummary<Row>(label: string) {
  return (rows: Row[]) => [{ label, value: String(rows.length) }];
}

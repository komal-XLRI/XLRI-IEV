import 'server-only';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { eraseRowType, type AnyExportDataset } from '@/lib/export/types';
import type { SessionUser } from '@/lib/auth/session';
import type { ReportFilters } from '@/validators/reportFilters';
import { describeFilters, describeSort } from './filterLabels';
import type { DatasetDefinition } from './datasets/types';

import {
  activityCompletionDataset,
  attemptsDataset,
  reviewLogDataset,
  reviewSummaryDataset,
  studentProgressDataset,
  ventureProgressDataset,
} from './datasets/reports';

import {
  facultyDataset,
  mentorsDataset,
  sessionsDataset,
  studentsDataset,
  subjectsDataset,
  supportActivitiesDataset,
  supportParticipationDataset,
  termsDataset,
  venturesDataset,
  ventureActivitiesDataset,
  ventureAttendanceDataset,
  ventureAttendanceConsolidatedDataset,
  workshopAttendanceDataset,
} from './datasets/records';

import {
  myProgressDataset,
  myReviewQueueDataset,
  mySubmissionsDataset,
  myVenturesDataset,
} from './datasets/scoped';

/**
 * Every exportable dataset in the system, keyed by URL segment.
 *
 * Adding a report here gives it Excel, CSV, PDF and Print at once — there is
 * no per-format work, and no way for the formats to disagree about which
 * columns a report has.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the registry is heterogeneous by design; each entry is internally type-safe via defineDataset.
const DATASETS: Record<string, DatasetDefinition<any>> = {
  // Reports
  [studentProgressDataset.key]: studentProgressDataset,
  [ventureProgressDataset.key]: ventureProgressDataset,
  [activityCompletionDataset.key]: activityCompletionDataset,
  [reviewSummaryDataset.key]: reviewSummaryDataset,
  [attemptsDataset.key]: attemptsDataset,
  [reviewLogDataset.key]: reviewLogDataset,

  // Administrative records
  [studentsDataset.key]: studentsDataset,
  [facultyDataset.key]: facultyDataset,
  [mentorsDataset.key]: mentorsDataset,
  [venturesDataset.key]: venturesDataset,
  [ventureActivitiesDataset.key]: ventureActivitiesDataset,
  [supportActivitiesDataset.key]: supportActivitiesDataset,
  [supportParticipationDataset.key]: supportParticipationDataset,
  [ventureAttendanceDataset.key]: ventureAttendanceDataset,
  [ventureAttendanceConsolidatedDataset.key]: ventureAttendanceConsolidatedDataset,
  [workshopAttendanceDataset.key]: workshopAttendanceDataset,
  [subjectsDataset.key]: subjectsDataset,
  [sessionsDataset.key]: sessionsDataset,
  [termsDataset.key]: termsDataset,

  // Caller-scoped
  [myReviewQueueDataset.key]: myReviewQueueDataset,
  [myVenturesDataset.key]: myVenturesDataset,
  [myProgressDataset.key]: myProgressDataset,
  [mySubmissionsDataset.key]: mySubmissionsDataset,
};

export const DATASET_KEYS = Object.keys(DATASETS);

export function getDatasetDefinition(key: string) {
  return DATASETS[key] ?? null;
}

export function listDatasetsForRole(role: SessionUser['role']) {
  return Object.values(DATASETS)
    .filter((dataset) => dataset.roles.includes(role))
    .map((dataset) => ({
      key: dataset.key,
      title: dataset.title,
      description: dataset.description ?? null,
    }));
}

/**
 * Resolves a dataset key into a fully-populated export, enforcing role access
 * and recording the applied filters on the output.
 */
export async function buildDataset(
  key: string,
  actor: SessionUser,
  filters: ReportFilters,
): Promise<AnyExportDataset> {
  const definition = getDatasetDefinition(key);
  if (!definition) throw new NotFoundError(`Unknown export "${key}"`);

  if (!definition.roles.includes(actor.role)) {
    throw new ForbiddenError('You do not have access to this export');
  }

  // Reviewers may only ever export their own scope, whatever the query string
  // says. Overriding here — after the filters were parsed — means a crafted
  // ?facultyId= cannot widen the result set.
  const effective: ReportFilters = { ...filters };
  if (actor.role === 'FACULTY') {
    effective.facultyId = actor.userId;
    effective.mentorId = undefined;
  } else if (actor.role === 'MENTOR') {
    effective.mentorId = actor.userId;
    effective.facultyId = undefined;
  } else if (actor.role === 'STUDENT') {
    effective.studentId = actor.userId;
    effective.studentVentureId = undefined;
  }

  const rows = await definition.load({ filters: effective, actor });
  const generatedAt = new Date();

  return eraseRowType({
    meta: {
      title: definition.title,
      subtitle: definition.description,
      filters: await describeFilters(effective),
      sort: describeSort(effective.sortBy, effective.sortDir, definition.defaultSortLabel),
      generatedAt,
      generatedBy: `${actor.name} (${actor.email})`,
      fileBase: definition.fileBase,
    },
    columns: definition.columns,
    rows,
    summary: definition.summarise?.(rows),
  });
}

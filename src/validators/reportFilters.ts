import { z } from 'zod';
import {
  REVIEWER_TYPES,
  STUDENT_ACTIVITY_STATUSES,
  SUPPORT_ACTIVITY_STATUSES,
  VENTURE_STATUSES,
} from '@/lib/constants/status';
import { ROLES, USER_STATUSES } from '@/lib/constants/roles';
import { objectId } from './common';

/**
 * One filter vocabulary shared by the screens and by the exporters.
 *
 * Because both read the same query string through this schema, an export is
 * guaranteed to reproduce exactly what the page was showing — that is the
 * whole point of putting filter state in the URL rather than in component
 * state.
 */

const optionalId = objectId.optional().catch(undefined);
const optionalText = z.string().trim().max(120).optional().catch(undefined);

/** Unknown/blank enum values fall back to "no filter" instead of erroring. */
function optionalEnum<T extends readonly [string, ...string[]]>(values: T) {
  return z.enum(values).optional().catch(undefined);
}

export const reportFilterSchema = z.object({
  q: optionalText,

  termId: optionalId,
  ventureActivityId: optionalId,
  supportActivityId: optionalId,
  subjectId: optionalId,
  studentId: optionalId,
  facultyId: optionalId,
  mentorId: optionalId,
  studentVentureId: optionalId,

  activityStatus: optionalEnum(STUDENT_ACTIVITY_STATUSES),
  supportStatus: optionalEnum(SUPPORT_ACTIVITY_STATUSES),
  ventureStatus: optionalEnum(VENTURE_STATUSES),
  userStatus: optionalEnum(USER_STATUSES),
  role: optionalEnum(ROLES),
  reviewerType: optionalEnum(REVIEWER_TYPES),
  reviewStatus: optionalEnum(['APPROVED', 'REVISION_REQUIRED', 'REJECTED']),

  /** Inclusive date window, interpreted against each dataset's natural date. */
  dateFrom: z.coerce.date().optional().catch(undefined),
  dateTo: z.coerce.date().optional().catch(undefined),

  batch: optionalText,

  sortBy: z.string().trim().max(60).optional().catch(undefined),
  sortDir: z.enum(['asc', 'desc']).optional().catch(undefined),

  /** Safety valve on very large exports. */
  limit: z.coerce.number().int().min(1).max(20_000).optional().catch(undefined),
});

export type ReportFilters = z.infer<typeof reportFilterSchema>;

/** Parses a URLSearchParams (or plain object) leniently — a bad value is ignored. */
export function parseReportFilters(
  input: URLSearchParams | Record<string, string | string[] | undefined>,
): ReportFilters {
  const raw: Record<string, string> = {};

  if (input instanceof URLSearchParams) {
    for (const [key, value] of input.entries()) {
      if (value !== '') raw[key] = value;
    }
  } else {
    for (const [key, value] of Object.entries(input)) {
      const single = Array.isArray(value) ? value[0] : value;
      if (single !== undefined && single !== '') raw[key] = single;
    }
  }

  return reportFilterSchema.parse(raw);
}

/** Serialises filters back to a query string, dropping empties. */
export function filtersToSearchParams(filters: ReportFilters): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, value instanceof Date ? value.toISOString().slice(0, 10) : String(value));
  }

  return params;
}

export function hasAnyFilter(filters: ReportFilters): boolean {
  return Object.entries(filters).some(
    ([key, value]) =>
      value !== undefined && key !== 'sortBy' && key !== 'sortDir' && key !== 'limit',
  );
}

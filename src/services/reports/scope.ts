import 'server-only';
import type { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/mongoose';
import { StudentVenture, User, VentureActivity } from '@/models';
import { containsPattern } from '@/lib/utils/regex';
import type { ReportFilters } from '@/validators/reportFilters';

/**
 * Translates the shared filter vocabulary into concrete id sets.
 *
 * Reports differ in what they aggregate, but nearly all of them need the same
 * two questions answered first: which ventures are in scope, and which venture
 * activities are in scope. Resolving that once here keeps the individual
 * report queries short and makes filter semantics consistent between them.
 *
 * `null` means "no constraint" and is deliberately distinct from `[]`, which
 * means "constrained, and nothing matched".
 */
export type IdScope = Types.ObjectId[] | null;

export async function resolveVentureScope(filters: ReportFilters): Promise<IdScope> {
  const constrained =
    filters.studentVentureId ||
    filters.studentId ||
    filters.facultyId ||
    filters.mentorId ||
    filters.ventureStatus ||
    filters.q;

  if (!constrained) return null;

  await connectToDatabase();

  const query: Record<string, unknown> = {};
  if (filters.studentVentureId) query._id = filters.studentVentureId;
  if (filters.studentId) query.studentId = filters.studentId;
  if (filters.facultyId) query.facultyId = filters.facultyId;
  if (filters.mentorId) query.mentorId = filters.mentorId;
  if (filters.ventureStatus) query.status = filters.ventureStatus;

  // Free text matches the venture name or the student behind it.
  if (filters.q) {
    const pattern = containsPattern(filters.q);
    const students = await User.find({ role: 'STUDENT', name: pattern })
      .select('_id')
      .lean()
      .exec();

    query.$or = [
      { ventureName: pattern },
      { ventureTitle: pattern },
      { industry: pattern },
      ...(students.length > 0 ? [{ studentId: { $in: students.map((s) => s._id) } }] : []),
    ];
  }

  const ventures = await StudentVenture.find(query).select('_id').lean().exec();
  return ventures.map((venture) => venture._id);
}

export async function resolveActivityScope(filters: ReportFilters): Promise<IdScope> {
  if (!filters.termId && !filters.ventureActivityId) return null;

  await connectToDatabase();

  const query: Record<string, unknown> = {};
  if (filters.termId) query.termId = filters.termId;
  if (filters.ventureActivityId) query._id = filters.ventureActivityId;

  const activities = await VentureActivity.find(query).select('_id').lean().exec();
  return activities.map((activity) => activity._id);
}

/** Merges an id scope into a Mongo query object under `field`. */
export function applyScope(
  query: Record<string, unknown>,
  field: string,
  scope: IdScope,
): Record<string, unknown> {
  if (scope !== null) query[field] = { $in: scope };
  return query;
}

/** Inclusive date-window clause, or undefined when neither bound is set. */
export function dateRangeClause(filters: ReportFilters): { $gte?: Date; $lte?: Date } | undefined {
  if (!filters.dateFrom && !filters.dateTo) return undefined;

  const clause: { $gte?: Date; $lte?: Date } = {};
  if (filters.dateFrom) clause.$gte = startOfDay(filters.dateFrom);
  if (filters.dateTo) clause.$lte = endOfDay(filters.dateTo);
  return clause;
}

function startOfDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0, 0),
  );
}

function endOfDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999),
  );
}

/**
 * Generic in-memory sort for report rows.
 *
 * Reports are assembled from several collections and then reduced, so the
 * final ordering cannot come from a Mongo `.sort()`. Row counts here are
 * bounded by the cohort size, so sorting in memory is fine.
 */
export function sortRows<Row extends object>(
  rows: Row[],
  sortBy: string | undefined,
  sortDir: 'asc' | 'desc' | undefined,
  fallback: (a: Row, b: Row) => number,
): Row[] {
  // An unrecognised sortBy falls back to the report's natural order rather
  // than erroring — the value arrives from a user-editable query string.
  if (!sortBy || !(sortBy in (rows[0] ?? {}))) {
    return [...rows].sort(fallback);
  }

  const direction = sortDir === 'desc' ? -1 : 1;
  const read = (row: Row): unknown => (row as Record<string, unknown>)[sortBy];

  return [...rows].sort((a, b) => {
    const left = read(a);
    const right = read(b);

    if (left === right) return fallback(a, b);
    if (left === null || left === undefined) return 1;
    if (right === null || right === undefined) return -1;

    if (typeof left === 'number' && typeof right === 'number') {
      return (left - right) * direction;
    }
    if (left instanceof Date && right instanceof Date) {
      return (left.getTime() - right.getTime()) * direction;
    }

    return String(left).localeCompare(String(right)) * direction;
  });
}

import 'server-only';
import { connectToDatabase } from '@/lib/db/mongoose';
import { Subject, SupportActivity, Term, User, VentureActivity } from '@/models';
import { formatDate } from '@/lib/utils/dates';
import { humanise } from '@/lib/utils/humanise';
import type { AppliedFilter } from '@/lib/export/types';

// Re-exported so the many server-side call sites keep their existing import.
export { humanise };
import type { ReportFilters } from '@/validators/reportFilters';

/**
 * Turns the raw filter object into the human-readable "Applied filters" block
 * that every export carries.
 *
 * Without this an exported file records `facultyId: 6a76b40f…`, which is
 * useless on a printout. Ids are resolved to names in one batched pass.
 */
export async function describeFilters(filters: ReportFilters): Promise<AppliedFilter[]> {
  await connectToDatabase();

  const [term, ventureActivity, supportActivity, subject, people] = await Promise.all([
    filters.termId ? Term.findById(filters.termId).select('name').lean().exec() : null,
    filters.ventureActivityId
      ? VentureActivity.findById(filters.ventureActivityId)
          .select('activityCode name')
          .lean()
          .exec()
      : null,
    filters.supportActivityId
      ? SupportActivity.findById(filters.supportActivityId)
          .select('activityCode name')
          .lean()
          .exec()
      : null,
    filters.subjectId
      ? Subject.findById(filters.subjectId).select('code name').lean().exec()
      : null,
    resolvePeople(filters),
  ]);

  const applied: AppliedFilter[] = [];
  const push = (label: string, value: string | null | undefined) => {
    if (value) applied.push({ label, value });
  };

  push('Search', filters.q);
  push('Term', term?.name);
  push(
    'Venture Activity',
    ventureActivity ? `${ventureActivity.activityCode} ${ventureActivity.name}` : undefined,
  );
  push(
    'Support Activity',
    supportActivity ? `${supportActivity.activityCode} ${supportActivity.name}` : undefined,
  );
  push('Subject', subject ? `${subject.code} ${subject.name}` : undefined);
  push('Attendance', humanise(filters.attendanceStatus));
  push('Student', people.student);
  push('Faculty', people.faculty);
  push('Mentor', people.mentor);
  push('Batch', filters.batch);
  push('Activity status', humanise(filters.activityStatus));
  push('Support status', humanise(filters.supportStatus));
  push('Venture status', humanise(filters.ventureStatus));
  push('Account status', humanise(filters.userStatus));
  push('Role', humanise(filters.role));
  push('Reviewer type', humanise(filters.reviewerType));
  push('Review decision', humanise(filters.reviewStatus));
  push('Workshop type', humanise(filters.workshopType));
  push('Workshop mode', humanise(filters.workshopMode));
  push('Workshop status', humanise(filters.workshopStatus));

  if (filters.dateFrom || filters.dateTo) {
    push(
      'Date range',
      `${filters.dateFrom ? formatDate(filters.dateFrom) : 'Any'} to ${
        filters.dateTo ? formatDate(filters.dateTo) : 'Any'
      }`,
    );
  }

  if (applied.length === 0) {
    applied.push({ label: 'Filters', value: 'None — all records' });
  }

  return applied;
}

async function resolvePeople(filters: ReportFilters) {
  const ids = [filters.studentId, filters.facultyId, filters.mentorId].filter((id): id is string =>
    Boolean(id),
  );
  if (ids.length === 0) return { student: undefined, faculty: undefined, mentor: undefined };

  const users = await User.find({ _id: { $in: ids } })
    .select('name email')
    .lean()
    .exec();
  const byId = new Map(users.map((user) => [user._id.toString(), `${user.name} (${user.email})`]));

  return {
    student: filters.studentId ? byId.get(filters.studentId) : undefined,
    faculty: filters.facultyId ? byId.get(filters.facultyId) : undefined,
    mentor: filters.mentorId ? byId.get(filters.mentorId) : undefined,
  };
}

/** `REVISION_REQUIRED` → `Revision required` */

/** "Percentage (descending)" — recorded on the export so ordering is explicit. */
export function describeSort(
  sortBy: string | undefined,
  sortDir: 'asc' | 'desc' | undefined,
  fallbackLabel: string,
): string {
  if (!sortBy) return `${fallbackLabel} (default)`;

  const label = sortBy
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase())
    .trim();

  return `${label} (${sortDir === 'desc' ? 'descending' : 'ascending'})`;
}

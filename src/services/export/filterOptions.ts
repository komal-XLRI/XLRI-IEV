import 'server-only';
import { connectToDatabase } from '@/lib/db/mongoose';
import { StudentProfile, Subject, SupportActivity, Term, User, VentureActivity } from '@/models';
import type { FilterOption } from '@/components/filters/FilterBar';

export interface FilterOptions {
  terms: FilterOption[];
  ventureActivities: FilterOption[];
  supportActivities: FilterOption[];
  subjects: FilterOption[];
  students: FilterOption[];
  faculty: FilterOption[];
  mentors: FilterOption[];
  batches: FilterOption[];
}

/** Option lists for the filter bars, loaded in one pass. */
export async function getFilterOptions(): Promise<FilterOptions> {
  await connectToDatabase();

  const [terms, ventureActivities, supportActivities, subjects, users, profiles] =
    await Promise.all([
      Term.find().select('name termNumber').sort({ termNumber: 1 }).lean().exec(),
      VentureActivity.find().select('activityCode name').sort({ order: 1 }).lean().exec(),
      SupportActivity.find().select('activityCode name').sort({ order: 1 }).lean().exec(),
      Subject.find().select('code name').sort({ code: 1 }).lean().exec(),
      User.find({ role: { $in: ['STUDENT', 'FACULTY', 'MENTOR'] }, status: 'ACTIVE' })
        .select('name email role')
        .sort({ name: 1 })
        .lean()
        .exec(),
      StudentProfile.find().select('batch').lean().exec(),
    ]);

  const byRole = (role: string): FilterOption[] =>
    users
      .filter((user) => user.role === role)
      .map((user) => ({ value: user._id.toString(), label: user.name }));

  return {
    terms: terms.map((term) => ({ value: term._id.toString(), label: term.name })),
    ventureActivities: ventureActivities.map((activity) => ({
      value: activity._id.toString(),
      label: `${activity.activityCode} · ${activity.name}`,
    })),
    supportActivities: supportActivities.map((activity) => ({
      value: activity._id.toString(),
      label: `${activity.activityCode} · ${activity.name}`,
    })),
    subjects: subjects.map((subject) => ({
      value: subject._id.toString(),
      label: `${subject.code} · ${subject.name}`,
    })),
    students: byRole('STUDENT'),
    faculty: byRole('FACULTY'),
    mentors: byRole('MENTOR'),
    batches: [...new Set(profiles.map((profile) => profile.batch).filter(Boolean))]
      .sort()
      .map((batch) => ({ value: batch, label: batch })),
  };
}
